/**
 * Netlify Function: POST /api/save-calendar-task
 *
 * Upserts a calendar task into Supabase.
 * If body contains `id`, updates that row. Otherwise inserts a new one.
 *
 * Body: { id?, unit_address, task_type, start_date, start_slot, end_date, end_slot, crew, notes, status }
 *
 * Required env vars:
 *   SUPABASE_URL         - Supabase project URL
 *   SUPABASE_SERVICE_KEY - Supabase service role key
 */

import { createClient } from '@supabase/supabase-js';

const VALID_TYPES = ['move_out', 'paint', 'repair', 'clean', 'finalize', 'move_in'];
const VALID_SLOTS = ['am', 'pm'];
const VALID_STATUSES = ['planned', 'in_progress', 'done'];

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { id, unit_address, task_type, start_date, start_slot, end_date, end_slot, crew, notes, status } = body;

  if (!unit_address || !task_type || !start_date || !start_slot || !end_date || !end_slot) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields: unit_address, task_type, start_date, start_slot, end_date, end_slot' }) };
  }
  if (!VALID_TYPES.includes(task_type)) {
    return { statusCode: 400, body: JSON.stringify({ error: `Invalid task_type. Must be one of: ${VALID_TYPES.join(', ')}` }) };
  }
  if (!VALID_SLOTS.includes(start_slot) || !VALID_SLOTS.includes(end_slot)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Slots must be "am" or "pm"' }) };
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Supabase credentials' }) };
  }

  const row = {
    unit_address,
    task_type,
    start_date,
    start_slot,
    end_date,
    end_slot,
    crew: crew || '',
    notes: notes || '',
    status: VALID_STATUSES.includes(status) ? status : 'planned',
    updated_at: new Date().toISOString(),
  };

  const t0 = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let result;
    if (id) {
      // Update existing task
      result = await supabase
        .from('calendar_tasks')
        .update(row)
        .eq('id', id)
        .select()
        .single();
    } else {
      // Insert new task
      result = await supabase
        .from('calendar_tasks')
        .insert(row)
        .select()
        .single();
    }

    if (result.error) throw result.error;

    console.log(`[save-calendar-task] OK — ${id ? 'updated' : 'created'} ${result.data.id} | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: result.data }),
    };
  } catch (err) {
    console.error(`[save-calendar-task] ERROR after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
