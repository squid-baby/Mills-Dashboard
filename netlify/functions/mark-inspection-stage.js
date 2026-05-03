/**
 * Netlify Function: POST /api/mark-inspection-stage
 *
 * Records a turnover lifecycle stage (cleaned or finalized) on the latest
 * inspection row for a unit_address, captures optional notes, and emails the
 * team. Used by the Cleaned / Finalized buttons next to the Edit pencil in
 * the Turnover Overview.
 *
 * Body: { address, stage, notes?, by?, undo?, forceEmail? }
 *   address     — unit_address (required)
 *   stage       — 'cleaned' | 'finalized' (required)
 *   notes       — free-text from the cleaner / finalizer (optional)
 *   by          — actor label, defaults to 'Team'
 *   undo        — boolean; if true, clear the stage's at/by/notes columns
 *                 and skip emailing (panic-button / accidental click recovery)
 *   forceEmail  — boolean; resend the email even when this is a re-edit of
 *                 already-set stage (the explicit "Save & resend" action)
 *
 * Email behavior (matches the user-approved plan):
 *   - First time the stage transitions from null → set: email fires.
 *   - Re-edit (stage already set): silent — DB updates, no email — UNLESS
 *     forceEmail is true, in which case we send a fresh notification.
 *   - undo: never emails.
 *
 * Response: { ok: true, emailed: boolean, inspection: { ... stage fields ... } }
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Optional env vars (notification email via Brevo — skipped if any are missing):
 *   BREVO_API_KEY, MEETING_EMAIL_TO
 */

import { createClient } from '@supabase/supabase-js';
import { sendStageEmail } from '../../src/lib/sendStageEmail.js';

const ALLOWED_STAGES = new Set(['cleaned', 'finalized']);

const STAGE_SUBJECT = {
  cleaned:   address => `Cleaning complete: ${address}`,
  finalized: address => `Turnover finalized: ${address}`,
};

const STAGE_HEADER_LINE = {
  cleaned:   'Cleaning Status: Complete',
  finalized: 'Turnover Status: Finalized',
};

const STAGE_VERB = {
  cleaned:   'Cleaned',
  finalized: 'Finalized',
};

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { address, stage, notes, by, undo, forceEmail } = body;
  if (!address || !stage) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing address or stage' }) };
  }
  if (!ALLOWED_STAGES.has(stage)) {
    return { statusCode: 400, body: JSON.stringify({ error: `Invalid stage: ${stage}` }) };
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Supabase credentials' }) };
  }

  const t0 = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Look up the latest inspection for this address. Same pattern as
    // save-inspection.js: one logical inspection per unit_address, latest wins.
    const { data: existing, error: findErr } = await supabase
      .from('inspections')
      .select(`id, cleaned_at, cleaned_by, cleaned_notes, finalized_at, finalized_by, finalized_notes`)
      .eq('unit_address', address)
      .order('created_at', { ascending: false })
      .limit(1);
    if (findErr) throw new Error(`find inspection: ${findErr.message}`);
    if (!existing || existing.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No inspection found for that address. Save an inspection first.' }) };
    }
    const inspection = existing[0];

    const atCol    = `${stage}_at`;
    const byCol    = `${stage}_by`;
    const notesCol = `${stage}_notes`;

    let updated;
    let shouldEmail = false;

    if (undo) {
      // Idempotent clear: by/at/notes all blank, never email.
      const { data, error: updErr } = await supabase
        .from('inspections')
        .update({ [atCol]: null, [byCol]: null, [notesCol]: null, updated_at: new Date().toISOString() })
        .eq('id', inspection.id)
        .select(`cleaned_at, cleaned_by, cleaned_notes, finalized_at, finalized_by, finalized_notes`)
        .single();
      if (updErr) throw new Error(`update inspection: ${updErr.message}`);
      updated = data;
    } else if (!inspection[atCol]) {
      // First transition: stamp <stage>_at. We use a conditional update that
      // only matches rows where <stage>_at IS NULL, so two concurrent clicks
      // can't both succeed — only the winner emails. The loser falls through
      // to the silent re-edit path below and updates by/notes.
      const stamp = new Date().toISOString();
      const { data, error: updErr } = await supabase
        .from('inspections')
        .update({
          [atCol]: stamp,
          [byCol]: by || 'Team',
          [notesCol]: notes ?? '',
          updated_at: stamp,
        })
        .eq('id', inspection.id)
        .is(atCol, null)
        .select(`cleaned_at, cleaned_by, cleaned_notes, finalized_at, finalized_by, finalized_notes`);
      if (updErr) throw new Error(`update inspection: ${updErr.message}`);
      if (data && data.length === 1) {
        updated = data[0];
        shouldEmail = true;
      }
    }

    if (!updated) {
      // Re-edit path (or lost the first-transition race). by/notes update,
      // <stage>_at is preserved. Emails only when the caller explicitly asked
      // to resend.
      const { data, error: updErr } = await supabase
        .from('inspections')
        .update({
          [byCol]: by || 'Team',
          [notesCol]: notes ?? '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', inspection.id)
        .select(`cleaned_at, cleaned_by, cleaned_notes, finalized_at, finalized_by, finalized_notes`)
        .single();
      if (updErr) throw new Error(`update inspection: ${updErr.message}`);
      updated = data;
      if (forceEmail && !undo) shouldEmail = true;
    }

    let emailed = false;
    if (shouldEmail) {
      const result = await sendStageEmail({
        subject: STAGE_SUBJECT[stage](address),
        label: `mark-${stage}`,
        lines: buildStageEmailLines({
          address,
          stage,
          at: updated[atCol],
          by: updated[byCol] || 'Team',
          notes: updated[notesCol] || '',
        }),
      });
      emailed = !!result.sent;
    }

    console.log(`[mark-inspection-stage] OK — "${address}" stage=${stage}${undo ? ' (undo)' : ''} emailed=${emailed} | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, emailed, inspection: updated }),
    };
  } catch (err) {
    console.error(`[mark-inspection-stage] ERROR — "${address}" stage=${stage} after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}

function buildStageEmailLines({ address, stage, at, by, notes }) {
  const tsLabel = at
    ? new Date(at).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET'
    : '—';
  return [
    address,
    '',
    STAGE_HEADER_LINE[stage],
    '',
    `${STAGE_VERB[stage]} by: ${by}`,
    `At: ${tsLabel}`,
    'Notes:',
    notes && notes.trim() ? notes.trim() : '(none)',
  ];
}
