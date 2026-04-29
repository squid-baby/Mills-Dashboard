/**
 * Netlify Function: GET /api/get-notes?address=...
 *
 * Returns all notes for a given unit (by address), newest first.
 *
 * Address-keyed because the dashboard's `unit.id` is a sequential index
 * (replaced inside `buildUnit` for tile-rendering stability), not the real
 * Supabase UUID. Looking up by address mirrors `get-inspection` and avoids
 * leaking the schema's UUIDs to the client.
 *
 * Local curl example:
 *   curl 'http://localhost:8888/api/get-notes?address=230%20Valley%20Park%20Dr'
 *   → 200 { "notes": [ { id, unit_id, text, created_by, created_at }, ... ] }
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  const address = event.queryStringParameters?.address;
  if (!address) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing address parameter' }) };
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: [], error: 'Missing Supabase credentials' }),
    };
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
      console.log(`[get-notes] no unit for "${address}" | ${Date.now() - t0}ms`);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: [] }),
      };
    }

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('unit_id', unitRow.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    console.log(`[get-notes] OK — "${address}" | ${data.length} notes | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: data }),
    };
  } catch (err) {
    console.error(`[get-notes] ERROR — "${address}" after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: [], error: err.message }),
    };
  }
}
