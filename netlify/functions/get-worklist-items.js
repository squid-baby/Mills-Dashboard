/**
 * Netlify Function: GET /api/get-worklist-items
 *
 * Returns the cross-property worklist: every `inspection_items` row where
 * `needs_this = true`, optionally filtered to one unit, optionally to a
 * done-state. Used by the Worklist view (Phase 1D) to render aggregated
 * Gather + Tasks across all turnover units.
 *
 * Query params:
 *   address — optional, filter to a single unit
 *   done    — optional 'true' | 'false' | 'pending' | 'complete';
 *             pending = done_at IS NULL, complete = done_at IS NOT NULL
 *
 * Response: { rows: [ { id, unit_address, category, item_type, payload,
 *                       needs_this, gathered_at, done_at, done_by } ] }
 *
 * Local curl example:
 *   curl 'http://localhost:8888/api/get-worklist-items'
 *   curl 'http://localhost:8888/api/get-worklist-items?address=230%20Valley%20Park%20Dr'
 *   curl 'http://localhost:8888/api/get-worklist-items?done=pending'
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  const { address, done } = event.queryStringParameters || {};

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [], error: 'Missing Supabase credentials' }),
    };
  }

  const t0 = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let query = supabase
      .from('inspection_items')
      .select('id, unit_address, category, item_type, payload, needs_this, gathered_at, done_at, done_by')
      .eq('needs_this', true);
    if (address) query = query.eq('unit_address', address);
    if (done === 'pending')   query = query.is('done_at', null);
    if (done === 'complete')  query = query.not('done_at', 'is', null);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    console.log(`[get-worklist-items] OK — ${data.length} rows | ${Date.now() - t0}ms`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: data }),
    };
  } catch (err) {
    console.error(`[get-worklist-items] ERROR after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [], error: err.message }),
    };
  }
}
