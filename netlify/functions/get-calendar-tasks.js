/**
 * Netlify Function: GET /api/get-calendar-tasks
 *
 * Fetches calendar tasks from Supabase, optionally filtered by date range.
 * Query params:
 *   start - ISO date string (inclusive, filters start_date >= start)
 *   end   - ISO date string (inclusive, filters start_date <= end)
 *
 * Required env vars:
 *   SUPABASE_URL         - Supabase project URL
 *   SUPABASE_SERVICE_KEY - Supabase service role key
 */

import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: [], error: 'Missing Supabase credentials' }),
    };
  }

  const start = event.queryStringParameters?.start;
  const end = event.queryStringParameters?.end;

  const t0 = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let query = supabase
      .from('calendar_tasks')
      .select('*')
      .order('start_date')
      .order('start_slot');

    // Filter to tasks that overlap the requested window:
    // A task overlaps [start, end] if task.start_date <= end AND task.end_date >= start
    if (start) query = query.gte('end_date', start);
    if (end) query = query.lte('start_date', end);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    console.log(`[get-calendar-tasks] OK — ${data.length} tasks | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: data }),
    };
  } catch (err) {
    console.error(`[get-calendar-tasks] ERROR after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: [], error: err.message }),
    };
  }
}
