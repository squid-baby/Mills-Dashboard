# Mills Rentals Dashboard — Improvements

Identified gaps and opportunities based on the current product spec (April 2026). Grouped by impact area.

---

## 1. Authentication & Multi-User Support

**Current state:** No login. All users share a single view with no identity. Notes default to `created_by: 'Team'`.

**Problems:**
- Can't attribute changes, notes, or inspection submissions to a specific person
- No audit trail for property edits (history tab tracks the change but not who made it)
- Anyone with the URL can read all tenant PII (names, phones, emails)

**Improvements:**
- Add simple password gate or Netlify Identity (magic-link email auth)
- Capture the logged-in user name in note `created_by`, inspection `inspector`, and property history rows
- Restrict URL sharing (basic auth or invite-only)

---

## 2. Stale Data Visibility

**Current state:** A sync button triggers a GitHub Actions workflow, but the dashboard has no feedback on whether the last sync actually succeeded or when it ran. The "↻ Sync" button only confirms the dispatch — not completion.

**Problems:**
- Team can't tell if Supabase data is hours or days old
- If the scheduled sync job fails silently, no one knows
- The "Local data" orange dot only appears when the Netlify function fails, not when data is stale

**Improvements:**
- Store last successful sync timestamp in Supabase (`sync_log` table already exists — surface it)
- Show "Last synced: X minutes ago" in the dashboard header
- Color the timestamp amber/red if sync is older than 24 hours
- Add a `sync_log` entry on every run (success and failure) so failures are visible
- Optionally: webhook or polling so the UI updates automatically after a sync completes (~90s)

---

## 3. Ghost Tasks Reset on Every Page Refresh

**Current state:** Dismissed ghost tasks (auto-generated from lease data) are session-only — they reappear on every page reload.

**Problems:**
- Team members dismiss the same ghost tasks repeatedly
- No way to say "we're not scheduling this turnover" without creating a real task

**Improvements:**
- Persist dismissed ghosts to `localStorage` keyed by unit address + task type + lease year
- Or: add a `dismissed` boolean to `calendar_tasks` so dismissals survive across sessions and devices
- Consider a third action alongside Confirm/Dismiss: "Not needed" — saves a real task with status `skipped`

---

## 4. Calendar Lacks Drag-to-Reschedule

**Current state:** Tasks can only be rescheduled by opening the edit modal and changing dates.

**Problems:**
- Slow to adjust multiple tasks during planning sessions
- No visual feedback when adjusting a two-week work schedule

**Improvements:**
- Implement drag-to-reschedule in the week/day view: `mousedown` on a task → follow cursor → snap to slot on `mouseup`
- Show a drop target highlight on valid slots during drag
- Touch support (`touchstart`/`touchmove`/`touchend`) for tablet use in the field

---

## 5. Inspection Data Buried in Google Sheets

**Current state:** Inspections are stored as a JSON blob per row in a Google Sheet. All inspection detail is fetched per-unit during CSV export.

**Problems:**
- Slow export (one HTTP request per unit)
- Hard to query across inspections ("which units are At risk?")
- Google Sheet is a fragile storage format for structured JSON

**Improvements:**
- Migrate inspections to the existing Supabase `inspections` table (schema already defined in CLAUDE.md)
- Update `save-inspection.js` and `get-inspection.js` to read/write Supabase instead of Google Sheets
- `get-all-inspections.js` can become a single Supabase query instead of a Sheet scan
- Export can join inspections at query time — no per-unit HTTP fan-out

---

## 6. Property Info Accordion UX

**Current state:** Property Info tab has multiple accordion sections. Each field is individually editable with save/cancel buttons.

**Problems:**
- Editing several fields requires many round-trips (one save per field)
- No visual indication if a field has unsaved changes vs. a saved value
- Saving one field while another is in edit state is confusing

**Improvements:**
- Add a section-level "Edit all" / "Save section" mode: enter edit mode for the whole accordion section, make changes to multiple fields, then save once
- Dirty-field highlighting (e.g. yellow border) on fields that have been changed but not saved
- Optimistic UI: update the displayed value immediately, roll back on error

---

## 7. Contact Info Handling

