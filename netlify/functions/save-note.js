/**
 * Netlify Function: POST /api/save-note
 *
 * Inserts a note into the Supabase notes table.
 *
 * Body: { address, body, created_by }
 *
 * Address-keyed because the dashboard's `unit.id` is a sequential index
 * (see get-notes.js for the why). The function looks up the real
 * `units.id` UUID by address before inserting.
 *
 * Local curl example:
 *   curl -X POST http://localhost:8888/api/save-note \
 *     -H 'Content-Type: application/json' \
 *     -d '{"address":"230 Valley Park Dr","body":"hello","created_by":"Team"}'
 *   → 200 { "note": { id, unit_id, text, created_by, created_at } }
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { address, body: noteBody, created_by } = body;
  if (!address || !noteBody) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing address or body' }) };
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Supabase credentials' }) };
  }

  const t0 = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: unitRow, error: unitErr } = await supabase
      .from('units')
      .select('id')
      .eq('address', address)
      .maybeSingle();
    if (unitErr) throw new Error(`unit lookup: ${unitErr.message}`);
    if (!unitRow) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `No unit found for address "${address}"` }),
      };
    }

    const { data, error } = await supabase
      .from('notes')
      .insert({ unit_id: unitRow.id, body: noteBody, created_by: created_by || 'Team' })
      .select()
      .single();
    if (error) throw error;

    console.log(`[save-note] OK — "${address}" | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: data }),
    };
  } catch (err) {
    console.error(`[save-note] ERROR — "${address}" after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
