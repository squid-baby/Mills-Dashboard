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
import { sendStageEmail } from '../../src/lib/sendStageEmail.js';

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

    // Best-effort: when toggling a row to done, check whether this completed
    // every flagged task on the parent inspection. If yes AND we haven't
    // already emailed for this completion cycle, send "Turnover Task Status:
    // Complete". The marker on inspections.tasks_complete_email_sent_at is the
    // idempotency guard — un-checking and re-checking the last box won't spam.
    // save-inspection.js clears the marker when new flagged work appears, so
    // future legitimate "all done" transitions can re-trigger.
    if (field === 'done_at' && value) {
      maybeSendAllTasksComplete(supabase, id).catch(err => {
        console.error('[save-inspection-item-state] all-tasks-complete check failed:', err.message);
      });
    }

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

// Read the just-toggled row's parent inspection, count remaining flagged-but-
// not-done items, and send the "Turnover Task Status: Complete" email exactly
// once per completion cycle. Idempotency: the email only fires when
// inspections.tasks_complete_email_sent_at is null; we set it to now() right
// before sending so concurrent toggles don't double-fire. Any failure here
// is logged and swallowed by the caller — the row-state mutation already
// succeeded.
async function maybeSendAllTasksComplete(supabase, rowId) {
  const { data: row, error: rowErr } = await supabase
    .from('inspection_items')
    .select('inspection_id, unit_address, done_by')
    .eq('id', rowId)
    .single();
  if (rowErr || !row?.inspection_id) return;

  const { count: pending, error: countErr } = await supabase
    .from('inspection_items')
    .select('id', { count: 'exact', head: true })
    .eq('inspection_id', row.inspection_id)
    .eq('needs_this', true)
    .is('done_at', null);
  if (countErr) throw new Error(`count pending: ${countErr.message}`);
  if (pending !== 0) return;

  const { data: insp, error: inspErr } = await supabase
    .from('inspections')
    .select('id, unit_address, tasks_complete_email_sent_at')
    .eq('id', row.inspection_id)
    .single();
  if (inspErr || !insp) return;
  if (insp.tasks_complete_email_sent_at) return;

  // Conditional update with .select() — we only email if THIS request was the
  // one that flipped the marker from null to set. Concurrent toggles racing on
  // the last item lose the race here and bail out, preventing duplicate emails.
  const now = new Date().toISOString();
  const { data: marked, error: markErr } = await supabase
    .from('inspections')
    .update({ tasks_complete_email_sent_at: now })
    .eq('id', insp.id)
    .is('tasks_complete_email_sent_at', null)
    .select('id');
  if (markErr) {
    console.warn(`[save-inspection-item-state] mark tasks_complete: ${markErr.message}`);
    return;
  }
  if (!marked || marked.length === 0) return; // lost the race — another request already emailed

  const { count: doneCount } = await supabase
    .from('inspection_items')
    .select('id', { count: 'exact', head: true })
    .eq('inspection_id', insp.id)
    .eq('needs_this', true);

  const address = insp.unit_address || row.unit_address || '(unknown)';
  const tsLabel = new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET';

  await sendStageEmail({
    subject: `Turnover tasks complete: ${address}`,
    label: 'tasks-complete',
    lines: [
      address,
      '',
      'Turnover Task Status: Complete',
      '',
      'All flagged turnover tasks are now done.',
      `Tasks: ${doneCount ?? '—'} completed`,
      `Last action: ${tsLabel}${row.done_by ? ` by ${row.done_by}` : ''}`,
    ],
  });
}
