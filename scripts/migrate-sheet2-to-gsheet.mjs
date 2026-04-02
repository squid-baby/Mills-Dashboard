/**
 * migrate-sheet2-to-gsheet.mjs — One-time migration script
 *
 * Reads Amanda's Numbers file Sheet 2 (property info) and writes property
 * attribute values into the canonical Property Info Google Sheet.
 *
 * New columns that don't exist yet in the Google Sheet are appended to the
 * header row before writing data.
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-sheet2-to-gsheet.mjs [--dry-run]
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  - full service account JSON
 *   SHEET_ID_PROPERTY_INFO       - Google Sheet ID for Property Info
 */

import { google } from 'googleapis';
import { mkdirSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { NEW_SHEET_COLUMNS } from '../src/config/columns.js';

const DRY_RUN = process.argv.includes('--dry-run');
const NUMBERS_FILE = '/Volumes/One Touch/The_Team_Google_Drive Sync/2025-2026 Renewals_Dashboard.numbers';
const EXPORT_DIR = '/tmp/mills_export';

// ─── Numbers-parser CSV export ────────────────────────────────────────────────
function exportSheet2() {
  console.log('Reading Numbers file (Sheet 2 — property info)...');
  mkdirSync(EXPORT_DIR, { recursive: true });

  const pyScript = `
import numbers_parser, csv, os

doc = numbers_parser.Document("${NUMBERS_FILE}")
sheet = doc.sheets[1]  # Sheet 2 = property info
rows = sheet.tables[0].rows(values_only=True)
rows = [['' if v is None else str(v) for v in row] for row in rows]
fname = os.path.join("${EXPORT_DIR}", "property info.csv")
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
  } catch (err) {
    console.error('  numbers-parser export failed:', err.stderr || err.message);
    console.error('  Is /Volumes/One Touch/ mounted? Is numbers-parser installed? (pip3 install numbers-parser)');
    process.exit(1);
  }
}

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

// ─── Column letter helper ─────────────────────────────────────────────────────
function colLetter(idx) {
  let n = idx + 1, letter = '';
  while (n > 0) { letter = String.fromCharCode(64 + (n % 26 || 26)) + letter; n = Math.floor((n - 1) / 26); }
  return letter;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
exportSheet2();

const { GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO } = process.env;
if (!GOOGLE_SERVICE_ACCOUNT_JSON || !SHEET_ID_PROPERTY_INFO) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_JSON and SHEET_ID_PROPERTY_INFO must be set');
  process.exit(1);
}

// Parse Sheet 2 CSV
const csvPath = `${EXPORT_DIR}/property info.csv`;
const sheet2Rows = parseCSV(readFileSync(csvPath, 'utf8'));
if (sheet2Rows.length < 2) {
  console.error('No data rows found in Sheet 2 CSV');
  process.exit(1);
}

// Build column index map from Sheet 2 header row
const s2Headers = sheet2Rows[0].map(h => h.trim());
const s2Col = {};
s2Headers.forEach((h, i) => { s2Col[h] = i; });
console.log(`\nSheet 2 headers (${s2Headers.length}): ${s2Headers.slice(0, 8).join(', ')}...`);

// The fields we want to read from Sheet 2 and write to the Google Sheet.
// Maps Sheet 2 header → Google Sheet column header.
// Only include fields that actually come from Sheet 2 (not dashboard-managed fields).
const SHEET2_TO_GSHEET = {
  'Property':           'Property',      // address key — used for matching, not written
  'Bedrooms':           'Bedrooms',
  'Bathrooms':          'Bathrooms',
  'Town':               'Town',
  'Property Type':      'Property Type',
  'Sq Ft':              'Sq Ft',
  'Gas':                'Gas',
  'Included Utilities': 'Included Utilities',
  'Freeze Warning':     'Freeze Warning',
  'Washer':             'Washer',
  'Dryer':              'Dryer',
  'Dishwasher':         'Dishwasher',
  'Owner':              'Owner',
  'Area':               'Area',
  'Year Built':         'Year Built',
  'Sump Pump':          'Sump Pump',
  'Breaker Box':        'Breaker Box',
  'AC Type':            'AC Type',
  'Heat Type':          'Heat Type',
  'Pets Allowed':       'Pets Allowed',
};

// Warn about any Sheet 2 fields not found in the CSV header row
for (const s2Header of Object.keys(SHEET2_TO_GSHEET)) {
  if (s2Header !== 'Property' && !(s2Header in s2Col)) {
    console.warn(`  ⚠  Sheet 2 has no column "${s2Header}" — will be skipped`);
  }
}

// Build per-property data map from Sheet 2
const propData = new Map(); // address → { gsheetHeader: value }
for (let i = 1; i < sheet2Rows.length; i++) {
  const row = sheet2Rows[i];
  const addr = clean(row[s2Col['Property'] ?? 0]);
  if (!addr) continue;
  const entry = {};
  for (const [s2Header, gsheetHeader] of Object.entries(SHEET2_TO_GSHEET)) {
    if (s2Header === 'Property') continue;
    const colIdx = s2Col[s2Header];
    if (colIdx !== undefined) {
      const val = clean(row[colIdx]);
      if (val) entry[gsheetHeader] = val;
    }
  }
  propData.set(addr, entry);
}
console.log(`\nParsed ${propData.size} properties from Sheet 2`);

// Connect to Google Sheets
const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Read current Google Sheet header row + all address values
console.log('\nReading Property Info Google Sheet...');
const [headerRes, addrRes] = await Promise.all([
  sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID_PROPERTY_INFO,
    range: 'property info!A1:AZ1',
  }),
  sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID_PROPERTY_INFO,
    range: 'property info!A:A',
  }),
]);

let gsheetHeaders = headerRes.data.values?.[0] || [];
const addrRows = addrRes.data.values || [];

// Build address → row index map (1-based, row 1 = headers)
const addrToRow = {};
for (let i = 1; i < addrRows.length; i++) {
  const addr = (addrRows[i]?.[0] || '').trim();
  if (addr) addrToRow[addr] = i + 1; // 1-based sheet row
}
console.log(`  ${gsheetHeaders.length} existing columns, ${Object.keys(addrToRow).length} properties in Google Sheet`);

// Append any missing new column headers
const missingHeaders = NEW_SHEET_COLUMNS.filter(h => !gsheetHeaders.includes(h));
if (missingHeaders.length > 0) {
  if (DRY_RUN) {
    console.log(`\n[dry-run] Would append ${missingHeaders.length} new column headers: ${missingHeaders.join(', ')}`);
  } else {
    console.log(`\nAppending ${missingHeaders.length} new column headers: ${missingHeaders.join(', ')}`);
    const startCol = colLetter(gsheetHeaders.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID_PROPERTY_INFO,
      range: `property info!${startCol}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [missingHeaders] },
    });
    gsheetHeaders = [...gsheetHeaders, ...missingHeaders];
    console.log('  ✓ Headers appended');
  }
} else {
  console.log('\nAll new column headers already present in Google Sheet');
}

