/**
 * Netlify Function: GET /api/get-property-info?address=...
 *
 * Reads the "property-info-clean" Google Sheet tab for a given address
 * and returns all mapped fields plus recent history entries.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON - full JSON key for the service account
 *   SHEET_ID_PROPERTY_INFO      - the Google Sheets document ID for Property Info
 */

import { google } from 'googleapis';
import { HEADER_TO_FIELD, SHEET_TABS } from '../../src/config/columns.js';

export async function handler(event) {
  const address = event.queryStringParameters?.address;
  if (!address) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing address parameter' }) };
  }

  const { GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO } = process.env;
  if (!GOOGLE_SERVICE_ACCOUNT_JSON || !SHEET_ID_PROPERTY_INFO) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {}, history: [], error: 'Missing credentials or sheet ID' }),
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

    // Fetch property info tab and history tab in parallel
    const [infoRes, historyRes] = await Promise.allSettled([
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID_PROPERTY_INFO,
        range: `${SHEET_TABS.PROPERTY_INFO}!A:ZZ`,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID_PROPERTY_INFO,
        range: `${SHEET_TABS.HISTORY}!A:F`,
      }),
    ]);

    // Build header → column index map from row 1
    const infoRows = infoRes.status === 'fulfilled' ? (infoRes.value.data.values || []) : [];
    const headers = infoRows[0] || [];
    const colIndex = {};
    headers.forEach((h, i) => {
      const field = HEADER_TO_FIELD[h];
      if (field) colIndex[field] = i;
    });

    // Find the row matching this address
    let data = {};
    const addrCol = colIndex['address'] ?? 0;
    for (let i = 1; i < infoRows.length; i++) {
      const row = infoRows[i];
      if ((row[addrCol] || '').toString().trim() === address) {
        for (const [field, idx] of Object.entries(colIndex)) {
          data[field] = (row[idx] || '').toString().trim();
        }
        break;
      }
    }

    // Parse history if the tab exists
    const historyRows = historyRes.status === 'fulfilled' ? (historyRes.value.data.values || []) : [];
    const history = [];
    for (let i = 1; i < historyRows.length; i++) {
      const row = historyRows[i];
      if ((row[1] || '').toString().trim() === address) {
        history.push({
          timestamp: row[0] || '',
          address:   row[1] || '',
          field:     row[2] || '',
          oldValue:  row[3] || '',
          newValue:  row[4] || '',
          changedBy: row[5] || '',
        });
      }
    }
    history.reverse();

    const fieldCount = Object.keys(data).filter(k => data[k]).length;
    console.log(`[get-property-info] OK — "${address}" | ${fieldCount} fields populated | ${history.length} history entries | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, history: history.slice(0, 20) }),
    };
  } catch (err) {
    console.error(`[get-property-info] ERROR for "${address}" after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {}, history: [], error: err.message }),
    };
  }
}
