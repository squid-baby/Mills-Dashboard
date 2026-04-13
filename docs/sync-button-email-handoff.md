# Plan: Sync Button + Change Summary Email

Two additive features. Nothing existing is modified except `sync-from-numbers.mjs`
(change-tracking logic added at the end — the existing sync logic is untouched).

---

## Feature 1 — "↻ Sync" Button on Dashboard

### What it does
A small button in the dashboard header (next to "Export Turnovers") that triggers the
GitHub Actions `sync-numbers.yml` workflow via `workflow_dispatch`. The GitHub token
never touches the browser — it lives in a Netlify env var and is called server-side.

Button states:
- Idle: `↻ Sync`
- In-flight: `Syncing…` (disabled, dimmed)
- Success: `✓ Triggered` (green, 3s then resets)
- Error: `✗ Failed` (red, 3s then resets)

> Note: GHA takes ~60–90s to actually finish after the trigger. The button confirms
> the dispatch was accepted, not that the sync completed.

### Files to create / change

#### New: `netlify/functions/trigger-sync.js`
```js
// Dispatches the sync-numbers.yml workflow via GitHub API workflow_dispatch.
// GITHUB_TOKEN must be set in Netlify env vars (actions:write scope).

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return new Response('GITHUB_TOKEN not configured', { status: 500 });

  const res = await fetch(
    'https://api.github.com/repos/squid-baby/Mills-Dashboard/actions/workflows/sync-numbers.yml/dispatches',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (res.status === 204) {
    return Response.json({ ok: true, message: 'Sync triggered' });
  }
  const body = await res.text();
  return Response.json({ ok: false, message: body }, { status: 502 });
};

export const config = { path: '/api/trigger-sync' };
```

#### Change: `src/App.jsx`
Add state near the other button states (e.g. next to `exporting`):
```js
const [syncing, setSyncing] = useState(null); // null | 'pending' | 'ok' | 'error'
```

Add button in the header, right before the "Export Turnovers" button:
```jsx
<button
  disabled={syncing === 'pending'}
  onClick={async () => {
    setSyncing('pending');
    try {
      const res = await fetch('/api/trigger-sync', { method: 'POST' });
      const data = await res.json();
      setSyncing(data.ok ? 'ok' : 'error');
    } catch {
      setSyncing('error');
    } finally {
      setTimeout(() => setSyncing(null), 3000);
    }
  }}
  style={{
    background: 'var(--bg-elevated)',
    color: syncing === 'ok' ? '#34d399' : syncing === 'error' ? '#f87171' : 'var(--text-muted)',
    border: `1px solid ${syncing === 'ok' ? '#34d399' : syncing === 'error' ? '#f87171' : 'var(--border-default)'}`,
    borderRadius: 'var(--radius-sm)',
    padding: '5px 10px',
    fontSize: 11, fontWeight: 600,
    cursor: syncing === 'pending' ? 'wait' : 'pointer',
    opacity: syncing === 'pending' ? 0.5 : 1,
    transition: 'all var(--duration-fast) ease',
    whiteSpace: 'nowrap',
  }}
>
  {syncing === 'pending' ? 'Syncing…' : syncing === 'ok' ? '✓ Triggered' : syncing === 'error' ? '✗ Failed' : '↻ Sync'}
</button>
```

### Env vars to add

**Netlify** (Site settings → Environment variables):
| Key | Value |
|-----|-------|
| `GITHUB_TOKEN` | the PAT created for this project (actions:write scope) |

---

## Feature 2 — Change Summary Email

### What it does
After each sync (local or GitHub Actions), if anything changed in Supabase, an email
is sent to `theteam@millsrentals.com` summarising what changed:
- New residents added
- Residents removed (moved out)
- Status changes (e.g. `unknown` → `renewed`)
- Lease signed / deposit paid flips
- Next resident added or changed

If nothing changed, no email is sent.

Uses the same Gmail + nodemailer setup as `scripts/meeting-capture/process-meeting.mjs`.
No new email service needed — just borrow the credentials.

### Files to change

#### Change: `scripts/sync-from-numbers.mjs`
Add at the **very end**, after the existing `✓ Sync complete` log line.
The existing sync logic (lines 1–285) is completely untouched.

