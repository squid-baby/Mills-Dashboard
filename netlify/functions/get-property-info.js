/**
 * Netlify Function: GET /api/get-property-info?address=...
 *
 * Reads the "property info" Google Sheet for a given address and returns
 * all mapped fields plus recent history entries.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON - full JSON key for the service account
 *   SHEET_ID_PROPERTY_INFO      - the Google Sheets document ID for Property Info
 */

import { google } from 'googleapis';

// Maps sheet column headers → field keys used in the dashboard
const HEADER_TO_FIELD = {
  'Property':                   'address',
  'Door Codes':                 'door_code',
  'Lock Box and Key Number':    'lockbox_code',
  'Hot water heater':           'water_heater_location',
  'notes':                      'notes',
  'Filter #1':                  'filter_size',
  'Filter #2':                  'filter_size_2',
  'Alarm Code':                 'alarm_code',
  'Key Location':               'key_location',
  'Water Shutoff':              'water_shutoff',
  'Internet Provider':          'internet_provider',
  'Water Heater Type':          'water_heater_type',
  'Water Heater Last Service':  'water_heater_last_service',
  'HVAC Last Service':          'hvac_last_service',
  'Washer Replaced':            'washer_replaced',
  'Washer Warranty':            'washer_warranty',
  'Dryer Replaced':             'dryer_replaced',
  'Dryer Warranty':             'dryer_warranty',
  'Dishwasher Replaced':        'dishwasher_replaced',
  'Dishwasher Warranty':        'dishwasher_warranty',
  'Fridge Replaced':            'fridge_replaced',
  'Fridge Warranty':            'fridge_warranty',
  'Toilet Flapper Style':       'toilet_flapper_style',
  'Toilet Seat Style':          'toilet_seat_style',
  'Paint Interior':             'paint_interior',
  'Paint Trim':                 'paint_trim',
  'Paint Brand':                'paint_brand',
  'Paint Last Done':            'paint_last_done',
};

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
        range: 'property info!A:AZ',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID_PROPERTY_INFO,
        range: 'Property Info History!A:F',
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
