/**
 * Netlify Function: GET /api/get-inspection?address=...
 *
 * Returns the most recent inspection for a unit_address, in the legacy shape
 * TurnoverTab.jsx expects. Phase 1A reads items_json off the inspection row;
 * Phase 1C will switch reads over to inspection_items.
 *
 * Local curl example:
 *   curl 'http://localhost:8888/api/get-inspection?address=123%20Main%20St'
 *   → 200 { "inspection": {
 *       "address": "123 Main St",
 *       "inspector": "NM",
 *       "date": "2026-04-29",
 *       "overallCondition": "up_to_date",
 *       "overallNotes": "...",
 *       "items": { "blinds": [...], "conditions": {...}, ... },
 *       "status": "complete"
 *     } }
 *   No inspection found → 200 { "inspection": null }
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
      body: JSON.stringify({ inspection: null, error: 'Missing Supabase credentials' }),
    };
  }

  const t0 = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase
      .from('inspections')
      .select('id, unit_address, inspector, inspection_date, overall_condition, overall_notes, items_json, status, turnover_year, created_at, updated_at')
      .eq('unit_address', address)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);

    if (!data || data.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspection: null }),
      };
    }

    const row = data[0];
    const inspection = {
      id:               row.id,
      address:          row.unit_address || '',
      inspector:        row.inspector || '',
      date:             row.inspection_date || '',
      overallCondition: row.overall_condition || '',
      overallNotes:     row.overall_notes || '',
      items:            row.items_json || {},
      status:           row.status || 'complete',
      turnoverYear:     row.turnover_year || null,
      timestamp:        row.updated_at || row.created_at || '',
    };

    console.log(`[get-inspection] OK — "${address}" | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspection }),
    };
  } catch (err) {
    console.error(`[get-inspection] ERROR — "${address}" after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspection: null, error: err.message }),
    };
  }
}
