/**
 * Netlify Function: POST /api/update-property-info
 *
 * Updates a single field in the "property-info-clean" Google Sheet tab and appends
 * a row to the "Property Info History" tab (if it exists).
 *
 * Body: { address, field, oldValue, value, by }
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON - full JSON key for the service account
 *   SHEET_ID_PROPERTY_INFO      - the Google Sheets document ID for Property Info
 */

import { google } from 'googleapis';
import { FIELD_TO_HEADER, SHEET_TABS } from '../../src/config/columns.js';

const SENSITIVE_FIELDS = ['door_code', 'alarm_code'];

// Convert 0-based column index to A1 column letter (handles AA, AB, etc.)
function colLetter(idx) {
  let n = idx + 1, letter = '';
  while (n > 0) { letter = String.fromCharCode(64 + (n % 26 || 26)) + letter; n = Math.floor((n - 1) / 26); }
  return letter;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { address, field, oldValue, value, by } = body;
  if (!address || !field) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing address or field' }) };
  }

  if (!FIELD_TO_HEADER[field]) {
    return { statusCode: 400, body: JSON.stringify({ error: `Unknown field: ${field}` }) };
  }

  const { GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO } = process.env;
  if (!GOOGLE_SERVICE_ACCOUNT_JSON || !SHEET_ID_PROPERTY_INFO) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing credentials or sheet ID' }) };
  }

  const t0 = Date.now();
  try {
    const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Read header row + address column to find row and column positions
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID_PROPERTY_INFO,
      range: `${SHEET_TABS.PROPERTY_INFO}!A1:ZZ1`,
    });
    const headers = headerRes.data.values?.[0] || [];

    // Find column index for this field
    const targetHeader = FIELD_TO_HEADER[field];
    const fieldColIdx = headers.findIndex(h => h === targetHeader);
    if (fieldColIdx === -1) {
      return { statusCode: 400, body: JSON.stringify({ error: `Column "${targetHeader}" not found in sheet` }) };
    }

    // Find address column and row
    const addrColIdx = headers.findIndex(h => h === 'Property');
    const addrRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID_PROPERTY_INFO,
      range: `${SHEET_TABS.PROPERTY_INFO}!${colLetter(addrColIdx)}:${colLetter(addrColIdx)}`,
    });
    const addrRows = addrRes.data.values || [];
    let rowIndex = -1;
    for (let i = 1; i < addrRows.length; i++) {
      if ((addrRows[i]?.[0] || '').toString().trim() === address) {
        rowIndex = i + 1; // 1-based for Sheets API
        break;
      }
    }

    if (rowIndex === -1) {
      // Address not found — append a new row
      const newRow = new Array(headers.length).fill('');
      newRow[addrColIdx] = address;
      newRow[fieldColIdx] = value || '';
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID_PROPERTY_INFO,
        range: `${SHEET_TABS.PROPERTY_INFO}!A:A`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] },
      });
    } else {
      // Update the specific cell
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID_PROPERTY_INFO,
        range: `${SHEET_TABS.PROPERTY_INFO}!${colLetter(fieldColIdx)}${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[value || '']] },
      });
    }

    // Append history row (best-effort — tab may not exist yet)
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID_PROPERTY_INFO,
        range: `${SHEET_TABS.HISTORY}!A:F`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[new Date().toISOString(), address, field, oldValue || '', value || '', by || 'Dashboard']],
        },
      });
    } catch { /* history tab doesn't exist yet — that's ok */ }

    console.log(`[update-property-info] OK — "${address}" | ${field}: "${oldValue || ''}" → "${value || ''}" | by: ${by || 'Dashboard'} | ${Date.now() - t0}ms`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, notify: SENSITIVE_FIELDS.includes(field) }),
    };
  } catch (err) {
    console.error(`[update-property-info] ERROR — "${address}" | ${field} after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
