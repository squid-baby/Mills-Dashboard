/**
 * Netlify Function: GET /api/get-units
 *
 * Data source priority:
 *   1. Supabase (when SUPABASE_URL + SUPABASE_SERVICE_KEY are set)
 *   2. Google Sheets (when GOOGLE_SERVICE_ACCOUNT_JSON + SHEET_ID are set)
 *   3. Empty — React app falls back to seed data
 *
 * The browser never sees Supabase or Google credentials.
 * All auth is server-side in this function.
 *
 * Required env vars (at least one source):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY     — preferred source
 *   GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID  — legacy fallback
 */

import { createClient } from '@supabase/supabase-js';

export async function handler() {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    GOOGLE_SERVICE_ACCOUNT_JSON,
    SHEET_ID,
    SHEET_TAB_RENEWALS = 'Sheet1',
    SHEET_TAB_PROPERTIES = 'Sheet2',
  } = process.env;

  // ── 1. Try Supabase ─────────────────────────────────────────────────────────
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // unit_full view joins residents + next_residents as JSON arrays
      const { data, error } = await supabase
        .from('unit_full')
        .select('*');

      if (error) throw error;

      // Shape Supabase rows into the same unit object the React app expects
      const units = (data || []).map((row, idx) => {
        const residents = (row.residents || []).map(r => ({
          name:        r.name        || '',
          email:       r.email       || '',
          status:      r.status      || 'unknown',
          leaseSigned: r.leaseSigned || false,
          depositPaid: r.depositPaid || false,
          leaseEnd:    r.leaseEnd    || '',
        }));

        const nextResidents = (row.next_residents || []).map(r => ({
          name:  r.name  || '',
          email: r.email || '',
          phone: r.phone || '',
        }));

        const group    = deriveGroup(residents, nextResidents);
        const substate = deriveSubstate(group, residents, nextResidents);
        const allSigned = residents.length > 0 &&
          residents.every(r => r.status === 'leaving' || r.leaseSigned);
        const allDeposit = residents.length > 0 &&
          residents.every(r => r.status === 'leaving' || r.depositPaid);

        // Find earliest lease end among current residents
        const leaseEnds = residents
          .map(r => r.leaseEnd)
          .filter(Boolean)
          .map(d => new Date(d));
        const leaseEnd = leaseEnds.length
          ? formatDate(new Date(Math.min(...leaseEnds)))
          : '';

        return {
          id:            idx + 1,
          address:       row.address,
          leaseEnd,
          beds:          row.beds  ?? 0,
          baths:         row.baths ?? null,
          owner:         row.owner_name || '',
          area:          row.area       || '',
          group,
          substate,
          notes:         '',
          turnoverNotes: '',
          utilities:     row.utilities  || '',
          residents,
          nextResidents,
          allSigned,
          allDeposit,
        };
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units, source: 'supabase', fetchedAt: new Date().toISOString() }),
      };
    } catch (err) {
      console.error('get-units supabase error:', err);
      // Fall through to Google Sheets
    }
  }

  // ── 2. Try Google Sheets (legacy) ───────────────────────────────────────────
  if (!GOOGLE_SERVICE_ACCOUNT_JSON || !SHEET_ID) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units: [], source: 'none', error: 'No data source configured' }),
    };
  }

  try {
    const { google } = await import('googleapis');

    const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const [renewalsRes, propertiesRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_TAB_RENEWALS}!A:AA` }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_TAB_PROPERTIES}!A:AA` }),
    ]);

    const units = parseSheets(
      renewalsRes.data.values || [],
      propertiesRes.data.values || [],
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units, source: 'google_sheets', fetchedAt: new Date().toISOString() }),
    };
  } catch (err) {
    console.error('get-units sheets error:', err);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units: [], source: 'error', error: err.message }),
    };
  }
}

// ─── Date formatter: Date → "M/D/YY" (matches seed data format) ──────────────
function formatDate(d) {
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
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
    propInfo[addr] = { beds: clean(row[1]), baths: clean(row[2]), utilities: clean(row[10]), area: clean(row[24]) };
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
      owner, area: area || info.area || '', group, substate,
      notes, turnoverNotes, utilities: info.utilities || '',
      residents, nextResidents, allSigned, allDeposit,
    });
  }
  return units;
}
