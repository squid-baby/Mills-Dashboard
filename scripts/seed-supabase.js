#!/usr/bin/env node
/**
 * One-time script: seeds Supabase from the local CSV files.
 * Run: node scripts/seed-supabase.js
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from .env
 * Sheet1.csv and Sheet2.csv must be in ~/Downloads/
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load .env manually (no dotenv dependency needed)
const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const env = Object.fromEntries(
  envText.split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map((p, i) => i === 0 ? p.trim() : l.slice(l.indexOf('=') + 1).trim()))
);

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Column indices ───────────────────────────────────────────────────────────
const S1 = {
  PROPERTY: 0, RESIDENT: 1, EMAIL: 2, LEASE_END: 3,
  STATUS: 6, LEASE_SIGNED: 7, DEPOSIT_PAID: 8, NOTES: 9,
  NEXT_RESIDENT: 10, NEXT_EMAIL: 11, NEXT_PHONE: 12,
  OWNER: 16, AREA: 17,
};
const S2 = {
  PROPERTY: 0, BEDS: 1, BATHS: 2, UTILITIES: 10,
  PROPERTY_TYPE: 7, SQ_FT: 8, FREEZE_WARNING: 11, PETS: 18, AREA: 24,
};

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
function yn(val) { return (val || '').toString().trim().toLowerCase() === 'yes'; }
function parseDate(val) {
  const s = clean(val);
  if (!s) return null;
  const parts = s.split('/').map(Number);
  if (parts.length < 3) return null;
  const [m, d, y] = parts;
  const year = y < 100 ? 2000 + y : y;
  return `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// ─── Load CSVs ────────────────────────────────────────────────────────────────
const DOWNLOADS = '/Users/millsrentals/Downloads';
const sheet1Rows = parseCSV(readFileSync(`${DOWNLOADS}/Sheet1.csv`, 'utf8'));
const sheet2Rows = parseCSV(readFileSync(`${DOWNLOADS}/Sheet2.csv`, 'utf8'));

console.log(`Sheet1: ${sheet1Rows.length - 1} rows`);
console.log(`Sheet2: ${sheet2Rows.length - 1} rows`);

// ─── Build property info from Sheet2 (no sensitive cols) ─────────────────────
const propInfo = {};
for (let i = 1; i < sheet2Rows.length; i++) {
  const row = sheet2Rows[i];
  const addr = clean(row[S2.PROPERTY]);
  if (!addr) continue;
  propInfo[addr] = {
    address:       addr,
    beds:          clean(row[S2.BEDS]) || null,
    baths:         parseFloat(row[S2.BATHS]) || null,
    utilities:     clean(row[S2.UTILITIES]),
    property_type: clean(row[S2.PROPERTY_TYPE]),
    sq_ft:         parseInt(row[S2.SQ_FT], 10) || null,
    freeze_warning: yn(row[S2.FREEZE_WARNING]),
    pets_allowed:  clean(row[S2.PETS]),
    area:          clean(row[S2.AREA]),
    // Columns 21 (door codes) and 26 (lock box) deliberately excluded
  };
}

// ─── Group Sheet1 rows by address ────────────────────────────────────────────
const groups = new Map();
for (let i = 1; i < sheet1Rows.length; i++) {
  const row = sheet1Rows[i];
  const addr = clean(row[S1.PROPERTY]);
  if (!addr) continue;
  if ((row[S1.RESIDENT] || '').trim().toLowerCase() === 'airbnb') continue;
  if (!groups.has(addr)) groups.set(addr, []);
  groups.get(addr).push(row);
}

// ─── Build unit rows ──────────────────────────────────────────────────────────
const unitRows = [];
for (const [address, rows] of groups) {
  const info = propInfo[address] || {};
  const owner = rows.map(r => clean(r[S1.OWNER])).find(v => v) || '';
  const area  = rows.map(r => clean(r[S1.AREA])).find(v => v) || info.area || '';
  unitRows.push({
    address,
    beds:          info.beds          ?? null,
    baths:         info.baths         ?? null,
    area,
    owner_name:    owner,
    utilities:     info.utilities     || '',
    property_type: info.property_type || '',
    sq_ft:         info.sq_ft         ?? null,
    freeze_warning: info.freeze_warning ?? false,
    pets_allowed:  info.pets_allowed  || '',
  });
}
// Also add Sheet2-only properties (no current residents)
for (const [addr, info] of Object.entries(propInfo)) {
  if (!groups.has(addr)) {
    unitRows.push({
      address: addr, beds: info.beds ?? null, baths: info.baths ?? null,
      area: info.area || '', owner_name: '', utilities: info.utilities || '',
      property_type: info.property_type || '', sq_ft: info.sq_ft ?? null,
      freeze_warning: info.freeze_warning ?? false, pets_allowed: info.pets_allowed || '',
    });
  }
}

// ─── Upsert units ─────────────────────────────────────────────────────────────
console.log(`\nUpserting ${unitRows.length} units...`);
const { error: unitErr } = await supabase
  .from('units')
  .upsert(unitRows, { onConflict: 'address' });
if (unitErr) { console.error('units error:', unitErr.message); process.exit(1); }
console.log(`✓ ${unitRows.length} units upserted`);

// ─── Fetch unit IDs ───────────────────────────────────────────────────────────
const { data: unitData, error: fetchErr } = await supabase.from('units').select('id, address');
if (fetchErr) { console.error('fetch error:', fetchErr.message); process.exit(1); }
const unitIdMap = Object.fromEntries(unitData.map(u => [u.address, u.id]));

// ─── Clear existing residents for synced units ────────────────────────────────
const syncedIds = [...groups.keys()].map(a => unitIdMap[a]).filter(Boolean);
if (syncedIds.length > 0) {
  await supabase.from('residents').delete().in('unit_id', syncedIds);
  await supabase.from('next_residents').delete().in('unit_id', syncedIds);
}

// ─── Build + insert residents ─────────────────────────────────────────────────
const residentRows = [];
const nextResidentRows = [];

for (const [address, rows] of groups) {
  const unitId = unitIdMap[address];
  if (!unitId) { console.warn(`  ⚠ No unit ID for: ${address}`); continue; }

  const seenEmails = new Set();
  for (const row of rows) {
    const name = clean(row[S1.RESIDENT]);
    if (!name) continue;

    residentRows.push({
      unit_id: unitId, name,
      email:        clean(row[S1.EMAIL]),
      status:       clean(row[S1.STATUS]).toLowerCase() || 'unknown',
      lease_end:    parseDate(row[S1.LEASE_END]),
      lease_signed: yn(row[S1.LEASE_SIGNED]),
      deposit_paid: yn(row[S1.DEPOSIT_PAID]),
      notes:        clean(row[S1.NOTES]),
    });

    const nextName  = clean(row[S1.NEXT_RESIDENT]);
    const nextEmail = clean(row[S1.NEXT_EMAIL]);
    if (nextName) {
      const key = nextEmail || nextName;
      if (!seenEmails.has(key)) {
        seenEmails.add(key);
        nextResidentRows.push({
          unit_id: unitId, name: nextName,
          email: nextEmail, phone: clean(row[S1.NEXT_PHONE]),
        });
      }
    }
  }
}

console.log(`Inserting ${residentRows.length} residents...`);
const { error: resErr } = await supabase.from('residents').insert(residentRows);
if (resErr) { console.error('residents error:', resErr.message); process.exit(1); }
console.log(`✓ ${residentRows.length} residents inserted`);

if (nextResidentRows.length > 0) {
  const { error: nrErr } = await supabase.from('next_residents').insert(nextResidentRows);
  if (nrErr) { console.error('next_residents error:', nrErr.message); process.exit(1); }
  console.log(`✓ ${nextResidentRows.length} next residents inserted`);
}

// ─── Log the sync ─────────────────────────────────────────────────────────────
await supabase.from('sync_log').insert({
  source: 'csv', status: 'success',
  units_upserted: unitRows.length,
  residents_upserted: residentRows.length,
});

console.log('\nDone. Supabase is seeded.');
