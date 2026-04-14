/**
 * Netlify Function: GET /api/get-all-inspections
 *
 * Returns all inspection summary data (address + overallCondition).
 * Used by tiles to show condition indicators without N+1 fetches.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON
 *   SHEET_ID_PROPERTY_INFO
 */

import { google } from 'googleapis';
import { SHEET_TABS } from '../../src/config/columns.js';

const TAB_NAME = SHEET_TABS.INSPECTIONS;

export async function handler() {
  const { GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO } = process.env;
  if (!GOOGLE_SERVICE_ACCOUNT_JSON || !SHEET_ID_PROPERTY_INFO) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspections: {} }),
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
        range: `${TAB_NAME}!A:E`,
      });
      rows = res.data.values || [];
    } catch {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspections: {} }),
      };
    }

    // Build map: address → overallCondition (last entry wins)
    const inspections = {};
    for (let i = 1; i < rows.length; i++) {
      const addr = (rows[i]?.[1] || '').toString().trim();
      const condition = (rows[i]?.[4] || '').toString().trim();
      if (addr && condition) {
        inspections[addr] = condition;
      }
    }

    console.log(`[get-all-inspections] OK — ${Object.keys(inspections).length} inspections | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspections }),
    };
  } catch (err) {
    console.error(`[get-all-inspections] ERROR after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspections: {} }),
    };
  }
}
