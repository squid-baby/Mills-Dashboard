/**
 * Netlify Function: GET /api/get-notes?unit_id=...
 *
 * Returns all notes for a given unit, newest first.
 *
 * Required env vars:
 *   SUPABASE_URL         - Supabase project URL
 *   SUPABASE_SERVICE_KEY - Supabase service role key
 */

import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  const unitId = event.queryStringParameters?.unit_id;
  if (!unitId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing unit_id parameter' }) };
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

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('unit_id', unitId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log(`[get-notes] OK — unit ${unitId}, ${data.length} notes | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: data }),
    };
  } catch (err) {
    console.error(`[get-notes] ERROR — unit ${unitId} after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: [], error: err.message }),
    };
  }
}
