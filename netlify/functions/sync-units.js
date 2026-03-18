/**
 * Netlify Function: POST /api/sync-units
 *
 * Accepts CSV exports from Amanda's Apple Shortcut, strips sensitive columns,
 * parses them, and upserts into Supabase.
 *
 * Security:
 * - Requires x-sync-token header matching CSV_SYNC_TOKEN env var.
 * - Only accepts POST.
 * - Strips door codes and lock box numbers before any storage.
 * - Uses service_role key (server-side only, never exposed to browser).
 *
 * Request body (JSON):
 * {
 *   sheet1: "<csv string>",   // Renewals sheet (one row per resident)
 *   sheet2: "<csv string>"    // Property info sheet
 * }
 *
 * Required env vars:
 *   CSV_SYNC_TOKEN       — secret token Amanda's Shortcut sends
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — service_role key (bypasses RLS)
 */

// ─── Sensitive Sheet2 columns — stripped before storage ──────────────────────
// Col 21: Door Codes
// Col 26: Lock Box and Key Number
const SENSITIVE_S2_COLS = new Set([21, 26]);

// ─── Column indices ───────────────────────────────────────────────────────────
const S1 = {
  PROPERTY: 0, RESIDENT: 1, EMAIL: 2, LEASE_END: 3,
  STATUS: 6, LEASE_SIGNED: 7, DEPOSIT_PAID: 8, NOTES: 9,
  NEXT_RESIDENT: 10, NEXT_EMAIL: 11, NEXT_PHONE: 12,
  OWNER: 16, AREA: 17,
};
const S2 = {
  PROPERTY: 0, BEDS: 1, BATHS: 2, UTILITIES: 10,
  PROPERTY_TYPE: 7, SQ_FT: 8, FREEZE_WARNING: 11, PETS: 18, AREA: 24,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
function yn(val) { return (val || '').toString().trim().toLowerCase() === 'yes'; }
function parseDate(val) {
  const s = clean(val);
  if (!s) return null;
  // Accepts M/D/YY or M/D/YYYY
  const [m, d, y] = s.split('/').map(Number);
  if (!m || !d || !y) return null;
  const year = y < 100 ? 2000 + y : y;
  return `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

export async function handler(event) {
  // ── Auth check ────────────────────────────────────────────
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { CSV_SYNC_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

  if (!CSV_SYNC_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'CSV_SYNC_TOKEN not configured' }) };
  }

  const token = event.headers['x-sync-token'] || '';
  if (token !== CSV_SYNC_TOKEN) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  // ── Parse body ────────────────────────────────────────────
  let sheet1Csv, sheet2Csv;
  try {
    const body = JSON.parse(event.body || '{}');
    sheet1Csv = body.sheet1 || '';
    sheet2Csv = body.sheet2 || '';
    if (!sheet1Csv || !sheet2Csv) throw new Error('Missing sheet1 or sheet2');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const logEntry = { source: 'csv', status: 'error', units_upserted: 0, residents_upserted: 0 };

  try {
    const sheet1Rows = parseCSV(sheet1Csv);
    const sheet2Rows = parseCSV(sheet2Csv);

    // ── Build property info lookup (Sheet2) ─────────────────
    // Sensitive columns (door codes, lock boxes) are intentionally skipped.
    const propInfo = {};
    for (let i = 1; i < sheet2Rows.length; i++) {
      const row = sheet2Rows[i];
      const addr = clean(row[S2.PROPERTY]);
      if (!addr) continue;
      propInfo[addr] = {
        address:       addr,
        beds:          clean(row[S2.BEDS])   || null,
        baths:         parseFloat(row[S2.BATHS]) || null,
        utilities:     clean(row[S2.UTILITIES]),
        property_type: clean(row[S2.PROPERTY_TYPE]),
        sq_ft:         parseInt(row[S2.SQ_FT], 10) || null,
        freeze_warning: yn(row[S2.FREEZE_WARNING]),
        pets_allowed:  clean(row[S2.PETS]),
        area:          clean(row[S2.AREA]),
      };
    }

    // ── Group Sheet1 rows by address ────────────────────────
    const groups = new Map();
    for (let i = 1; i < sheet1Rows.length; i++) {
      const row = sheet1Rows[i];
      const addr = clean(row[S1.PROPERTY]);
      if (!addr) continue;
      if ((row[S1.RESIDENT] || '').trim().toLowerCase() === 'airbnb') continue;
      if (!groups.has(addr)) groups.set(addr, []);
      groups.get(addr).push(row);
    }

    // ── Upsert units ────────────────────────────────────────
    const unitRows = [];
    for (const [address, rows] of groups) {
      const info = propInfo[address] || {};
      const owner = rows.map(r => clean(r[S1.OWNER])).find(v => v) || '';
      const area  = rows.map(r => clean(r[S1.AREA])).find(v => v) || info.area || '';
      unitRows.push({
        address,
        beds:          info.beds   ?? null,
        baths:         info.baths  ?? null,
        area,
        owner_name:    owner,
        utilities:     info.utilities     || '',
        property_type: info.property_type || '',
        sq_ft:         info.sq_ft         ?? null,
        freeze_warning: info.freeze_warning ?? false,
        pets_allowed:  info.pets_allowed  || '',
      });
    }

    // Also upsert properties that exist in Sheet2 but have no Sheet1 rows yet
    for (const [addr, info] of Object.entries(propInfo)) {
      if (!groups.has(addr)) {
        unitRows.push({
          address:       addr,
          beds:          info.beds          ?? null,
          baths:         info.baths         ?? null,
          area:          info.area          || '',
          owner_name:    '',
          utilities:     info.utilities     || '',
          property_type: info.property_type || '',
          sq_ft:         info.sq_ft         ?? null,
          freeze_warning: info.freeze_warning ?? false,
          pets_allowed:  info.pets_allowed  || '',
        });
      }
    }

    const { error: unitErr } = await supabase
      .from('units')
      .upsert(unitRows, { onConflict: 'address' });

    if (unitErr) throw new Error(`units upsert: ${unitErr.message}`);
    logEntry.units_upserted = unitRows.length;

    // ── Fetch unit IDs for FK references ────────────────────
    const { data: unitData, error: fetchErr } = await supabase
      .from('units')
      .select('id, address');
    if (fetchErr) throw new Error(`fetch units: ${fetchErr.message}`);

    const unitIdMap = Object.fromEntries(unitData.map(u => [u.address, u.id]));

    // ── Upsert residents + next_residents ───────────────────
    // Strategy: delete existing rows for synced units, re-insert fresh.
    // This keeps resident data in sync with the sheet without complex diffing.
    const syncedAddresses = [...groups.keys()];
    const syncedUnitIds = syncedAddresses.map(a => unitIdMap[a]).filter(Boolean);

    if (syncedUnitIds.length > 0) {
      await supabase.from('residents').delete().in('unit_id', syncedUnitIds);
      await supabase.from('next_residents').delete().in('unit_id', syncedUnitIds);
    }

    const residentRows = [];
    const nextResidentRows = [];

    for (const [address, rows] of groups) {
      const unitId = unitIdMap[address];
      if (!unitId) continue;

      const seenEmails = new Set();

      for (const row of rows) {
        const name = clean(row[S1.RESIDENT]);
        if (!name) continue;

        residentRows.push({
          unit_id:      unitId,
          name,
          email:        clean(row[S1.EMAIL]),
          status:       clean(row[S1.STATUS]).toLowerCase() || 'unknown',
          lease_end:    parseDate(row[S1.LEASE_END]),
          lease_signed: yn(row[S1.LEASE_SIGNED]),
          deposit_paid: yn(row[S1.DEPOSIT_PAID]),
          notes:        clean(row[S1.NOTES]),
        });

        // Next residents
        const nextName  = clean(row[S1.NEXT_RESIDENT]);
        const nextEmail = clean(row[S1.NEXT_EMAIL]);
        if (nextName) {
          const key = nextEmail || nextName;
          if (!seenEmails.has(key)) {
            seenEmails.add(key);
            nextResidentRows.push({
              unit_id: unitId,
              name:    nextName,
              email:   nextEmail,
              phone:   clean(row[S1.NEXT_PHONE]),
            });
          }
        }
      }
    }

    if (residentRows.length > 0) {
      const { error: resErr } = await supabase.from('residents').insert(residentRows);
      if (resErr) throw new Error(`residents insert: ${resErr.message}`);
      logEntry.residents_upserted = residentRows.length;
    }

    if (nextResidentRows.length > 0) {
      const { error: nrErr } = await supabase.from('next_residents').insert(nextResidentRows);
      if (nrErr) throw new Error(`next_residents insert: ${nrErr.message}`);
    }

    logEntry.status = 'success';

  } catch (err) {
    logEntry.error_msg = err.message;
    console.error('sync-units error:', err);
  }

  // Log the sync attempt (best-effort, don't fail the response on log error)
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    await sb.from('sync_log').insert(logEntry);
  } catch { /* ignore */ }

  const success = logEntry.status === 'success';
  return {
    statusCode: success ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(logEntry),
  };
}