```js
// ─── Change detection + email ─────────────────────────────────────────────────
// Only runs if GMAIL_USER + GMAIL_APP_PASSWORD + MEETING_EMAIL_TO are set.
// Safe to skip — missing env vars = no email, no error.

const GMAIL_USER     = process.env.GMAIL_USER;
const GMAIL_PASS     = process.env.GMAIL_APP_PASSWORD;
const EMAIL_TO       = process.env.MEETING_EMAIL_TO;

if (GMAIL_USER && GMAIL_PASS && EMAIL_TO) {
  // Fetch the freshly-synced residents for diffing
  const { data: newResidents } = await sb.from('residents').select('unit_id, name, status, lease_signed, deposit_paid');

  // Compare against snapshot taken BEFORE the delete/insert above.
  // (snapshotBefore must be captured earlier in the script — see note below)
  const changes = [];

  const prevMap  = Object.fromEntries((snapshotBefore || []).map(r => [`${r.unit_id}:${r.name}`, r]));
  const afterMap = Object.fromEntries((newResidents  || []).map(r => [`${r.unit_id}:${r.name}`, r]));

  // Added
  for (const [key, r] of Object.entries(afterMap)) {
    if (!prevMap[key]) changes.push(`+ Added resident: ${r.name}`);
  }
  // Removed
  for (const [key, r] of Object.entries(prevMap)) {
    if (!afterMap[key]) changes.push(`- Removed resident: ${r.name}`);
  }
  // Status / field changes
  for (const [key, after] of Object.entries(afterMap)) {
    const before = prevMap[key];
    if (!before) continue;
    if (before.status !== after.status)
      changes.push(`~ ${after.name}: status ${before.status} → ${after.status}`);
    if (before.lease_signed !== after.lease_signed)
      changes.push(`~ ${after.name}: lease_signed → ${after.lease_signed}`);
    if (before.deposit_paid !== after.deposit_paid)
      changes.push(`~ ${after.name}: deposit_paid → ${after.deposit_paid}`);
  }

  if (changes.length > 0) {
    const { createTransport } = await import('nodemailer');
    const transporter = createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });
    await transporter.sendMail({
      from: GMAIL_USER,
      to: EMAIL_TO,
      subject: `Mills Sync — ${changes.length} change${changes.length !== 1 ? 's' : ''} (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`,
      text: [
        `Numbers sync ran at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
        '',
        ...changes,
        '',
        `${resolvedIds.size} units matched · ${residentRows.length} residents · ${nextResidentRows.length} next residents`,
      ].join('\n'),
    });
    console.log(`  ✉ Change email sent (${changes.length} changes)`);
  } else {
    console.log('  ✉ No changes — skipping email');
  }
}
```

**Important**: To capture `snapshotBefore`, add one line BEFORE the existing delete block
(around line 196 in the current script):

```js
// Snapshot residents before deleting — used for change-detection email
const { data: snapshotBefore } = await sb.from('residents')
  .select('unit_id, name, status, lease_signed, deposit_paid')
  .in('unit_id', syncedUnitIds);
```

### Env vars to add

**Local `.env`** — copy the 3 vars from `scripts/meeting-capture/.env`:
```
GMAIL_USER=<from meeting-capture .env>
GMAIL_APP_PASSWORD=<from meeting-capture .env>
MEETING_EMAIL_TO=<from meeting-capture .env>
```

**GitHub Actions secrets** (Settings → Secrets and variables → Actions):
Add the same 3 secrets: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MEETING_EMAIL_TO`
(values are in the meeting-capture `.env` file — do not hardcode them in docs).

**`nodemailer` dependency**: Already installed in `meeting-capture/node_modules`.
Check if it's in the root `package.json` — if not, run `npm install nodemailer --save`.

---

## What NOT to touch

- `scripts/meeting-capture/` — nothing changes here, credentials are just reused
- `scripts/sync-from-numbers.mjs` lines 1–195 — core sync logic untouched
- All existing Netlify functions — no changes
- Supabase schema — no changes

---

## Summary checklist

### Feature 1 (Sync button)
- [ ] Create `netlify/functions/trigger-sync.js`
- [ ] Add `syncing` state + button to `src/App.jsx` header (before Export button)
- [ ] Add `GITHUB_TOKEN` to Netlify env vars

### Feature 2 (Change email)
- [ ] Add snapshot line before delete block in `sync-from-numbers.mjs` (~line 196)
- [ ] Add email block at end of `sync-from-numbers.mjs`
- [ ] Add `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MEETING_EMAIL_TO` to local `.env`
- [ ] Add same 3 vars as GitHub Actions secrets
- [ ] Confirm `nodemailer` is in root `package.json` (or `npm install nodemailer --save`)
- [ ] Deploy to Netlify + push to GitHub
