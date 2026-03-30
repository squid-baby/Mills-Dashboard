/**
 * sync-from-numbers.mjs
 * Reads exported CSVs from the Numbers file and upserts into Supabase.
 * Run: node scripts/sync-from-numbers.mjs
 *
 * Expects env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY
 * CSV paths passed as args or defaults below.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

// ─── Column indices (updated for new Numbers layout) ─────────────────────────
const S1 = {
  PROPERTY:     0,
  RESIDENT:     1,
  EMAIL:        2,
  PHONE:        3,  // NEW
  LEASE_END:    4,  // was 3
  MOVE_OUT:     5,  // NEW
  STATUS:       6,
  LEASE_SIGNED: 7,
  DEPOSIT_PAID: 8,
  NOTES:        9,
  NEXT_RESIDENT:10,
  NEXT_EMAIL:   11,
  NEXT_PHONE:   12,
  NEXT_MOVE_IN: 13, // NEW (Next Residents Move In Date)
  OWNER:        17, // was 16
  AREA:         18, // was 17
};

const S2 = {
  PROPERTY:      0,
  BEDS:          1,
  BATHS:         2,
  UTILITIES:     10,
  PROPERTY_TYPE: 7,
  SQ_FT:         8,
  FREEZE_WARNING:11,
  PETS:          18,
  AREA:          24,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

function yn(val) {
  return (val || '').toString().trim().toLowerCase() === 'yes';
}

function parseDate(val) {
  const s = clean(val);
  if (!s) return null;
  const [m, d, y] = s.split('/').map(Number);
  if (!m || !d || !y) return null;
  const year = y < 100 ? 2000 + y : y;
  return `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────
const sheet1Path = process.argv[2] || '/tmp/mills_export/2025-26 renewals-2019-20 Tenants.csv';
const sheet2Path = process.argv[3] || '/tmp/mills_export/property info-Property Information.csv';

console.log('Reading CSVs...');
const sheet1Csv = readFileSync(resolve(sheet1Path), 'utf8');
const sheet2Csv = readFileSync(resolve(sheet2Path), 'utf8');

const sheet1Rows = parseCSV(sheet1Csv);
const sheet2Rows = parseCSV(sheet2Csv);
console.log(`  Sheet1: ${sheet1Rows.length - 1} data rows`);
console.log(`  Sheet2: ${sheet2Rows.length - 1} data rows`);

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Build property info lookup from Sheet2
const propInfo = {};
for (let i = 1; i < sheet2Rows.length; i++) {
  const row = sheet2Rows[i];
  const addr = clean(row[S2.PROPERTY]);
  if (!addr) continue;
  propInfo[addr] = {
    address: addr,
    beds: clean(row[S2.BEDS]) || null,
    baths: parseFloat(row[S2.BATHS]) || null,
    utilities: clean(row[S2.UTILITIES]),
    property_type: clean(row[S2.PROPERTY_TYPE]),
    sq_ft: parseInt(row[S2.SQ_FT], 10) || null,
    freeze_warning: yn(row[S2.FREEZE_WARNING]),
    pets_allowed: clean(row[S2.PETS]),
    area: clean(row[S2.AREA]),
  };
}

// Group Sheet1 rows by address
const groups = new Map();
for (let i = 1; i < sheet1Rows.length; i++) {
  const row = sheet1Rows[i];
  const addr = clean(row[S1.PROPERTY]);
  if (!addr) continue;
  if ((row[S1.RESIDENT] || '').trim().toLowerCase() === 'airbnb') continue;
  if (!groups.has(addr)) groups.set(addr, []);
  groups.get(addr).push(row);
}

console.log(`\nFound ${groups.size} units in Sheet1, ${Object.keys(propInfo).length} in Sheet2`);

// Build unit rows
const unitRows = [];
for (const [address, rows] of groups) {
  const info = propInfo[address] || {};
  const owner = rows.map(r => clean(r[S1.OWNER])).find(v => v) || '';
  const area = rows.map(r => clean(r[S1.AREA])).find(v => v) || info.area || '';
  unitRows.push({
    address,
    beds: info.beds ?? null,
    baths: info.baths ?? null,
    area,
    owner_name: owner,
    utilities: info.utilities || '',
    property_type: info.property_type || '',
    sq_ft: info.sq_ft ?? null,
    freeze_warning: info.freeze_warning ?? false,
    pets_allowed: info.pets_allowed || '',
  });
}
// Also add units that are only in Sheet2
for (const [addr, info] of Object.entries(propInfo)) {
  if (!groups.has(addr)) {
    unitRows.push({
      address: addr,
      beds: info.beds ?? null,
      baths: info.baths ?? null,
      area: info.area || '',
      owner_name: '',
      utilities: info.utilities || '',
      property_type: info.property_type || '',
      sq_ft: info.sq_ft ?? null,
      freeze_warning: info.freeze_warning ?? false,
      pets_allowed: info.pets_allowed || '',
    });
  }
}

console.log(`\nUpserting ${unitRows.length} units...`);
const { error: unitErr } = await sb.from('units').upsert(unitRows, { onConflict: 'address' });
if (unitErr) { console.error('units upsert failed:', unitErr.message); process.exit(1); }
console.log('  ✓ units done');

// Fetch unit ID map
const { data: unitData, error: fetchErr } = await sb.from('units').select('id, address');
if (fetchErr) { console.error('fetch units failed:', fetchErr.message); process.exit(1); }
const unitIdMap = Object.fromEntries(unitData.map(u => [u.address, u.id]));

// Delete existing residents/next_residents for synced units
const syncedUnitIds = [...groups.keys()].map(a => unitIdMap[a]).filter(Boolean);
if (syncedUnitIds.length > 0) {
  await sb.from('residents').delete().in('unit_id', syncedUnitIds);
  await sb.from('next_residents').delete().in('unit_id', syncedUnitIds);
}

// Build resident rows
const residentRows = [];
const nextResidentRows = [];

for (const [address, rows] of groups) {
  const unitId = unitIdMap[address];
  if (!unitId) continue;
  const seenKeys = new Set();

  for (const row of rows) {
    const name = clean(row[S1.RESIDENT]);
    if (!name) continue;
    residentRows.push({
      unit_id: unitId,
      name,
      email: clean(row[S1.EMAIL]),
      phone: clean(row[S1.PHONE]),
      status: clean(row[S1.STATUS]).toLowerCase() || 'unknown',
      lease_end: parseDate(row[S1.LEASE_END]),
      move_out_date: parseDate(row[S1.MOVE_OUT]),
      lease_signed: yn(row[S1.LEASE_SIGNED]),
      deposit_paid: yn(row[S1.DEPOSIT_PAID]),
      notes: clean(row[S1.NOTES]),
    });

    const nextName = clean(row[S1.NEXT_RESIDENT]);
    const nextEmail = clean(row[S1.NEXT_EMAIL]);
    if (nextName) {
      const key = nextEmail || nextName;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        nextResidentRows.push({
          unit_id: unitId,
          name: nextName,
          email: nextEmail,
          phone: clean(row[S1.NEXT_PHONE]),
          move_in_date: parseDate(row[S1.NEXT_MOVE_IN]),
        });
      }
    }
  }
}

console.log(`Inserting ${residentRows.length} residents...`);
if (residentRows.length > 0) {
  const { error: resErr } = await sb.from('residents').insert(residentRows);
  if (resErr) {
    if (resErr.message.includes('column') && resErr.message.includes('does not exist')) {
      console.error('\n⚠️  Missing columns in Supabase. Run this SQL in your Supabase SQL editor:');
      console.error(`
ALTER TABLE residents ADD COLUMN IF NOT EXISTS phone text DEFAULT '';
ALTER TABLE residents ADD COLUMN IF NOT EXISTS move_out_date date;
ALTER TABLE next_residents ADD COLUMN IF NOT EXISTS move_in_date date;
`);
      console.error('Then re-run this script.\n');
    } else {
      console.error('residents insert failed:', resErr.message);
    }
    process.exit(1);
  }
  console.log('  ✓ residents done');
}

console.log(`Inserting ${nextResidentRows.length} next_residents...`);
if (nextResidentRows.length > 0) {
  const { error: nrErr } = await sb.from('next_residents').insert(nextResidentRows);
  if (nrErr) {
    if (nrErr.message.includes('column') && nrErr.message.includes('does not exist')) {
      console.error('\n⚠️  Missing columns in Supabase. Run this SQL in your Supabase SQL editor:');
      console.error(`
ALTER TABLE residents ADD COLUMN IF NOT EXISTS phone text DEFAULT '';
ALTER TABLE residents ADD COLUMN IF NOT EXISTS move_out_date date;
ALTER TABLE next_residents ADD COLUMN IF NOT EXISTS move_in_date date;
`);
      console.error('Then re-run this script.\n');
    } else {
      console.error('next_residents insert failed:', nrErr.message);
    }
    process.exit(1);
  }
  console.log('  ✓ next_residents done');
}

console.log(`\n✓ Sync complete — ${unitRows.length} units, ${residentRows.length} residents, ${nextResidentRows.length} next residents`);
