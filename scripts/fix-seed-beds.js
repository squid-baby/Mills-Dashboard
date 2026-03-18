#!/usr/bin/env node
/**
 * Patches units-seed.json with correct bed/bath/utilities/area values
 * from Sheet2.csv (Property Info).
 *
 * Run: node scripts/fix-seed-beds.js
 *
 * Sheet2.csv is gitignored — keep it that way. This script reads it locally
 * and only writes non-sensitive fields to the seed.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Sensitive columns we deliberately NEVER write to seed or DB ─────────────
// Col 21: Door Codes
// Col 26: Lock Box and Key Number
// These stay in the gitignored CSV only.

// ─── Column indices for Sheet2 ───────────────────────────────────────────────
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

// ─── Simple CSV parser (handles quoted fields with commas) ───────────────────
function parseCSV(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const row = [];
    let inQuote = false;
    let cell = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        row.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function parseBeds(val) {
  if (!val) return null;
  const v = val.toString().trim();
  if (!v) return null;
  // "Studio", "1, with an office" etc — keep as string
  const n = parseInt(v, 10);
  return isNaN(n) ? v : n;
}

function parseBaths(val) {
  if (!val) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

// ─── Manual aliases for addresses that differ between seed and Sheet2 ────────
// key = seed address (normalized), value = Sheet2 address (normalized)
const ALIASES = {
  '110 fidelity':  '110 fidelity st',
  '207 oak ave':   '207 a oak ave',   // Sheet2 has "207  A Oak Ave"
};

// ─── Paths ───────────────────────────────────────────────────────────────────
const CSV_PATH  = '/Users/millsrentals/Downloads/Sheet2.csv';
const SEED_PATH = join(__dirname, '../src/data/units-seed.json');

// ─── Normalize address for fuzzy matching ────────────────────────────────────
// Lowercases, collapses whitespace, removes trailing punctuation
function normalize(addr) {
  return addr.toLowerCase().replace(/\s+/g, ' ').replace(/[.,]+$/, '').trim();
}

// ─── Build property lookup from Sheet2 ───────────────────────────────────────
const csvRows = parseCSV(readFileSync(CSV_PATH, 'utf8'));
const propInfo = {};        // exact key
const propInfoNorm = {};    // normalized key → exact key
for (let i = 1; i < csvRows.length; i++) {
  const row = csvRows[i];
  const addr = row[S2.PROPERTY];
  if (!addr) continue;
  const entry = {
    beds:         parseBeds(row[S2.BEDS]),
    baths:        parseBaths(row[S2.BATHS]),
    utilities:    row[S2.UTILITIES] || '',
    area:         row[S2.AREA]      || '',
    propertyType: row[S2.PROPERTY_TYPE] || '',
    sqFt:         parseInt(row[S2.SQ_FT], 10) || null,
    freezeWarning: (row[S2.FREEZE_WARNING] || '').toLowerCase() === 'yes',
    petsAllowed:  row[S2.PETS] || '',
  };
  propInfo[addr] = entry;
  propInfoNorm[normalize(addr)] = entry;
}

// ─── Patch the seed ───────────────────────────────────────────────────────────
const units = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
let updated = 0;
const missing = [];

for (const unit of units) {
  const normAddr = normalize(unit.address);
  const aliasKey = ALIASES[normAddr] || normAddr;
  const info = propInfo[unit.address] || propInfoNorm[aliasKey] || propInfoNorm[normAddr];
  if (!info) {
    missing.push(unit.address);
    continue;
  }

  const changed = [];

  if (info.beds !== null && info.beds !== unit.beds) {
    changed.push(`beds: ${unit.beds} → ${info.beds}`);
    unit.beds = info.beds;
  }
  if (info.baths !== null && info.baths !== unit.baths) {
    changed.push(`baths: ${unit.baths} → ${info.baths}`);
    unit.baths = info.baths;
  }
  if (info.utilities && info.utilities !== unit.utilities) {
    changed.push(`utilities updated`);
    unit.utilities = info.utilities;
  }
  if (info.area && !unit.area) {
    changed.push(`area: → ${info.area}`);
    unit.area = info.area;
  }
  // Enrich with new fields (safe, non-sensitive)
  unit.propertyType  = info.propertyType  || unit.propertyType  || '';
  unit.sqFt          = info.sqFt          ?? unit.sqFt          ?? null;
  unit.freezeWarning = info.freezeWarning ?? unit.freezeWarning ?? false;
  unit.petsAllowed   = info.petsAllowed   || unit.petsAllowed   || '';

  if (changed.length > 0) {
    console.log(`  ✓ ${unit.address}: ${changed.join(', ')}`);
    updated++;
  }
}

writeFileSync(SEED_PATH, JSON.stringify(units, null, 2));

console.log(`\nDone. ${updated} units updated.`);
if (missing.length) {
  console.log(`\nNo Sheet2 match for ${missing.length} units:`);
  missing.forEach(a => console.log(`  ⚠ ${a}`));
}
