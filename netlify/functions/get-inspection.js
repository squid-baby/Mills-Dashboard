/**
 * Netlify Function: GET /api/get-inspection?address=...
 *
 * Returns the most recent turnover inspection for a given address.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON
 *   SHEET_ID_PROPERTY_INFO
 */

import { google } from 'googleapis';

const TAB_NAME = 'Turnover Inspections';

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
      body: JSON.stringify({ inspection: null, error: 'Missing credentials or sheet ID' }),
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

    let rows;
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID_PROPERTY_INFO,
        range: `${TAB_NAME}!A:G`,
      });
      rows = res.data.values || [];
    } catch {
      // Tab doesn't exist yet
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspection: null }),
      };
    }

    // Find the most recent inspection for this address (last match wins)
    let match = null;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if ((row[1] || '').toString().trim() === address) {
        match = row;
      }
    }

    if (!match) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspection: null }),
      };
    }

    // Parse the inspection
    let items = {};
    try { items = JSON.parse(match[6] || '{}'); } catch { /* bad JSON */ }

    const inspection = {
      timestamp: match[0] || '',
      address: match[1] || '',
      inspector: match[2] || '',
      date: match[3] || '',
      overallCondition: match[4] || '',
      overallNotes: match[5] || '',
      items,
    };

    console.log(`[get-inspection] OK — "${address}" | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspection }),
    };
  } catch (err) {
    console.error(`[get-inspection] ERROR — "${address}" after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspection: null, error: err.message }),
    };
  }
}
