/**
 * sendStageEmail — single-purpose email helper for inspection-lifecycle
 * notifications (inspection saved, all turnover tasks done, cleaned, finalized).
 *
 * Wraps the Brevo POST that used to live inline in save-inspection.js so all
 * four stages share one envelope (sender + recipient + error tolerance).
 *
 * Used by:
 *   - netlify/functions/save-inspection.js
 *   - netlify/functions/save-inspection-item-state.js
 *   - netlify/functions/mark-inspection-stage.js
 *
 * Best-effort: never throws. Logs success/failure and returns a small status
 * object so callers can differentiate "skipped (env vars missing)" from
 * "tried and failed" if they care to. Email failures must NEVER block the
 * underlying state mutation that triggered them.
 */

export async function sendStageEmail({ subject, lines, label = 'email' }) {
  const { BREVO_API_KEY, MEETING_EMAIL_TO } = process.env;
  const missing = [];
  if (!BREVO_API_KEY) missing.push('BREVO_API_KEY');
  if (!MEETING_EMAIL_TO) missing.push('MEETING_EMAIL_TO');
  if (missing.length > 0) {
    console.warn(`[${label}] ✉ Skipping — missing env var(s): ${missing.join(', ')}`);
    return { sent: false, reason: 'missing_env' };
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Mills Dashboard', email: 'nathan@millsrentals.com' },
        to: [{ email: MEETING_EMAIL_TO }],
        subject,
        textContent: Array.isArray(lines) ? lines.join('\n') : String(lines),
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Brevo ${res.status}: ${errBody}`);
    }
    console.log(`[${label}] ✉ sent — "${subject}"`);
    return { sent: true };
  } catch (err) {
    console.error(`[${label}] ✉ failed — "${subject}":`, err.message);
    return { sent: false, reason: 'send_error', error: err.message };
  }
}
