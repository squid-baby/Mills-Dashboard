/**
 * Netlify Function: GET /api/get-all-inspections
 *
 * Returns a map { unit_address → overallCondition } for the dashboard tile
 * grid. One entry per unit (latest inspection wins).
 *
 * Local curl example:
 *   curl http://localhost:8888/api/get-all-inspections
 *   → 200 { "inspections": { "123 Main St": "up_to_date", "...": "needs_love" } }
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';

export async function handler() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspections: {} }),
    };
  }

  const t0 = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase
      .from('inspections')
      .select('unit_address, overall_condition, created_at')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);

    // Latest condition per address — iterate ascending so later rows overwrite earlier.
    const inspections = {};
    for (const row of data || []) {
      const addr = (row.unit_address || '').trim();
      const cond = (row.overall_condition || '').trim();
      if (addr && cond) inspections[addr] = cond;
    }

    console.log(`[get-all-inspections] OK — ${Object.keys(inspections).length} inspections | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspections }),
    };
  } catch (err) {
    console.error(`[get-all-inspections] ERROR after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspections: {}, error: err.message }),
    };
  }
}
