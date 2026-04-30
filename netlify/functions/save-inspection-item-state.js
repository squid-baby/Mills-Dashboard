/**
 * Netlify Function: POST /api/save-inspection-item-state
 *
 * Flips a single `inspection_items` row's gathered_at / done_at timestamp.
 * Used by the Turnover Overview's Gather + Tasks checklists. Toggling sends
 * `value: '<iso>'` to mark complete or `value: null` to clear.
 *
 * Body: { id, field, value, done_by? }
 *   id     — inspection_items row id (uuid)
 *   field  — 'gathered_at' | 'done_at'
 *   value  — ISO timestamp string, or null to clear
 *   done_by — optional; recorded only when field === 'done_at' and value is truthy
 *
 * Response: { ok: true } | { error: string }
 *
 * Local curl example:
 *   curl -X POST http://localhost:8888/api/save-inspection-item-state \
 *     -H 'Content-Type: application/json' \
 *     -d '{"id":"<uuid>","field":"gathered_at","value":"2026-04-29T15:00:00Z"}'
 *   → 200 { "ok": true }
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';

const ALLOWED_FIELDS = new Set(['gathered_at', 'done_at']);

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { id, field, value, done_by } = body;
  if (!id || !field) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing id or field' }) };
  }
  if (!ALLOWED_FIELDS.has(field)) {
    return { statusCode: 400, body: JSON.stringify({ error: `Invalid field: ${field}` }) };
  }
  if (value !== null && typeof value !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'value must be ISO string or null' }) };
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Supabase credentials' }) };
  }

  const t0 = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const update = { [field]: value, updated_at: new Date().toISOString() };
    if (field === 'done_at') {
      update.done_by = value ? (done_by || 'Team') : null;
    }

    const { error } = await supabase
      .from('inspection_items')
      .update(update)
      .eq('id', id);
    if (error) throw new Error(error.message);

    console.log(`[save-inspection-item-state] OK — ${id} ${field}=${value ? 'set' : 'clear'} | ${Date.now() - t0}ms`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error(`[save-inspection-item-state] ERROR — ${id} after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
