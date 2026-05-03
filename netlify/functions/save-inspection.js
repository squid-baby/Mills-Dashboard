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
 * Optional env vars (summary email via Brevo — skipped if any are missing):
 *   BREVO_API_KEY, MEETING_EMAIL_TO
 */

import { createClient } from '@supabase/supabase-js';
import { itemsToRows } from '../../src/lib/inspectionItems.js';
import { sendStageEmail } from '../../src/lib/sendStageEmail.js';

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

    // Re-arm the "all turnover tasks done" notification when this save introduces
    // any new flagged work. Without this, an inspector who flags additional items
    // after the property already hit "all done" would never trigger another email.
    // We always reset to null on save: any flagged-but-not-done row legitimately
    // means the property is no longer "all done", and save-inspection-item-state
    // re-sets the marker the moment the last open item is checked off.
    const hasOpenFlaggedWork = itemRows.some(r => r.needs_this);
    if (hasOpenFlaggedWork) {
      const { error: clearErr } = await supabase
        .from('inspections')
        .update({ tasks_complete_email_sent_at: null })
        .eq('id', inspectionId);
      if (clearErr) console.warn(`[save-inspection] clear tasks_complete marker: ${clearErr.message}`);
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

const capitalize = s => (s ? s[0].toUpperCase() + s.slice(1) : '');

// Build a human-readable description of an inspection_items row's payload.
// Paint rows pack location, color, finish — render them all so the email
// reader has full context. Other categories use whichever identifier field
// the payload happens to carry.
function describeRow(category, p) {
  if (category === 'paint') {
    const color = p.color === 'Other' && p.customColor ? p.customColor : p.color;
    const tail = [color, p.finish].filter(Boolean).join(' ');
    return [p.location, tail].filter(Boolean).join(' · ');
  }
  return p.item || p.name || p.type || p.location || category;
}

async function sendSummaryEmail({ address, inspection, itemRows }) {
  const flagged = itemRows.filter(r => r.needs_this);
  const gather = flagged.filter(r => r.item_type === 'purchase');
  const tasks = flagged.filter(r => r.item_type === 'work');
  const conditionLabel = CONDITION_LABELS[inspection.overall_condition] || inspection.overall_condition || '—';
  const isDraft = inspection.status === 'draft';

  // Observations: paint rows + condition rows the inspector documented but
  // didn't flag for action. The Need? toggle gates "is this work to do?"; it
  // shouldn't gate "should the team see what I noticed". Paint rows are
  // always surfaced (they represent intentional documentation effort), and
  // condition rows are surfaced when they carry free-text notes.
  const paintObs = itemRows.filter(r => r.category === 'paint' && !r.needs_this);
  const conditionObs = itemRows.filter(r =>
    r.category === 'condition' && !r.needs_this &&
    ((r.payload?.notes || '').trim() || r.payload?.condition)
  );

  const lines = [
    `Address: ${address}`,
    `Inspector: ${inspection.inspector || '—'}`,
    `Date: ${inspection.inspection_date}`,
    `Inspection Status: ${capitalize(inspection.status)}`,
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
      const desc = describeRow(r.category, p);
      // Render condition + spec + notes side-by-side, separated by em dashes.
      // Previous code used a fallback chain (condition || spec || notes), which
      // silently dropped the inspector's free-text notes whenever a paint or
      // condition row also had a condition rating set.
      const annot = [p.condition, p.spec, p.notes].filter(Boolean).join(' — ');
      lines.push(`  • [${r.item_type === 'purchase' ? 'Gather' : 'Task'}] ${r.category} — ${desc}${annot ? ` (${annot})` : ''}`);
    }
  }
  if (paintObs.length > 0) {
    lines.push('', '— Paint —');
    for (const r of paintObs) {
      const p = r.payload || {};
      const desc = describeRow('paint', p);
      const annot = [p.condition, p.notes].filter(Boolean).join(' — ');
      lines.push(`  • ${desc}${annot ? ` (${annot})` : ''}`);
    }
  }
  if (conditionObs.length > 0) {
    lines.push('', '— Condition notes —');
    for (const r of conditionObs) {
      const p = r.payload || {};
      const desc = describeRow('condition', p);
      const annot = [p.condition, p.notes].filter(Boolean).join(' — ');
      lines.push(`  • ${desc}${annot ? ` (${annot})` : ''}`);
    }
  }

  await sendStageEmail({
    subject: `Inspection ${isDraft ? 'draft ' : ''}saved: ${address} — ${conditionLabel}`,
    lines,
    label: 'save-inspection',
  });
}
