/**
 * Netlify Function: POST /api/save-note
 *
 * Inserts a note into the Supabase notes table.
 * Body: { unit_id, text, created_by }
 *
 * Required env vars:
 *   SUPABASE_URL         - Supabase project URL
 *   SUPABASE_SERVICE_KEY - Supabase service role key
 */

import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { unit_id, text, created_by } = body;
  if (!unit_id || !text) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing unit_id or text' }) };
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Supabase credentials' }) };
  }

  const t0 = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase
      .from('notes')
      .insert({ unit_id, text, created_by: created_by || 'Team' })
      .select()
      .single();

    if (error) throw error;

    console.log(`[save-note] OK — unit ${unit_id} | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: data }),
    };
  } catch (err) {
    console.error(`[save-note] ERROR — unit ${unit_id} after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