**Current state:** Phone and email are copy-to-clipboard only — no `tel:` or `sms:` links by design (workers use Google Voice).

**Potential improvement:**
- Add a configurable setting (environment variable or localStorage flag) to toggle between copy-to-clipboard and `tel:`/`sms:` links, so the dashboard works for teams with different workflows
- Low priority; current approach is intentional

---

## 8. Turnover CSV Export Performance

**Current state:** Export fetches full inspection data per-unit via individual `/api/get-inspection` calls during export.

**Problems:**
- N+1 HTTP requests — slow for large filtered sets
- If any single unit request fails, the export is incomplete (no partial-failure handling)

**Improvements:**
- Add a `/api/get-all-inspections-full` endpoint that returns complete inspection data for all units in a single query
- Or: after the inspections-to-Supabase migration (#5 above), the export can JOIN at query time in `get-units`
- Add error resilience: if an inspection fetch fails, include the row with blank inspection columns rather than aborting

---

## 9. No Offline / Low-Connectivity Mode

**Current state:** The dashboard caches the last successful fetch in `localStorage` and shows it if the Netlify function fails. But the cache is static — no updates while offline.

**Improvements:**
- Service worker for full offline support (read-only) — the tile grid and detail panel work from the cache
- Queue writes (notes, property edits, inspection saves) while offline; sync on reconnect
- Show a clear "Offline — showing cached data from [timestamp]" banner

---

## 10. Mobile / Tablet Polish

**Current state:** The grid is responsive but not optimized for touch. The calendar week view is a wide table that requires horizontal scrolling on mobile.

**Improvements:**
- Increase touch target sizes on tiles and calendar tasks (min 44×44px)
- Full-screen modals (bottom sheet pattern) for detail panel and task create modal on small screens
- Calendar: collapse week view to a single-day column on screens < 640px; use horizontal swipe to advance days
- Test on iOS Safari and Android Chrome (known issues: `position: sticky` on mobile, scroll chaining)

---

## 11. Missing Fields / Data Gaps

Based on the Numbers sheet schema and current Supabase columns, a few fields exist in the data but aren't fully surfaced:

| Gap | Description |
|-----|-------------|
| `residents.lease_signed` / `deposit_paid` shown for full turnovers | Already fixed (April 2026). Verify partial turnover units also show these. |
| `units.town` | Stored in Supabase but not displayed on tiles or in the detail panel facts grid |
| `units.sq_ft` | Same — stored but not shown |
| `units.year_built` | Same |
| `units.pets_allowed` | Stored but not shown in Property Info tab |
| Next resident phone | Shown, but no copy-to-clipboard button (current residents have it; next residents don't) |

---

## 12. Sync Change Email Format

**Current state:** Change summary email lists raw diffs after each sync (adds, removes, status flips, deposit/lease changes).

**Improvements:**
- HTML email with a simple table layout (address | old value → new value)
- Group changes by type (new leases, departures, status changes) rather than a flat list
- Add a direct link to the affected unit in the dashboard (deep-link by address)
- Configurable recipients (multiple addresses, not just `MEETING_EMAIL_TO`)

---

## Priority Summary

| # | Improvement | Effort | Impact |
|---|-------------|--------|--------|
| 5 | Migrate inspections to Supabase | Medium | High — fixes export perf + enables queries |
| 2 | Surface last sync timestamp | Low | High — removes "is data stale?" uncertainty |
| 3 | Persist dismissed ghost tasks | Low | Medium — removes repetitive dismissals |
| 6 | Section-level edit mode for Property Info | Medium | Medium — faster data entry |
| 4 | Drag-to-reschedule in calendar | High | Medium — better planning UX |
| 8 | Export N+1 fix | Low | Medium — faster CSV export |
| 1 | Auth / user identity | High | Medium — needed before wider team rollout |
| 11 | Surface missing fields | Low | Low-Medium — quick wins |
| 10 | Mobile polish | Medium | Low-Medium — depends on usage patterns |
| 9 | Offline mode | High | Low — Netlify is reliable; cache fallback covers most cases |
| 12 | Sync email improvements | Low | Low |
| 7 | Configurable contact links | Low | Low |
