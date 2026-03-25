/**
 * Netlify Function: GET /api/get-units
 *
 * Fetches both sheets from the Google Spreadsheet using a service account,
 * parses them into dashboard unit objects, and returns JSON.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON - full JSON key for the service account
 *   SHEET_ID                    - the Google Sheets document ID
 *   SHEET_TAB_RENEWALS          - tab name for renewals (default: "Sheet1")
 *   SHEET_TAB_PROPERTIES        - tab name for property info (default: "Sheet2")
 */

import { google } from 'googleapis';

export async function handler() {
  const {
    GOOGLE_SERVICE_ACCOUNT_JSON,
    SHEET_ID,
    SHEET_TAB_RENEWALS = 'Sheet1',
    SHEET_TAB_PROPERTIES = 'Sheet2',
  } = process.env;

  if (!GOOGLE_SERVICE_ACCOUNT_JSON || !SHEET_ID) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units: [], source: 'none', error: 'Missing credentials or sheet ID' }),
    };
  }

  const t0 = Date.now();
  try {
    const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch both tabs in parallel
    const [renewalsRes, propertiesRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_TAB_RENEWALS}!A:AA` }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_TAB_PROPERTIES}!A:AA` }),
    ]);

    const sheet1Rows = renewalsRes.data.values || [];
    const sheet2Rows = propertiesRes.data.values || [];

    // Use the shared parser — import relative path from the project source
    // Since Netlify Functions bundle from the functions dir, we use a simple inline version
    const units = parseSheets(sheet1Rows, sheet2Rows);

    console.log(`[get-units] OK — ${units.length} units | sheet1: ${sheet1Rows.length - 1} rows | sheet2: ${sheet2Rows.length - 1} rows | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units, source: 'live', fetchedAt: new Date().toISOString() }),
    };
  } catch (err) {
    console.error(`[get-units] ERROR after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units: [], source: 'error', error: err.message }),
    };
  }
}

// ─── Inline parser (mirrors src/lib/sheetParser.js) ─────────────────────────
// Duplicated here because Netlify Functions bundle independently from the Vite app.

function yn(val) {
  return (val || '').toString().trim().toLowerCase() === 'yes';
}

function clean(val) {
  if (!val) return '';
  const s = val.toString().trim();
  return /^[—–-]+$/.test(s) ? '' : s;
}

function deriveGroup(residents, nextResidents) {
  if (residents.length === 0) return 'unknown';
  const statuses = residents.map(r => r.status);
  if (statuses.some(s => s === 'month to month')) return 'month_to_month';
  const allLeaving = statuses.every(s => s === 'leaving');
  const allRenewing = statuses.every(s => s === 'renewing');
  const hasLeaving = statuses.some(s => s === 'leaving');
  const hasRenewing = statuses.some(s => s === 'renewing');
  if (allLeaving) return nextResidents.length > 0 ? 'turnover_rented' : 'full_turnover';
  if (allRenewing) return residents.every(r => r.leaseSigned) ? 'renewed' : 'renewing';
  if (hasLeaving && hasRenewing) {
    const renewingSigned = residents.filter(r => r.status === 'renewing').every(r => r.leaseSigned);
    return renewingSigned ? 'partial_turn_leased' : 'partial_turn';
  }
  if (hasRenewing) return 'renewing';
  return 'unknown';
}

function deriveSubstate(group, residents, nextResidents) {
  switch (group) {
    case 'full_turnover': return 'Needs to be listed';
    case 'turnover_rented': return nextResidents.every(r => r.name) ? 'New tenant found, lease in progress' : 'Needs to be listed';
    case 'renewed': return 'Renewal signed';
    case 'renewing': return residents.some(r => r.status === 'renewing' && r.leaseSigned) ? 'Renewal lease sent, not all signed' : 'Interested, lease not yet sent';
    case 'partial_turn': return 'Partial turn - some staying, some leaving';
    case 'partial_turn_leased': return 'Partial turn - lease side done';
    case 'unknown': return 'Waiting to hear back';
    case 'month_to_month': return 'Month-to-month';
    default: return '';
  }
}

function parseSheets(sheet1Rows, sheet2Rows) {
  const propInfo = {};
  for (let i = 1; i < sheet2Rows.length; i++) {
    const row = sheet2Rows[i];
    const addr = clean(row[0]);
    if (!addr) continue;
    propInfo[addr] = {
      beds: clean(row[1]), baths: clean(row[2]), utilities: clean(row[10]), area: clean(row[24]),
      propertyInfo: {
        washer: yn(row[3]), dryer: yn(row[4]), dishwasher: yn(row[5]),
        town: clean(row[6]), propertyType: clean(row[7]), sqft: clean(row[8]),
        gas: yn(row[9]), freezeWarning: yn(row[11]), sumpPump: yn(row[12]),
        breakerBox: clean(row[13]), waterHeaterLocation: clean(row[14]),
        acType: clean(row[15]), heatType: clean(row[16]), petsAllowed: yn(row[17]),
        yearBuilt: clean(row[18]), sheetNotes: clean(row[21]),
      },
    };
  }

  const groups = new Map();
  for (let i = 1; i < sheet1Rows.length; i++) {
    const row = sheet1Rows[i];
    const addr = clean(row[0]);
    if (!addr) continue;
    if (!groups.has(addr)) groups.set(addr, []);
    groups.get(addr).push(row);
  }

  const units = [];
  let id = 1;
  for (const [address, rows] of groups) {
    const nonAirbnb = rows.filter(r => (r[1] || '').toString().trim().toLowerCase() !== 'airbnb');
    if (nonAirbnb.length === 0) continue;
    const withNames = nonAirbnb.filter(r => clean(r[1]));
    const residents = withNames.map(r => ({
      name: clean(r[1]), email: clean(r[2]), status: clean(r[6]).toLowerCase(),
      leaseSigned: yn(r[7]), depositPaid: yn(r[8]),
    }));
    const seenEmails = new Set();
    const nextResidents = [];
    for (const r of nonAirbnb) {
      const name = clean(r[10]);
      const email = clean(r[11]);
      if (!name) continue;
      const key = email || name;
      if (seenEmails.has(key)) continue;
      seenEmails.add(key);
      nextResidents.push({ name, email, phone: clean(r[12]) });
    }
    const first = nonAirbnb[0];
    const leaseEnd = clean(first[3]);
    const owner = nonAirbnb.map(r => clean(r[16])).find(v => v) || '';
    const area = nonAirbnb.map(r => clean(r[17])).find(v => v) || '';
    const notes = [...new Set(nonAirbnb.map(r => clean(r[9])).filter(Boolean))].join('; ');
    const turnoverNotes = [...new Set(nonAirbnb.map(r => clean(r[14])).filter(Boolean))].join('; ');
    const group = deriveGroup(residents, nextResidents);
    const substate = deriveSubstate(group, residents, nextResidents);
    const info = propInfo[address] || {};
    const beds = info.beds || '';
    const allSigned = residents.length > 0 && residents.every(r => r.status === 'leaving' || r.leaseSigned);
    const allDeposit = residents.length > 0 && residents.every(r => r.status === 'leaving' || r.depositPaid);
    units.push({
      id: id++, address, leaseEnd,
      beds: beds ? parseInt(beds, 10) || beds : 0,
      baths: info.baths || '',
      owner, area: area || info.area || '', group, substate,
      notes, turnoverNotes, utilities: info.utilities || '',
      residents, nextResidents, allSigned, allDeposit,
      propertyInfo: info.propertyInfo || {},
    });
  }
  return units;
}
