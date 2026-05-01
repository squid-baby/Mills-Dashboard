/**
 * Netlify Function: POST /api/save-inspection
 *
 * Upserts a turnover inspection into Supabase. One row per unit_address —
 * latest save wins (replace semantics). Also normalizes the items blob into
 * `inspection_items` rows for the Worklist + Turnover Overview (Phases 1C–1D).
 *
 * Body: { address, inspection }
 *   inspection: { inspector, date, overallCondition, overallNotes, items: {...} }
 *
 * Response: { success: true, inspection_id }
 *
 * Local curl example:
 *   curl -X POST http://localhost:8888/api/save-inspection \
 *     -H 'Content-Type: application/json' \
 *     -d '{"address":"123 Main St","inspection":{"inspector":"NM","date":"2026-04-29","overallCondition":"up_to_date","overallNotes":"clean","items":{}}}'
 *   → 200 { "success": true, "inspection_id": "<uuid>" }
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Optional env vars (summary email via Gmail — skipped if any are missing):
 *   GMAIL_USER, GMAIL_APP_PASSWORD, MEETING_EMAIL_TO
 */

import { createClient } from '@supabase/supabase-js';
import { itemsToRows } from '../../src/lib/inspectionItems.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { address, inspection } = body;
  if (!address || !inspection) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing address or inspection data' }) };
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Supabase credentials' }) };
  }

  const t0 = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const items = inspection.items || {};
    const inspectionDate = inspection.date || new Date().toISOString().split('T')[0];
    const turnoverYear = parseInt((inspectionDate.match(/^(\d{4})/) || [])[1], 10) || null;

    const inspectionRow = {
      unit_address: address,
      inspector: inspection.inspector || '',
      inspection_date: inspectionDate,
      overall_condition: inspection.overallCondition || '',
      overall_notes: inspection.overallNotes || '',
      items_json: items,
      status: inspection.status || 'complete',
      turnover_year: turnoverYear,
      updated_at: new Date().toISOString(),
    };

    // One row per unit_address — find the latest, update if found, else insert.
    const { data: existing, error: findErr } = await supabase
      .from('inspections')
      .select('id')
      .eq('unit_address', address)
      .order('created_at', { ascending: false })
      .limit(1);
    if (findErr) throw new Error(`find inspection: ${findErr.message}`);

    let inspectionId;
    if (existing && existing.length > 0) {
      inspectionId = existing[0].id;
      const { error } = await supabase
        .from('inspections')
        .update(inspectionRow)
        .eq('id', inspectionId);
      if (error) throw new Error(`update inspection: ${error.message}`);
    } else {
      const { data, error } = await supabase
        .from('inspections')
        .insert(inspectionRow)
        .select('id')
        .single();
      if (error) throw new Error(`insert inspection: ${error.message}`);
      inspectionId = data.id;
    }

    // Replace the normalized items rows. Live saves don't filter phantoms —
    // they're whatever the inspector saved. The backfill is the only path
    // that filters seeds out, so the data lands clean once and stays clean.
    const { error: delErr } = await supabase
      .from('inspection_items')
      .delete()
      .eq('inspection_id', inspectionId);
    if (delErr) throw new Error(`delete items: ${delErr.message}`);

    const itemRows = itemsToRows(items, address).map(r => ({
      ...r,
      inspection_id: inspectionId,
    }));
    if (itemRows.length > 0) {
      const { error: insErr } = await supabase
        .from('inspection_items')
        .insert(itemRows);
      if (insErr) throw new Error(`insert items: ${insErr.message}`);
    }

    console.log(`[save-inspection] OK — "${address}" | ${itemRows.length} items | ${Date.now() - t0}ms`);

    await sendSummaryEmail({ address, inspection: inspectionRow, itemRows });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, inspection_id: inspectionId }),
    };
  } catch (err) {
    console.error(`[save-inspection] ERROR — "${address}" after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}

const CONDITION_LABELS = {
  up_to_date: 'Up to date',
  needs_love: 'Needs love',
  at_risk: 'At risk',
};

async function sendSummaryEmail({ address, inspection, itemRows }) {
  const { BREVO_API_KEY, MEETING_EMAIL_TO } = process.env;
  const missing = [];
  if (!BREVO_API_KEY) missing.push('BREVO_API_KEY');
  if (!MEETING_EMAIL_TO) missing.push('MEETING_EMAIL_TO');
  if (missing.length > 0) {
    console.warn(`[save-inspection] ✉ Skipping email — missing env var(s): ${missing.join(', ')}`);
    return;
  }
  console.log(`[save-inspection] ✉ Sending email → ${MEETING_EMAIL_TO}`);

  try {
    const flagged = itemRows.filter(r => r.needs_this);
    const gather = flagged.filter(r => r.item_type === 'purchase');
    const tasks = flagged.filter(r => r.item_type === 'work');
    const conditionLabel = CONDITION_LABELS[inspection.overall_condition] || inspection.overall_condition || '—';
    const isDraft = inspection.status === 'draft';

    const lines = [
      `Address: ${address}`,
      `Inspector: ${inspection.inspector || '—'}`,
      `Date: ${inspection.inspection_date}`,
      `Status: ${inspection.status}`,
      `Overall condition: ${conditionLabel}`,
      '',
      `Flagged items: ${flagged.length} (Gather: ${gather.length} · Tasks: ${tasks.length})`,
    ];
    if (inspection.overall_notes) {
      lines.push('', 'Overall notes:', inspection.overall_notes);
    }
    if (flagged.length > 0) {
      lines.push('', '— Flagged —');
      for (const r of flagged) {
        const p = r.payload || {};
        const desc = p.item || p.name || p.type || p.location || r.category;
        const note = p.condition || p.spec || p.notes || '';
        lines.push(`  • [${r.item_type === 'purchase' ? 'Gather' : 'Task'}] ${r.category} — ${desc}${note ? ` (${note})` : ''}`);
      }
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Mills Dashboard', email: 'nathan@millsrentals.com' },
        to: [{ email: MEETING_EMAIL_TO }],
        subject: `Inspection ${isDraft ? 'draft ' : ''}saved: ${address} — ${conditionLabel}`,
        textContent: lines.join('\n'),
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Brevo ${res.status}: ${errBody}`);
    }
    console.log(`[save-inspection] ✉ Summary email sent for "${address}"`);
  } catch (err) {
    console.error(`[save-inspection] email failed for "${address}":`, err.message);
  }
}
