/**
 * sync-property-cache.mjs — Property attribute sync (Google Sheet → Supabase)
 *
 * Reads the "property info" tab of the Property Info Google Sheet and upserts
 * structural property attributes into the Supabase `units` table.
 *
 * Run alongside sync-from-numbers.mjs on a schedule, or manually after editing
 * property details in the Google Sheet.
 *
 * Only structural fields go to Supabase. Access codes (door_code, lockbox_code)
 * and appliance service records stay in the Google Sheet only — they are NOT
 * written to Supabase by this script.
 *
 * Usage:
 *   node --env-file=.env scripts/sync-property-cache.mjs [--dry-run]
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO
 */

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { HEADER_TO_FIELD } from '../src/config/columns.js';

const DRY_RUN = process.argv.includes('--dry-run');

// Fields that belong in Supabase `units` (subset of all Google Sheet fields).
// Everything else (access codes, appliance dates, paint, etc.) stays Sheet-only.
const SUPABASE_COLS = new Set([
  'address', 'beds', 'baths', 'town', 'property_type', 'sq_ft',
  'utilities', 'owner_name', 'area', 'washer', 'dryer', 'dishwasher',
  'gas', 'freeze_warning', 'sump_pump', 'breaker_box', 'ac_type',
  'heat_type', 'pets_allowed', 'year_built', 'sheet_notes',
]);

const BOOLEAN_COLS = new Set(['washer', 'dryer', 'dishwasher', 'gas', 'freeze_warning', 'sump_pump']);
const INT_COLS     = new Set(['sq_ft']);

function clean(val) {
  if (!val) return '';
  const s = val.toString().trim();
  return /^[—–-]+$/.test(s) ? '' : s;
}

function toBoolean(val) {
  return /^yes$/i.test(clean(val));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const { SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}
if (!GOOGLE_SERVICE_ACCOUNT_JSON || !SHEET_ID_PROPERTY_INFO) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_JSON and SHEET_ID_PROPERTY_INFO must be set');
  process.exit(1);
}

const t0 = Date.now();
console.log('Reading Property Info Google Sheet...');

const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

const res = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID_PROPERTY_INFO,
  range: 'property info!A:AZ',
});

const allRows = res.data.values || [];
if (allRows.length < 2) {
  console.error('No data rows found in Google Sheet');
  process.exit(1);
}

const gHeaders = allRows[0].map(h => h.trim());
console.log(`  ${gHeaders.length} columns, ${allRows.length - 1} property rows`);

// Build header → column index map (only for Supabase-bound fields)
const gColIdx = {};
gHeaders.forEach((h, i) => {
  const field = HEADER_TO_FIELD[h];
  if (field && SUPABASE_COLS.has(field)) gColIdx[field] = i;
});

const addrColIdx = gHeaders.findIndex(h => h === 'Property');
if (addrColIdx === -1) {
  console.error('Could not find "Property" column in sheet');
  process.exit(1);
}

// Build unit rows from sheet data
const unitRows = [];
for (let i = 1; i < allRows.length; i++) {
  const row = allRows[i];
  const address = clean(row[addrColIdx]);
  if (!address) continue;

  const unit = { address };
  for (const [field, colI] of Object.entries(gColIdx)) {
    if (field === 'address') continue;
    const raw = clean(row[colI]);
    if (!raw) continue;

    if (BOOLEAN_COLS.has(field)) {
      unit[field] = toBoolean(raw);
    } else if (INT_COLS.has(field)) {
      const n = parseInt(raw.replace(/,/g, ''), 10);
      if (!isNaN(n)) unit[field] = n;
    } else {
      unit[field] = raw;
    }
  }
  unitRows.push(unit);
}

console.log(`  Built ${unitRows.length} unit rows`);

if (DRY_RUN) {
  console.log('\n[dry-run] First 3 rows:');
  unitRows.slice(0, 3).forEach(u => console.log(' ', JSON.stringify(u)));
  console.log(`\n[dry-run] Would upsert ${unitRows.length} units into Supabase`);
  console.log('Run without --dry-run to execute.');
  process.exit(0);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BATCH = 50;
let done = 0;
for (let i = 0; i < unitRows.length; i += BATCH) {
  const batch = unitRows.slice(i, i + BATCH);
  const { error } = await sb.from('units').upsert(batch, { onConflict: 'address' });
  if (error) {
    console.error(`  ✗ Batch ${Math.floor(i / BATCH) + 1} failed:`, error.message);
    process.exit(1);
  }
  done += batch.length;
  process.stdout.write(`\r  Upserted ${done}/${unitRows.length} units...`);
}
console.log(`\n✓ Property cache sync complete — ${unitRows.length} units | ${Date.now() - t0}ms`);
