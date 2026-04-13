/**
 * process-meeting.mjs — Meeting capture pipeline
 *
 * Usage: node --env-file=meeting-capture.env process-meeting.mjs <audio.wav>
 *
 * Steps:
 *   1. Transcribe WAV with transcribe.py (WhisperX + optional diarization)
 *   2. Fetch all unit addresses from Supabase
 *   3. Claude identifies which properties were discussed
 *   4. Fetch full unit data for matched properties
 *   5. Claude writes formatted email
 *   6. Resend delivers email to the team
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *   ANTHROPIC_API_KEY, RESEND_API_KEY,
 *   MEETING_EMAIL_FROM, MEETING_EMAIL_TO
 */

import { createClient }                    from '@supabase/supabase-js';
import Anthropic                           from '@anthropic-ai/sdk';
import nodemailer                          from 'nodemailer';
import { spawn }                           from 'child_process';
import { mkdirSync, writeFileSync }        from 'fs';
import { dirname, resolve as resolvePath } from 'path';
import { fileURLToPath }                   from 'url';
import dotenv                              from 'dotenv';

// Load env from meeting-capture.env (dotenv handles complex values reliably)
dotenv.config({ path: resolvePath(dirname(fileURLToPath(import.meta.url)), 'meeting-capture.env'), override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Env validation ──────────────────────────────────────────────────────────

const REQUIRED = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_KEY',
  'ANTHROPIC_API_KEY',
  'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'MEETING_EMAIL_TO',
];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[process-meeting] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const WAV_PATH = process.argv[2];
if (!WAV_PATH) {
  console.error('[process-meeting] Usage: process-meeting.mjs <audio.wav>');
  process.exit(1);
}

// ─── Clients ─────────────────────────────────────────────────────────────────

const supabase   = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/** Spawn transcribe.py and collect its stdout as the transcript string. */
function runTranscribe(wavPath) {
  return new Promise((resolve, reject) => {
    log(`Spawning transcribe.py for: ${wavPath}`);
    const scriptPath = resolvePath(__dirname, 'transcribe.py');
    const child = spawn('/usr/bin/python3', [scriptPath, wavPath], { env: process.env });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      process.stdout.write(chunk); // echo transcription progress into our log
    });

    child.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`transcribe.py exited with code ${code}\n${stderr}`));
      }
    });
    child.on('error', reject);
  });
}

