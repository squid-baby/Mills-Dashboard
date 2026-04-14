/**
 * Netlify Function: POST /api/save-inspection
 *
 * Saves a turnover inspection to the "Turnover Inspections" tab
 * in the Property Info Google Sheet.
 *
 * Body: { address, inspection }
 *   inspection: { inspector, date, overallCondition, overallNotes, items: {...} }
 *
 * Schema: Timestamp | Address | Inspector | Date | OverallCondition | OverallNotes | ItemsJSON
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON
 *   SHEET_ID_PROPERTY_INFO
 */

import { google } from 'googleapis';
import { SHEET_TABS } from '../../src/config/columns.js';

const TAB_NAME = SHEET_TABS.INSPECTIONS;

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { address, inspection } = body;
  if (!address || !inspection) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing address or inspection data' }) };
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

    const itemsJSON = JSON.stringify(inspection.items || {});

    // Check if an inspection already exists for this address — update if so
    let existingRowIndex = -1;
    try {
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID_PROPERTY_INFO,
        range: `${TAB_NAME}!B:B`,
      });
      const rows = existing.data.values || [];
      for (let i = 1; i < rows.length; i++) {
        if ((rows[i]?.[0] || '').toString().trim() === address) {
          existingRowIndex = i + 1; // 1-based
          break;
        }
      }
    } catch {
      // Tab doesn't exist yet — will be created by append
    }

    const rowData = [
      new Date().toISOString(),
      address,
      inspection.inspector || '',
      inspection.date || '',
      inspection.overallCondition || '',
      inspection.overallNotes || '',
      itemsJSON,
    ];

    if (existingRowIndex > 0) {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID_PROPERTY_INFO,
        range: `${TAB_NAME}!A${existingRowIndex}:G${existingRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [rowData] },
      });
    } else {
      // Append new row (will create tab headers if needed)
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID_PROPERTY_INFO,
          range: `${TAB_NAME}!A:G`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [rowData] },
        });
      } catch (appendErr) {
        // If the tab doesn't exist, create it with headers first
        if (appendErr.message.includes('Unable to parse range')) {
          // Add the sheet
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SHEET_ID_PROPERTY_INFO,
            requestBody: {
              requests: [{ addSheet: { properties: { title: TAB_NAME } } }],
            },
          });
          // Add headers
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID_PROPERTY_INFO,
            range: `${TAB_NAME}!A1:G1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [['Timestamp', 'Address', 'Inspector', 'Date', 'OverallCondition', 'OverallNotes', 'ItemsJSON']],
            },
          });
          // Now append
          await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID_PROPERTY_INFO,
            range: `${TAB_NAME}!A:G`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [rowData] },
          });
        } else {
          throw appendErr;
        }
      }
    }

    console.log(`[save-inspection] OK — "${address}" | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error(`[save-inspection] ERROR — "${address}" after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
