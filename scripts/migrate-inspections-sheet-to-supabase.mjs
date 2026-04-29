/**
 * migrate-inspections-sheet-to-supabase.mjs — one-time Phase 1A backfill.
 *
 * Reads the "Turnover Inspections" tab from the Neo Google Sheet and writes
 * each row into Supabase as one `inspections` row + N `inspection_items` rows.
 *
 * Behavior:
 *   • Skip + report: addresses that already have an `inspections` row in
 *     Supabase are left untouched (latest-wins safety, per Phase 1A decision).
 *   • Phantom-default filtering: TurnoverTab seeds `blinds`, `bulbs`,
 *     `stove_parts`, `toilet_seats`, `outlets` with a default first row. Rows
 *     that are byte-equal to those seeds are skipped — they were never
 *     touched by a human. (Logic lives in src/lib/inspectionItems.js as the
 *     pure `isPhantomRow` function — reading it confirms the rule.)
 *   • turnover_year: derived from the year of inspection_date.
 *
 * Run:
 *   node --env-file=.env scripts/migrate-inspections-sheet-to-supabase.mjs
 *     # default = dry run, prints diff, no writes
 *   node --env-file=.env scripts/migrate-inspections-sheet-to-supabase.mjs --confirm
 *     # apply for real
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *   GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO
 *
 * The Sheet is not modified. It stays as a frozen backup.
 */

import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { SHEET_TABS } from '../src/config/columns.js';
import { itemsToRows, isPhantomRow } from '../src/lib/inspectionItems.js';

const {
  SUPABASE_URL, SUPABASE_SERVICE_KEY,
  GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO,
} = process.env;
const CONFIRM = process.argv.includes('--confirm');

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO })) {
  if (!v) { console.error(`Error: ${k} must be set in .env`); process.exit(1); }
}

console.log(CONFIRM ? '✍️  CONFIRM mode — Supabase writes will occur\n' : '🔎 DRY RUN — no Supabase writes will occur (pass --confirm to apply)\n');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

// ─── Read the Sheet ──────────────────────────────────────────────────────────
const TAB = SHEET_TABS.INSPECTIONS;
let rows;
try {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID_PROPERTY_INFO,
    range: `${TAB}!A:G`,
  });
  rows = res.data.values || [];
} catch (err) {
  console.error(`Error reading "${TAB}" tab:`, err.message);
  process.exit(1);
}

if (rows.length < 2) {
  console.log(`No inspection rows in "${TAB}". Nothing to migrate.`);
  process.exit(0);
}

const header = rows[0];
console.log(`Read ${rows.length - 1} inspection row(s) from "${TAB}".`);
console.log(`Header: ${JSON.stringify(header)}\n`);

// ─── Read existing Supabase inspections (skip set) ───────────────────────────
const { data: existingInsp, error: fetchErr } = await supabase
  .from('inspections')
  .select('unit_address')
  .not('unit_address', 'is', null);
if (fetchErr) { console.error('Error reading existing inspections:', fetchErr.message); process.exit(1); }
const existingAddresses = new Set((existingInsp || []).map(r => r.unit_address));
console.log(`Supabase already has ${existingAddresses.size} inspection row(s) with unit_address set.\n`);