// Build Google Sheet header → column index map
const gsheetColIdx = {};
gsheetHeaders.forEach((h, i) => { gsheetColIdx[h] = i; });

// Write property data
console.log(`\n${DRY_RUN ? '[dry-run] ' : ''}Writing property attribute data...`);
let totalCells = 0;
let totalProps = 0;
let skippedProps = 0;

for (const [address, entry] of propData) {
  const rowIndex = addrToRow[address];
  if (!rowIndex) {
    console.warn(`  ⚠  "${address}" not found in Google Sheet — skipping`);
    skippedProps++;
    continue;
  }

  // Only write fields that have values and have a column in the Google Sheet
  const writes = [];
  for (const [gsheetHeader, value] of Object.entries(entry)) {
    const colIdx = gsheetColIdx[gsheetHeader];
    if (colIdx === undefined) {
      // Column doesn't exist in sheet yet (shouldn't happen after header append, but be safe)
      continue;
    }
    writes.push({ col: colIdx, header: gsheetHeader, value });
  }

  if (writes.length === 0) continue;

  if (DRY_RUN) {
    console.log(`  [dry-run] "${address}" (row ${rowIndex}): ${writes.map(w => `${w.header}="${w.value}"`).join(', ')}`);
  } else {
    // Use batchUpdate to write all cells for this property in one call
    const batchData = writes.map(({ col, value }) => ({
      range: `property info!${colLetter(col)}${rowIndex}`,
      values: [[value]],
    }));
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID_PROPERTY_INFO,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: batchData,
      },
    });
  }

  totalCells += writes.length;
  totalProps++;
}

const prefix = DRY_RUN ? '[dry-run] Would write' : 'Migration complete —';
console.log(`\n${prefix} ${totalCells} cells across ${totalProps} properties`);
if (skippedProps > 0) {
  console.log(`  ⚠  ${skippedProps} properties from Sheet 2 not found in Google Sheet (addresses may differ)`);
}
if (DRY_RUN) {
  console.log('\nRun without --dry-run to execute.');
}
