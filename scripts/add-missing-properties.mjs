/**
 * add-missing-properties.mjs — One-time script
 *
 * Appends missing properties to the Property Info Google Sheet:
 *   - 5 Howell St #1–9 (beds/baths from Supabase, owner/area from Numbers file)
 *   - 203 E. Carr St   (owner/area from Numbers file)
 *
 * Usage:
 *   node --env-file=.env scripts/add-missing-properties.mjs [--dry-run]
 */

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GOOGLE_SERVICE_ACCOUNT_JSON || !SHEET_ID_PROPERTY_INFO) {
  console.error('Missing required env vars.'); process.exit(1);
}

// ── Known data from Numbers file ─────────────────────────────────────────────
const KNOWN = {
  '5 Howell St #1': { owner_name: 'Steve and Jim', area: 'Purefoy', town: 'Chapel Hill' },
  '5 Howell St #2': { owner_name: 'Steve and Jim', area: 'Purefoy', town: 'Chapel Hill' },
  '5 Howell St #3': { owner_name: 'Steve and Jim', area: 'Purefoy', town: 'Chapel Hill' },
  '5 Howell St #4': { owner_name: 'Steve and Jim', area: 'Purefoy', town: 'Chapel Hill' },
  '5 Howell St #5': { owner_name: 'Steve and Jim', area: 'Purefoy', town: 'Chapel Hill' },
  '5 Howell St #6': { owner_name: 'Steve and Jim', area: 'Purefoy', town: 'Chapel Hill' },
  '5 Howell St #7': { owner_name: 'Steve and Jim', area: 'Purefoy', town: 'Chapel Hill' },
  '5 Howell St #8': { owner_name: 'Steve and Jim', area: 'Purefoy', town: 'Chapel Hill' },
  '5 Howell St #9': { owner_name: 'Steve and Jim', area: 'Purefoy', town: 'Chapel Hill' },
  '203 E. Carr St': { owner_name: 'Nate', area: 'Carrboro', town: 'Carrboro' },
};

// ── Fetch Supabase data for these units ──────────────────────────────────────
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const addresses = Object.keys(KNOWN);

const { data: supaUnits, error } = await sb
  .from('units')
  .select('address, beds, baths, ac_type, heat_type, property_type, sq_ft, washer, dryer, dishwasher, gas, freeze_warning, sump_pump, year_built, pets_allowed')
  .in('address', addresses);
if (error) { console.error('Supabase fetch failed:', error.message); process.exit(1); }

const supaMap = Object.fromEntries((supaUnits || []).map(u => [u.address, u]));
console.log(`Found ${supaUnits?.length ?? 0} of ${addresses.length} addresses in Supabase`);

// ── Read Google Sheet headers ─────────────────────────────────────────────────
const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

const res = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID_PROPERTY_INFO,
  range: 'property info!A1:AZ1',
});
const headers = (res.data.values?.[0] || []).map(h => h.trim());
console.log(`Sheet has ${headers.length} columns`);

// Build header → column index map
const hIdx = Object.fromEntries(headers.map((h, i) => [h, i]));

// Check which addresses already exist in the sheet
const existingRes = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID_PROPERTY_INFO,
  range: 'property info!A:A',
});
const existingAddrs = new Set(
  (existingRes.data.values || []).slice(1).map(r => (r[0] || '').trim().toLowerCase())
);

// ── Build rows to append ──────────────────────────────────────────────────────
// Field → header mapping (only fields we have data for)
const FIELD_TO_HEADER = {
  address:      'Property',
  beds:         'Bedrooms',
  baths:        'Bathrooms',
  town:         'Town',
  owner_name:   'Owner',
  area:         'Area',
  washer:       'Washer',
  dryer:        'Dryer',
  dishwasher:   'Dishwasher',
  gas:          'Gas',
  ac_type:      'AC Type',
  heat_type:    'Heat Type',
  property_type: 'Property Type',
  sq_ft:        'Sq Ft',
  freeze_warning: 'Freeze Warning',
  sump_pump:    'Sump Pump',
  year_built:   'Year Built',
  pets_allowed: 'Pets Allowed',
};

function boolVal(v) { return v ? 'Yes' : 'No'; }

const rowsToAppend = [];
for (const address of addresses) {
  if (existingAddrs.has(address.toLowerCase())) {
    console.log(`  Skipping "${address}" — already in sheet`);
    continue;
  }

  const supa = supaMap[address] || {};
  const known = KNOWN[address];
  const row = new Array(headers.length).fill('');

  function set(field, value) {
    const header = FIELD_TO_HEADER[field];
    if (!header) return;
    const idx = hIdx[header];
    if (idx !== undefined && value !== null && value !== undefined && value !== '') {
      row[idx] = String(value);
    }
  }

  set('address',      address);
  set('beds',         supa.beds ?? '');
  set('baths',        supa.baths ?? '');
  set('town',         known.town);
  set('owner_name',   known.owner_name);
  set('area',         known.area);

  if (supa.washer    !== null && supa.washer    !== undefined) set('washer',    boolVal(supa.washer));
  if (supa.dryer     !== null && supa.dryer     !== undefined) set('dryer',     boolVal(supa.dryer));
  if (supa.dishwasher!== null && supa.dishwasher!== undefined) set('dishwasher',boolVal(supa.dishwasher));
  if (supa.gas       !== null && supa.gas       !== undefined) set('gas',       boolVal(supa.gas));
  if (supa.freeze_warning !== null && supa.freeze_warning !== undefined) set('freeze_warning', boolVal(supa.freeze_warning));
  if (supa.sump_pump !== null && supa.sump_pump !== undefined) set('sump_pump', boolVal(supa.sump_pump));
  if (supa.ac_type)      set('ac_type',      supa.ac_type);
  if (supa.heat_type)    set('heat_type',    supa.heat_type);
  if (supa.property_type) set('property_type', supa.property_type);
  if (supa.sq_ft)        set('sq_ft',        supa.sq_ft);
  if (supa.year_built)   set('year_built',   supa.year_built);
  if (supa.pets_allowed) set('pets_allowed', supa.pets_allowed);

  rowsToAppend.push({ address, row });
}

if (rowsToAppend.length === 0) {
  console.log('\nAll properties already exist in the sheet. Nothing to add.');
  process.exit(0);
}

console.log(`\nReady to append ${rowsToAppend.length} rows:`);
rowsToAppend.forEach(({ address, row }) => {
  const filled = row.filter(v => v !== '').length;
  console.log(`  "${address}" — ${filled} fields populated`);
});

if (DRY_RUN) {
  console.log('\n[dry-run] Pass without --dry-run to append.');
  process.exit(0);
}

// ── Append to sheet ───────────────────────────────────────────────────────────
const values = rowsToAppend.map(({ row }) => row);
await sheets.spreadsheets.values.append({
  spreadsheetId: SHEET_ID_PROPERTY_INFO,
  range: 'property info!A:A',
  valueInputOption: 'USER_ENTERED',
  insertDataOption: 'INSERT_ROWS',
  requestBody: { values },
});

console.log(`\n✓ Appended ${rowsToAppend.length} rows to Property Info sheet.`);
console.log('Run sync-property-cache.mjs next to pull them into Supabase.');