// ─── Plan ────────────────────────────────────────────────────────────────────
//
// One row per inspection. Schema: Timestamp | Address | Inspector | Date |
// OverallCondition | OverallNotes | ItemsJSON
const plan = [];
let skippedExisting = 0;
let skippedNoAddress = 0;
let skippedBadJson = 0;

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const address = (r[1] || '').toString().trim();
  if (!address) { skippedNoAddress++; continue; }
  if (existingAddresses.has(address)) { skippedExisting++; continue; }

  let items = {};
  try { items = JSON.parse(r[6] || '{}'); }
  catch { skippedBadJson++; continue; }

  const inspectionDate = (r[3] || '').toString().trim();
  const turnoverYear = parseInt((inspectionDate.match(/^(\d{4})/) || [])[1], 10) || null;

  // Drop phantom seed rows from the items blob before persisting it. We mutate
  // a copy so the original Sheet is untouched.
  const cleanedItems = stripPhantoms(items);

  const itemRows = itemsToRows(cleanedItems, address, { skipPhantoms: true });
  const phantomCount =
    itemsToRows(items, address, { skipPhantoms: false }).length - itemRows.length;

  plan.push({
    address,
    inspector:        (r[2] || '').toString().trim(),
    inspection_date:  inspectionDate,
    overall_condition:(r[4] || '').toString().trim(),
    overall_notes:    (r[5] || '').toString().trim(),
    items_json:       cleanedItems,
    status:           'complete',
    turnover_year:    turnoverYear,
    itemRows,
    phantomCount,
  });
}

// ─── Print the plan ──────────────────────────────────────────────────────────
console.log(`Plan: ${plan.length} inspection(s) to backfill, ` +
            `${skippedExisting} skipped (already in Supabase), ` +
            `${skippedNoAddress} skipped (no address), ` +
            `${skippedBadJson} skipped (bad JSON).\n`);

if (plan.length === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

console.log('Per-unit diff:');
for (const p of plan) {
  console.log(`  • ${p.address}`);
  console.log(`      inspector="${p.inspector}" date="${p.inspection_date}" condition="${p.overall_condition}" year=${p.turnover_year}`);
  console.log(`      → 1 inspection row + ${p.itemRows.length} inspection_items (${p.phantomCount} phantom rows skipped)`);
}

if (!CONFIRM) {
  console.log('\n(dry run — no writes. Re-run with --confirm to apply.)');
  process.exit(0);
}

// ─── Apply ───────────────────────────────────────────────────────────────────
console.log('\nApplying...');
let inspectionsInserted = 0;
let itemsInserted = 0;
const failures = [];

for (const p of plan) {
  try {
    const { data: insp, error: iErr } = await supabase
      .from('inspections')
      .insert({
        unit_address:      p.address,
        inspector:         p.inspector,
        inspection_date:   p.inspection_date || null,
        overall_condition: p.overall_condition,
        overall_notes:     p.overall_notes,
        items_json:        p.items_json,
        status:            p.status,
        turnover_year:     p.turnover_year,
      })
      .select('id')
      .single();
    if (iErr) throw new Error(`insert inspection: ${iErr.message}`);
    inspectionsInserted++;

    if (p.itemRows.length > 0) {
      const itemRowsWithFk = p.itemRows.map(r => ({ ...r, inspection_id: insp.id }));
      const { error: itErr } = await supabase
        .from('inspection_items')
        .insert(itemRowsWithFk);
      if (itErr) throw new Error(`insert inspection_items: ${itErr.message}`);
      itemsInserted += p.itemRows.length;
    }
    console.log(`  ✓ ${p.address}`);
  } catch (err) {
    failures.push({ address: p.address, error: err.message });
    console.log(`  ✗ ${p.address} — ${err.message}`);
  }
}

console.log(`\nDone. Inserted ${inspectionsInserted} inspection(s) and ${itemsInserted} item(s).`);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  • ${f.address}: ${f.error}`);
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripPhantoms(items) {
  if (!items || typeof items !== 'object') return {};
  const out = { ...items };
  // Only the seeded array categories get filtered. detectors / keys /
  // customItems / paintRows / conditions are left alone — those rows are
  // never seeded by the UI, so anything saved there is real.
  const keyMap = {
    blinds:       'blinds',
    bulbs:        'bulbs',
    stoveParts:   'stove_parts',
    toiletSeats:  'toilet_seats',
    outlets:      'outlets',
  };
  for (const [itemsKey, category] of Object.entries(keyMap)) {
    if (Array.isArray(items[itemsKey])) {
      out[itemsKey] = items[itemsKey].filter(row => !isPhantomRow(row, category));
    }
  }
  return out;
}

