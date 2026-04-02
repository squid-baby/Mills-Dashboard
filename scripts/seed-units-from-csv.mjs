/**
 * seed-units-from-csv.mjs — One-time property attribute seed
 *
 * Reads Mills_Dashboard_Property_info_sheet.csv from the project root and
 * upserts all property attributes into the Supabase `units` table.
 *
 * Only structural/physical fields go to Supabase. Access codes (door_code,
 * lockbox_code) and appliance service records stay in the Google Sheet only.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-units-from-csv.mjs [--dry-run]
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, '../Mills_Dashboard_Property_info_sheet.csv');
const DRY_RUN = process.argv.includes('--dry-run');

// CSV header → Supabase column name
// Access codes (Door Codes, Lock Box) are intentionally excluded — Google Sheet only.
const CSV_TO_SUPABASE = {
  'Property':                               'address',
  '# of bedrooms':                          'beds',
  'bathrooms':                              'baths',
  'Washer?':                                'washer',
  'Dryer?':                                 'dryer',
  'dishwasher?':                            'dishwasher',
  'town':                                   'town',
  'type of property':                       'property_type',
  'square feet':                            'sq_ft',
  'gas?':                                   'gas',
  'any utilities that are ALWAYS included': 'utilities',
  'Freeze warning?':                        'freeze_warning',
  'Sump pump?':                             'sump_pump',
  'Breaker box':                            'breaker_box',
  'Air Conditioning':                       'ac_type',
  'Heat Type':                              'heat_type',
  'pets allowed?':                          'pets_allowed',
  'Year built':                             'year_built',
  'Owner':                                  'owner_name',
  'Area':                                   'area',
  'notes':                                  'sheet_notes',
};

const BOOLEAN_COLS = new Set(['washer', 'dryer', 'dishwasher', 'gas', 'freeze_warning', 'sump_pump']);
const INT_COLS     = new Set(['sq_ft']);

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const row = [];
    let inQuote = false, cell = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { row.push(cell.trim()); cell = ''; }
      else { cell += ch; }
    }
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function clean(val) {
  if (!val) return '';
  const s = val.toString().trim();
  return /^[—–-]+$/.test(s) ? '' : s;
}

function toBoolean(val) {
  return /^yes$/i.test(clean(val));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}

const rows = parseCSV(readFileSync(CSV_PATH, 'utf8'));
const headers = rows[0].map(h => h.trim());
console.log(`Read ${rows.length - 1} properties from CSV`);
console.log(`Headers: ${headers.slice(0, 6).join(', ')}...`);

// Build column index map from CSV headers
const colIdx = {};
headers.forEach((h, i) => {
  if (CSV_TO_SUPABASE[h]) colIdx[h] = i;
});

const unmapped = headers.filter(h => h && !CSV_TO_SUPABASE[h]);
if (unmapped.length) console.log(`Skipped CSV columns (not mapped to Supabase): ${unmapped.join(', ')}`);

// Build unit rows
const unitRows = [];
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const address = clean(row[colIdx['Property'] ?? 0]);
  if (!address) continue;

  const unit = { address };
  for (const [csvHeader, supabaseCol] of Object.entries(CSV_TO_SUPABASE)) {
    if (csvHeader === 'Property') continue;
    const idx = colIdx[csvHeader];
    if (idx === undefined) continue;
    const raw = clean(row[idx]);
    if (!raw) continue;

    if (BOOLEAN_COLS.has(supabaseCol)) {
      unit[supabaseCol] = toBoolean(raw);
    } else if (INT_COLS.has(supabaseCol)) {
      const n = parseInt(raw.replace(/,/g, ''), 10);
      if (!isNaN(n)) unit[supabaseCol] = n;
    } else {
      unit[supabaseCol] = raw;
    }
  }
  unitRows.push(unit);
}

console.log(`\nBuilt ${unitRows.length} unit rows`);

if (DRY_RUN) {
  console.log('\n[dry-run] First 3 rows:');
  unitRows.slice(0, 3).forEach(u => console.log(' ', JSON.stringify(u)));
  console.log(`\n[dry-run] Would upsert ${unitRows.length} units into Supabase`);
  console.log('Run without --dry-run to execute.');
  process.exit(0);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Upsert in batches of 50 to avoid payload limits
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
console.log(`\n✓ Seed complete — ${unitRows.length} units updated in Supabase`);