/** Parse recording timestamp from filename → human-readable string. */
function formatRecordedAt(wavPath) {
  const m = wavPath.match(/meeting-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
  if (!m) return new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
  const [, yr, mo, dy, hr, mn] = m;
  return new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:00`)
    .toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

const t0         = Date.now();
const recordedAt = formatRecordedAt(WAV_PATH);
const todayLong  = new Date().toLocaleDateString('en-US', { dateStyle: 'long' });

log('=== Meeting pipeline starting ===');
log(`WAV: ${WAV_PATH}`);

// Step 1: Transcribe
const transcript = await runTranscribe(WAV_PATH);
if (!transcript) {
  log('ERROR: Empty transcript — aborting.');
  process.exit(1);
}
log(`Transcript: ${transcript.split('\n').length} speaker segments`);

// Step 2: Fetch all unit addresses
log('Fetching unit addresses from Supabase...');
const { data: units, error: unitsErr } = await supabase
  .from('units')
  .select('id, address')
  .order('address');

if (unitsErr) {
  log(`ERROR: Supabase units fetch failed: ${unitsErr.message}`);
  process.exit(1);
}
const addressList = units.map(u => u.address).join('\n');
log(`Fetched ${units.length} unit addresses`);

// Step 3: Claude — identify which properties were discussed
log('Calling Claude to identify mentioned properties...');
const matchMsg = await anthropic.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 1024,
  messages: [{
    role: 'user',
    content: `You are a property management assistant. A meeting transcript and a list of managed property addresses are provided below.

Identify which properties from the list were explicitly or implicitly discussed in the transcript. Return ONLY valid raw JSON — no markdown fences, no explanation.

Format:
{"matched":["exact address from the list",...],"lowConfidence":[{"phrase":"what was said","possible":"closest address from list or null"}]}

PROPERTY LIST:
${addressList}

TRANSCRIPT:
${transcript}`,
  }],
});

let matchResult = { matched: [], lowConfidence: [] };
try {
  const raw = matchMsg.content[0].text.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '');
  matchResult = JSON.parse(raw);
} catch (e) {
  log(`WARN: Could not parse Claude match response (${e.message}) — continuing with no matches`);
}
log(`Matched: ${matchResult.matched.length} properties, ${matchResult.lowConfidence?.length ?? 0} low-confidence`);

// Step 4: Fetch full unit data for matched properties
const unitDataMap = {};
for (const address of (matchResult.matched ?? [])) {
  log(`Fetching unit data for: ${address}`);
  const { data, error } = await supabase
    .from('units')
    .select(`
      id, address, beds, baths,
      residents ( name, email, status, lease_end, move_out_date, lease_signed, deposit_paid, notes ),
      next_residents ( name, move_in_date )
    `)
    .ilike('address', address)
    .single();

  if (error) {
    log(`WARN: No data for "${address}": ${error.message}`);
  } else {
    unitDataMap[address] = data;
  }
}

// Step 5: Claude — write the email body
log('Calling Claude to write email body...');
const emailMsg = await anthropic.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 4096,
  messages: [{
    role: 'user',
    content: `You are a property management assistant writing meeting notes for the Mills Rentals team.

Write the email as clean HTML. No <html>/<head>/<body> tags — just the inner content. Use inline styles sparingly. Follow this structure exactly:

<h2 style="font-family:sans-serif;border-bottom:2px solid #333;padding-bottom:6px;">Properties & Tenants</h2>

[For each matched property:]
<div style="margin-bottom:20px;font-family:sans-serif;">
  <p style="margin:0 0 4px 0;"><strong>123 Example St</strong> &nbsp;<span style="color:#555;">(Resident Name — Status Label)</span></p>
  <ul style="margin:4px 0 6px 20px;padding:0;line-height:1.7;">
    <li><strong>Move out:</strong> May 5, 2026</li>  [omit if not mentioned]
    <li><strong>Move in:</strong> May 9, 2026</li>   [omit if not mentioned]
    <li>Quick turn — 4 days</li>
    <li>One bullet per key fact or action (paint-out needed, remove TV, AI photos ready, etc.)</li>
    <li><em>Condition unknown — needs inspection</em></li>  [only if condition not discussed]
  </ul>
  <p style="margin:0 0 4px 0;font-size:12px;color:#666;font-family:monospace;background:#f5f5f5;padding:4px 8px;border-radius:3px;"><strong>Dashboard:</strong> status=leaving &nbsp;|&nbsp; lease_end=2026-05-31 &nbsp;|&nbsp; next_move_in=TBD</p>
  <p style="margin:4px 0 0 0;">✏️ &nbsp;<strong>One concise action line here</strong></p>
</div>

<h2 style="font-family:sans-serif;border-bottom:2px solid #333;padding-bottom:6px;">Low Confidence (verify manually)</h2>
[one line per item, or "<p style='font-family:sans-serif;color:#888;'>(none)</p>"]

<h2 style="font-family:sans-serif;border-bottom:2px solid #333;padding-bottom:6px;">Meeting Minutes</h2>
<p style="font-family:sans-serif;line-height:1.6;">[2-3 sentences max. Key decisions and action items only. No fluff.]</p>

<p style="font-family:sans-serif;color:#888;font-size:12px;">Recorded: ${recordedAt}</p>

---
PROPERTY DATA:
${JSON.stringify(unitDataMap, null, 2)}

LOW CONFIDENCE MENTIONS:
${JSON.stringify(matchResult.lowConfidence ?? [], null, 2)}

TRANSCRIPT:
${transcript}`,
  }],
});

const emailBody = emailMsg.content[0].text.trim();
log('Email body generated');

// Step 6: Send via Gmail
const subject = `Meeting Notes — ${todayLong}`;
log(`Sending email: "${subject}" → ${process.env.MEETING_EMAIL_TO}`);

await transporter.sendMail({
  from:    `Mills Rentals <${process.env.GMAIL_USER}>`,
  to:      process.env.MEETING_EMAIL_TO,
  subject,
  html:    emailBody,
});

log(`Email sent: "${subject}" → ${process.env.MEETING_EMAIL_TO}`);

// Save transcript + email locally
const saveDir = `${process.env.HOME}/Documents/Meetings`;
mkdirSync(saveDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
writeFileSync(`${saveDir}/${stamp}_transcript.txt`, transcript, 'utf8');
writeFileSync(`${saveDir}/${stamp}_email.txt`, `Subject: ${subject}\n\n${emailBody}`, 'utf8');
log(`Saved to ~/Documents/Meetings/${stamp}_transcript.txt + _email.txt`);

log(`=== Pipeline complete in ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
