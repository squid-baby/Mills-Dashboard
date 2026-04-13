/**
 * sync-from-numbers.mjs
 * Reads exported CSVs from the Numbers file and upserts into Supabase.
 * Run: node scripts/sync-from-numbers.mjs
 *
 * Expects env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY
 * CSV paths passed as args or defaults below.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

// ─── Column indices (updated April 2026 — Move Out moved to col 8, new col 13 inserted) ─
const S1 = {
  PROPERTY:     0,
  RESIDENT:     1,
  EMAIL:        2,
  PHONE:        3,
  LEASE_END:    4,
  STATUS:       5,  // was 6
  LEASE_SIGNED: 6,  // was 7
  DEPOSIT_PAID: 7,  // was 8
  MOVE_OUT:     8,  // was 5 (col moved; "Next year's lease end date" inserted at 13)
  NOTES:        9,
  NEXT_RESIDENT:10,
  NEXT_EMAIL:   11,
  NEXT_PHONE:   12,
  NEXT_MOVE_IN: 14, // was 13 (shifted by new col 13 "Next year's lease end date")
  OWNER:        17,
  AREA:         18,
};

// S2 (Sheet 2 / property info) removed — property attributes now owned by
// the Property Info Google Sheet and synced to Supabase via sync-property-cache.mjs.

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Normalize addresses for matching: lowercase, collapse spaces, trim.
// "207 B Oak Ave" and "207 B Oak ave" → "207 b oak ave"
function normalizeAddr(addr) {
  return (addr || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

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
  // ISO from numbers-parser: "2026-07-31 00:00:00" or "2026-07-31"
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  // M/D/YY from manual CSV export
  const [m, d, y] = s.split('/').map(Number);
  if (!m || !d || !y) return null;
  const year = y < 100 ? 2000 + y : y;
  return `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// ─── Export from Numbers via numbers-parser (Python) ─────────────────────────
// NUMBERS_FILE env var allows cloud runners (GitHub Actions) to pass a downloaded path.
// Falls back to the local Google Drive mount for Mac Mini scheduled runs.
const NUMBERS_FILE = process.env.NUMBERS_FILE
  || '/Volumes/One Touch/The_Team_Google_Drive Sync/2025-2026 Renewals_Dashboard.numbers';
const EXPORT_DIR = '/tmp/mills_export';

function exportFromNumbers() {
  console.log('Reading Numbers file directly...');
  mkdirSync(EXPORT_DIR, { recursive: true });

  const pyScript = `
import numbers_parser, csv, os

doc = numbers_parser.Document("${NUMBERS_FILE}")
sheet = doc.sheets[0]  # Sheet 1 only — renewals/tenant data
rows = sheet.tables[0].rows(values_only=True)
rows = [['' if v is None else str(v) for v in row] for row in rows]
fname = os.path.join("${EXPORT_DIR}", "2025-26 renewals.csv")
with open(fname, "w", newline="", encoding="utf-8") as f:
    csv.writer(f).writerows(rows)
print(f"  Wrote {len(rows)} rows -> {fname}")
`;

  try {
    const out = execSync(`python3 -c '${pyScript.replace(/'/g, "'\\''")}'`, {
      timeout: 30000,
      encoding: 'utf8',
    });
    process.stdout.write(out);
    console.log('  ✓ Export complete');
  } catch (err) {
    console.error('  ✗ numbers-parser export failed:', err.stderr || err.message);
    console.error('  Falling back to existing CSVs in', EXPORT_DIR);
  }
}

exportFromNumbers();

// ─── Main ────────────────────────────────────────────────────────────────────
const sheet1Path = process.argv[2] || `${EXPORT_DIR}/2025-26 renewals.csv`;

console.log('Reading CSV...');
const sheet1Csv = readFileSync(resolve(sheet1Path), 'utf8');
const sheet1Rows = parseCSV(sheet1Csv);
console.log(`  Sheet1: ${sheet1Rows.length - 1} data rows`);

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

console.log(`\nFound ${groups.size} units in Sheet1`);

// Fetch existing units from Supabase — property info sheet is the authoritative
// source for what units exist. Numbers sync never creates new unit rows.
const { data: unitData, error: fetchErr } = await sb.from('units').select('id, address, owner_name, area');
if (fetchErr) { console.error('fetch units failed:', fetchErr.message); process.exit(1); }

// Build two lookup maps: exact address → id, and normalized address → id
const unitIdMap = Object.fromEntries(unitData.map(u => [u.address, u.id]));
const normalizedIdMap = Object.fromEntries(unitData.map(u => [normalizeAddr(u.address), u.id]));

// Update owner_name and area for matched units (these come from the Numbers file)
const ownerUpdates = [];
for (const [address, rows] of groups) {
  const owner = rows.map(r => clean(r[S1.OWNER])).find(v => v) || '';
  const area  = rows.map(r => clean(r[S1.AREA])).find(v => v) || '';
  const id = unitIdMap[address] ?? normalizedIdMap[normalizeAddr(address)];
  if (id && (owner || area)) ownerUpdates.push({ id, owner_name: owner || undefined, area: area || undefined });
}
if (ownerUpdates.length > 0) {
  for (const { id, ...fields } of ownerUpdates) {
    await sb.from('units').update(fields).eq('id', id);
  }
  console.log(`  ✓ Updated owner/area for ${ownerUpdates.length} units`);
}

// Resolve Numbers addresses to existing Supabase unit IDs (normalized matching)
const unmatched = [];
const resolvedIds = new Map(); // Numbers address → Supabase unit id
for (const address of groups.keys()) {
  const id = unitIdMap[address] ?? normalizedIdMap[normalizeAddr(address)];
  if (id) {
    resolvedIds.set(address, id);
  } else {
    unmatched.push(address);
  }
}
if (unmatched.length > 0) {
  console.warn(`\n⚠️  ${unmatched.length} address(es) from Numbers not found in Supabase (skipping residents):`);
  unmatched.forEach(a => console.warn(`   "${a}"`));
  console.warn('  Fix: update the address in Amanda\'s Numbers file to match the Property Info sheet exactly.\n');
}

// Delete existing residents/next_residents for synced units
const syncedUnitIds = [...resolvedIds.values()];
if (syncedUnitIds.length > 0) {
  await sb.from('residents').delete().in('unit_id', syncedUnitIds);
  await sb.from('next_residents').delete().in('unit_id', syncedUnitIds);
}

// Build resident rows
const residentRows = [];
const nextResidentRows = [];

for (const [address, rows] of groups) {
  const unitId = resolvedIds.get(address);
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

console.log(`\n✓ Sync complete — ${resolvedIds.size} units matched, ${residentRows.length} residents, ${nextResidentRows.length} next residents`);
