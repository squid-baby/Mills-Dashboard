# Mills Rentals Dashboard

**Production URL**: https://mills-dashboard.netlify.app

## Architecture

### Data Sources
**Single source of truth:** the **Neo Google Sheet** ("Mills Dashboad - Neo", env `SHEET_ID_PROPERTY_INFO`). Three tabs feed the dashboard:

| Tab | Used for | Sync direction |
|---|---|---|
| `Tenant Info` | Residents, next residents, lease/move dates | **Read-only by sync** (residents + next_residents replace per matched unit) |
| `property-info-clean` | All unit attributes (beds, owner, codes, appliances, paint, etc.) | **Read by sync** (upserts units); **read/write by dashboard** via `get-property-info` / `update-property-info` |
| `Turnover Inspections` | Inspection records | Written by `save-inspection.js`; read by `get-inspection.js`, `get-all-inspections.js`. **Phase B (deferred):** convert writes to append-only. |
| `Property Info History` | Audit log | Appended on every property field edit by `update-property-info.js` |

Amanda's `.numbers` file is now a **frozen Drive backup**, no longer read by anything. To roll back the migration, `git revert` the cutover commits and restore the deleted scripts from history.

### Sync Pipeline
```
Amanda edits Neo Google Sheet (any of the 3 read-by-sync tabs)
  ↓
GitHub Actions sync-neo.yml (daily at 8am ET) or manual:
  node scripts/sync-from-neo.mjs
    1. batchGet "Tenant Info" + "property-info-clean" in one Sheets API call
    2. Validate required headers in BOTH tabs; exit non-zero before any write if missing
    3. Build canonical address map (Tenant Info Property column wins on spelling)
    4. Validate every Tenant address resolves to a unit (existing or to-be-upserted);
       exit non-zero before any delete if not — per "no lost properties" rule
    5. Upsert units by address (BATCH=50, onConflict='address')
    6. Snapshot residents + next_residents → delete → re-insert (per matched unit)
    7. Send change-summary email if Gmail env vars set

Dashboard reads:
  /api/get-units → Supabase (units + residents + next_residents)
  /api/get-property-info → live Google Sheet read (always fresh)

Dashboard writes:
  /api/update-property-info → Google Sheet (then next sync picks up)
  /api/save-inspection → "Turnover Inspections" tab
  /api/save-note → Supabase notes table (separate table, not the Sheet)
```

### Tenant Info reader
Header-based lookup with aliases — see `src/config/tenantInfoColumns.js`. The field-spec module uses normalized (case-insensitive, smart-quote-tolerant) header matching with multiple aliases per field, so renaming columns in the sheet won't break the sync. `Property` and `Resident` are the only required headers — sync exits non-zero before any delete if they go missing.

### Sync safety mechanics
- **Always preview first:** `node --env-file=.env scripts/sync-from-neo.mjs --dry-run`. Prints the planned diff (units to upsert, residents to delete/insert, sample rows, any unresolved addresses). Zero Supabase writes. The cloud workflow does not pass `--dry-run`.
- **Fail-loud on missing headers:** required headers (`Property` in both tabs, `Resident` in Tenant Info) absent → exit non-zero before any write.
- **Fail-loud on unresolved tenants:** every Tenant Info address must resolve to a unit (existing in Supabase or about to be upserted). If any don't, exit non-zero before any resident delete. This enforces the "don't lose properties" rule.

**Key gotcha (Neo migration, April 2026):** Property-info-clean's `Notes` column maps to `units.unit_notes` (not `units.notes`) to avoid collision with the resident-derived `notes` aggregation in `get-units.js`. PropertyInfoTab.jsx reads/writes `unit_notes`. Don't reintroduce `'Notes': 'notes'` in `HEADER_TO_FIELD`.

**Key gotcha (Neo migration, April 2026):** Owner / Area come from `property-info-clean` only. The Tenant Info tab also has Owner / Area columns but they're advisory display columns for Amanda — the sync ignores them. If owner appears wrong on a tile, fix it in property-info-clean.

**Key gotcha (fixed March 2026):** `get-units.js` was originally reading from Google Sheets, not Supabase. It now queries Supabase directly. If the dashboard shows "Local data" instead of "Synced", the Netlify function is failing — check Netlify function logs.

**Key gotcha (fixed April 2026):** `sync-from-neo.mjs`'s predecessors used to upsert new `units` rows from the tenant source, causing duplicate tiles. The current script upserts units by address from `property-info-clean` only, then attaches residents to those units. Address matching is three-tier: exact → normalized (lowercase, strip periods, collapse spaces) → suffix-stripped (removes trailing St/Dr/Ave/etc.).

**Duplicate cleanup (April 2026):** 26 orphan duplicate unit rows were cleaned up — these were address variants (e.g. "230 Valley Park" vs "230 Valley Park Dr", "201 E. Carr St" vs "201 E Carr St") left over from before the suffix-aware matching was added. `cleanup-duplicate-units.mjs` dynamically discovers the Google Sheet tab name (currently "property-info-clean") to avoid breakage if the tab is renamed again.

### Supabase Schema
- `units` — one row per property (address, beds, baths, area, owner_name, utilities, property_type, sq_ft, freeze_warning, pets_allowed, year_built, town, washer, dryer, dishwasher, gas, sump_pump, breaker_box, ac_type, heat_type, sheet_notes)
- `residents` — one row per current resident (name, email, phone, status, lease_end, move_out_date, lease_signed, deposit_paid, notes)
- `next_residents` — one row per future resident (name, email, phone, move_in_date)
- `unit_full` — view joining units + residents + next_residents (reference only; `get-units.js` queries tables directly to get all fields including phone and move_out_date)
- `notes` — per-unit notes (id, unit_id, text, created_by, created_at)
- `inspections` — per-unit inspection records (id, unit_id, inspector, inspection_date, overall_condition, overall_notes, items_json, created_at, updated_at)
- `calendar_tasks` — turnover calendar tasks (id uuid, unit_address text, task_type, start_date, start_slot, end_date, end_slot, crew, notes, status, created_at, updated_at)
- `pending_changes`, `sync_log` — supporting tables

**Phase 2 SQL (already run):** Added 11 new columns to `units` + created `notes` and `inspections` tables. If setting up fresh, run the SQL block from the Phase 2 migration handoff.

### Tenant Info column mapping (header-name based, source-agnostic)
Mappings live in `src/config/tenantInfoColumns.js`. Lookup is by **header name** (case-insensitive, smart-quote-tolerant); column position is irrelevant. Each field key carries aliases — current Neo header first, then prior names — so renaming columns in Neo won't break the sync.

| Field key (sync) | Neo header | Legacy `.numbers` header | Supabase target |
|---|---|---|---|
| `address` | Property | Property | `units.address` (resolves to `unit_id`) |
| `residentName` | Resident | Resident | `residents.name` |
| `residentEmail` | Email | Email | `residents.email` |
| `residentPhone` | Phone | Phone | `residents.phone` |
| `leaseEnd` | Lease End | Lease end date | `residents.lease_end` |
| `status` | Status | Status | `residents.status` |
| `leaseSigned` | Lease Signed | lease signed | `residents.lease_signed` |
| `depositPaid` | Deposit Paid | Deposit paid | `residents.deposit_paid` |
| `moveOut` | Move Out Date | Move Out Date | `residents.move_out_date` |
| `notes` | Notes | Notes | `residents.notes` |
| `nextResident` | Next Resident | Resident for Next Year | `next_residents.name` |
| `nextEmail` | Next Email | Next Resident's Email | `next_residents.email` |
| `nextPhone` | Next Phone | Next Resident's Phone Number (if new tenant) | `next_residents.phone` |
| `nextMoveIn` | Next Move In | Next Residents Move In Date | `next_residents.move_in_date` |
| `owner` | Owner | Owner | `units.owner_name` |
| `area` | Area | Area | `units.area` |

`address` and `residentName` are required — sync exits non-zero before any delete if they're missing. Optional fields write null/empty if absent.

`Freeze Warning` exists in the Tenant Info source but is **not synced from there** — `freeze_warning` on a unit comes from the `property-info-clean` tab. Same for `owner` and `area` (Tenant Info versions are advisory; property-info-clean is authoritative).

### Netlify Functions
| Function | Method | Purpose |
|----------|--------|---------|
| `get-units` | GET | Queries Supabase `units` with embedded `residents` + `next_residents`, derives status groups |
| `get-property-info` | GET | Fetches property fields from Google Sheet (all fields in `src/config/columns.js`) |
| `update-property-info` | POST | Updates a property field in Google Sheet + appends history |
| `save-inspection` | POST | Saves/updates turnover inspection to Google Sheet |
| `get-inspection` | GET | Fetches a single inspection by address |
| `get-all-inspections` | GET | Fetches all inspection summaries (address + overallCondition) |
| `get-notes` | GET | Fetches all notes for a unit from Supabase `notes` table (by `unit_id`) |
| `save-note` | POST | Inserts a note into Supabase `notes` table (`unit_id`, `text`, `created_by`) |
| `get-calendar-tasks` | GET | Fetches calendar tasks by date range (`?start=&end=`), overlap query |
| `save-calendar-task` | POST | Upsert calendar task (id present → update, else insert) |
| `delete-calendar-task` | POST | Delete calendar task by `{ id }` |
| `trigger-sync` | POST | Dispatches GitHub Actions `sync-neo.yml` workflow via `workflow_dispatch`. Requires `GH_DISPATCH_TOKEN` env var (actions:write scope). Returns `{ ok: true }` on 204 from GitHub. |
| `recording-status` | GET / POST | Backs the inline REC pill in the dashboard header. GET is public; returns `{ recording, since, updatedAt }`. POST is gated by the `X-Recording-Secret` header matching the `RECORDING_SECRET` env var; body `{ recording: bool }`. State stored in a Netlify Blob (`recording-status` store). Pushed by `scripts/meeting-capture/record-meeting.sh` on start/stop. |

### Column Config (`src/config/columns.js`)
Single source of truth for the property-info-clean tab ↔ field key mapping, used by `get-property-info.js`, `update-property-info.js`, and `sync-from-neo.mjs`. **Add new property-side fields here only.**
- `HEADER_TO_FIELD` — sheet header → field key (supports aliases for legacy column names)
- `FIELD_TO_HEADER` — field key → canonical sheet header (used for writes)
- `NEW_SHEET_COLUMNS` — columns appended by the migration script
- `SHEET_TABS` — single source of truth for tab names (`PROPERTY_INFO`, `HISTORY`, `INSPECTIONS`, `TENANT_INFO`)

**Column lookup is name-based, not positional.** Rearranging columns in the Google Sheet is safe — code finds columns by scanning the header row. Do not use column indices anywhere.

**Notes vs unit_notes (April 2026):** The `Notes` column in property-info-clean maps to the field `unit_notes` (NOT `notes`). This avoids collision with the resident-derived `notes` aggregation that `get-units.js` produces from joining `residents` rows. PropertyInfoTab.jsx reads/writes `unit_notes`. Do not change `'Notes': 'unit_notes'` in `HEADER_TO_FIELD`.

**Legacy column U ("Door Codes"):** The original sheet had door codes at column U before the dashboard-managed fields were moved to AF ("Door Code"). Column U still has some legacy door code data for a handful of properties. The dashboard reads from AF (canonical). Do not delete or rename the U header.

### Property Info Sheet (Google Sheet) Columns
Column positions may shift as the team rearranges the sheet — always rely on header names, not column letters. Known notable columns (as of April 2026):
- A: Property (address — must match Supabase `units.address` exactly for syncing)
- Dashboard-managed fields: Door Code, Lockbox Code, appliance service records, paint info
- BB: Stove, BC: Stove Replaced, BD: Stove Warranty (added April 2026)
- Legacy column U: "Door Codes" — has some old data, do not remove

### Scripts
| Script | Purpose | Run |
|--------|---------|-----|
| `sync-from-neo.mjs` | Single-pass sync: reads "Tenant Info" + "property-info-clean" tabs of the Neo sheet, upserts units, replaces residents/next_residents, sends change-summary email. Always preview first with `--dry-run`. Fails loudly before any write if a required header is missing or any Tenant address fails to resolve. | Scheduled (GH Actions) + manual |
| `cleanup-duplicate-units.mjs` | One-time: finds Supabase unit rows whose address doesn't match any property-info-clean row and deletes them. Dry-run by default; pass `--confirm` to delete. | Manual only |
| `add-missing-properties.mjs` | One-time: adds new properties to property-info-clean (used April 2026 for 5 Howell St + 203 E. Carr St). Safe to re-run (skips existing). Run sync-from-neo.mjs after. | Manual only |
| `seed-units-from-csv.mjs` | One-time: original seed of Supabase units from `Mills_Dashboard_Property_info_sheet.csv`. | Manual only |
| `migrate-sheet2-to-gsheet.mjs` | One-time: migrated Numbers Sheet 2 → Google Sheet during initial property-info migration. | Manual only / historical |
| `db/migrations/2026-04-28-expand-units-for-neo.sql` | One-time: adds 32 nullable text columns to `units` (door_code, lockbox_code, appliance service records, paint, portfolio, lead_paint, etc.). Idempotent — `IF NOT EXISTS`. Apply in Supabase SQL editor before first run of `sync-from-neo.mjs`. | One-time, in Supabase SQL editor |

## Theming

### Light/Dark Mode Toggle
The dashboard supports dark and light mode with a toggle button (sun/moon icon) in the header.

**How it works:**
- Inline `<script>` in `index.html` sets `data-theme` attribute on `<html>` before React renders (no flash)
- Reads `localStorage('mills_theme')`, falls back to `prefers-color-scheme` system preference
- React state in `App.jsx` stays in sync and persists choice to localStorage
- CSS custom properties in `src/index.css` handle surfaces, text, borders, shadows — `:root` = dark defaults, `[data-theme="light"]` = overrides

**Status badge colors:**
- Dark mode palette: `GC` in `src/data/units.js` — bright colors on dark backgrounds
- Light mode palette: `GC_LIGHT` in `src/data/units.js` — pastel backgrounds with dark text
- Helper: `getGC(theme)` returns the correct palette
- All light mode text/background pairs verified WCAG AA (4.5:1 minimum contrast)

**Adding new theme-aware colors:**
1. Add the CSS variable to both `:root` and `[data-theme="light"]` in `src/index.css`
2. For status-specific colors, add entries to both `GC` and `GC_LIGHT` in `src/data/units.js`
3. Components receive `theme` as a prop from `App.jsx` and use `getGC(theme)` instead of `GC` directly

**Not yet themed (Phase 2):** Hardcoded semantic colors in components — red alerts (`#f87171`), green success (`#34d399`), yellow warnings (`#fbbf24`). These read fine on light backgrounds but aren't perfectly tuned.

## Turnover Calendar

### Overview
Swimlane-style calendar for scheduling turnover work during May–August season. Accessible from the "Calendar" button in the dashboard header. The header morphs between dashboard and calendar modes (no extra nav bar).

### Architecture
- **Views**: Month (grid with task pills, click day → Day), Week (swimlane with AM/PM slots), Day (expanded task cards)
- **Data**: `calendar_tasks` table in Supabase, keyed by `unit_address` (text, not unit_id FK — because `get-units.js` replaces Supabase UUIDs with sequential indices)
- **Task types**: move_out (orange), paint (blue), repair (red), clean (teal), finalize (amber), move_in (green)
- **Slots**: AM/PM half-day granularity only (no hour grid)
- **Ghost tasks**: Client-side generated from lease data (leaseEnd → ghost move_out, moveInDate → ghost move_in) for turnover units missing real tasks of those types. Rendered with dashed borders and 50% opacity. Users can Confirm (saves as real task) or Dismiss (hidden for session).

### Key Files
| File | Purpose |
|------|---------|
| `src/data/calendar.js` | Task colors (dark/light), date/slot helpers, lane assignment algorithm |
| `src/components/calendar/CalendarView.jsx` | Main container — state, data fetching, ghost task generation, zoom switching |
| `src/components/calendar/MonthView.jsx` | Month grid with colored task pills per day |
| `src/components/calendar/DayView.jsx` | AM/PM sections with expanded task cards |
| `src/components/calendar/TaskCreateModal.jsx` | Create task modal with unit picker, type buttons, date/slot pickers |
| `src/components/calendar/PropertyDetailPanel.jsx` | Slide-in panel showing all tasks for a property, edit/delete/confirm/dismiss |

### Task Color Config
- Dark mode: `TASK_COLORS` in `src/data/calendar.js`
- Light mode: `TASK_COLORS_LIGHT` in `src/data/calendar.js`
- Helper: `getTaskColors(theme)` — mirrors the `getGC(theme)` pattern from units

### Key Gotchas
- **`unit_address` not `unit_id`**: Calendar tasks reference units by address string, not Supabase UUID. This is because `get-units.js` `buildUnit()` replaces the real UUID with a sequential index — so the frontend `unit.id` is NOT the Supabase ID.
- **`task_type` not `type`**: The Supabase column and all data objects use `task_type`. Do not use `task.type` — it will be undefined and fall back to the clean color.
- **`turnoverNotes` is always empty**: Use `unit.notes` for actual resident notes (from Amanda's Numbers col 9).
- **Ghost tasks are session-only**: Dismissed ghosts reset on page refresh. Confirmed ghosts become real Supabase tasks.

### Planned Enhancements
- Drag-to-reschedule (mousedown/touchstart → snap to slot on release)
- Mobile polish (touch targets, full-screen modals, responsive week grid)

## Recording Status Indicator

Inline REC pill in the dashboard header (next to the "Synced" indicator) that appears only when the meeting Mac is actively recording. Addresses Andrea's privacy concern: she wants to know when the computer is listening to her, visible wherever she's already looking on the dashboard.

- **UI**: red pill with blinking dot + "REC" text, rendered in `src/App.jsx` (header indicator block). Hidden when not recording. Polls `/api/recording-status` every 4s. The blinking is driven by `.rec-dot { animation: pulse 1.2s ... }` in `src/index.css` (reuses the existing `@keyframes pulse`).
- **Function**: `netlify/functions/recording-status.js` — Netlify Blobs storage (no SQL). GET is public, POST requires `X-Recording-Secret` header.
- **Local-only fallback**: `scripts/meeting-capture/status-server.js` + `status.html` — same UX served on `localhost:2626`, watches `/tmp/meetings/recording.pid` directly. Useful for the Mac itself or a tablet on the same LAN if the cloud is down.
- **Wiring**: `record-meeting.sh` calls `publish_status true` after starting ffmpeg and `publish_status false` after killing it. Best-effort `curl` (5s timeout, backgrounded with `&`) — never blocks recording even if the network is offline. Requires `RECORDING_STATUS_URL` and `RECORDING_SECRET` in `meeting-capture.env`; if either is missing the function is a no-op.

## Key Decisions (April 2026)

### Sync Button + Change Email
- **Sync button** in dashboard header (next to Export Turnovers) triggers the GitHub Actions `sync-numbers.yml` workflow via `POST /api/trigger-sync`. The `GITHUB_TOKEN` (actions:write scope) lives in Netlify env vars — never in the browser.
- Button states: Idle → Syncing… → ✓ Triggered (green, 3s) or ✗ Failed (red, 3s). Note: GHA takes ~60–90s to finish after dispatch is accepted.
- **Change summary email**: After each sync, `sync-from-numbers.mjs` snapshots residents/next_residents before the delete-and-reinsert, diffs after, and emails changes (adds, removes, status/lease/deposit flips, next resident changes) to `MEETING_EMAIL_TO` via nodemailer/Gmail. No changes = no email. Missing Gmail env vars = silently skipped.
- Email env vars: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MEETING_EMAIL_TO` — same credentials as `scripts/meeting-capture/`.

### Notes Migrated to Supabase
- Notes were previously stored in browser `localStorage` (key `mills_notes`). Now stored in Supabase `notes` table, shared across users/devices.
- `DetailPanel.jsx` fetches notes via `/api/get-notes` on mount and saves via `/api/save-note` (POST). No more `onAddNote` prop or `_userNotes` enrichment in `App.jsx`.
- CSV export ("Export Turnovers") fetches dashboard notes from Supabase ("Dashboard Notes" column) and full inspection detail per unit, alongside "Turnover Notes" (from Amanda's spreadsheet).
- Export now respects the current filtered view — if you filter to one property, only that property exports.
- `created_by` defaults to `'Team'` for all notes (no per-user auth yet).

### Appliance Fields
- Stove, Stove Replaced, Stove Warranty added to match the pattern of washer/dryer/dishwasher/fridge.
- Stove is a free-text field (e.g. "GE Gas 30"") — not a boolean like the presence fields.
- All three live in the Google Sheet only (not synced to Supabase).
- To add future appliance fields: add to `HEADER_TO_FIELD` + `FIELD_TO_HEADER` in `columns.js`, add to `units.js` appliances section, append column header to the Sheet.

### Unit Row Authority
- The Property Info Google Sheet is the **sole authority** for what units exist in Supabase.
- `sync-from-numbers.mjs` never creates unit rows — it only attaches residents to units that already exist.
- To add a new property: add it to the Property Info Google Sheet first, then run `sync-property-cache.mjs`.

## Key Decisions (March 2026)

### Data Safety
- Amanda's `.numbers` file is the **single source of truth** for tenant data. The dashboard NEVER writes to it. Changes flow: `.numbers` → Supabase → dashboard (read-only).
- Property Info Google Sheet is the only thing the dashboard writes to.

### Flagging Rules
- **"4+B Unrented"**: 4+ bed properties not renewed by Nov 1 or not rented by Jan 1 (relative to lease end year). Red badge.
- **"Needs Attention"**: Any property available 30+ days without a lease. Red badge.
- **"60 Day"**: Within 60 days of lease end, no renewal or new lease. Red badge.
- Badge priority: worst flag wins on tile; all flags shown in DetailPanel.

### Turnover Window
- Move-out and Move-in dates define the work window for turnovers.
- Dashboard shows both dates + calculated "Turn Window: X days" with color coding:
  - Red: 7 days or fewer
  - Amber: 8-14 days
  - Green: 15+ days
- Only displayed for turnover groups.

### Contact Info
- Individual copy-to-clipboard buttons next to each person's phone and email.
- No tel: or sms: links — workers copy and paste into Google Voice manually.

### Turnover Inspections
- Third tab in DetailPanel (only for turnover groups).
- Full inspection form: replacement items, paint, 50+ condition assessment items, overall rating.
- Data saved to Google Sheet as JSON blob per inspection.
- Overall condition (Up to date / Needs love / At risk) shows as colored dot on tiles.
- Export button in main header: "Export Turnovers" — exports current filtered view (only future move-in dates). Shows "Exporting..." while fetching data.
- Export CSV columns: Address, Beds, Lease End, Move Out, Move In, Turn Window (days), Current Tenants, Next Tenants, Overall Condition, Inspector, Inspection Date, Overall Notes, Replacement Items, Needs Attention Now, Update Next Turn, Paint, Turnover Notes (from Amanda's spreadsheet), Dashboard Notes (from Supabase).
- `Turnover Notes` = `unit.notes` (resident notes from Supabase, sourced from Amanda's Numbers col 9). `turnoverNotes` field on unit objects is always empty — do not use it.
- Full inspection detail is fetched per-unit via `/api/get-inspection` during export (not from the `inspectionConditions` summary map).

## Troubleshooting

**Dashboard shows "Local data" (orange dot)** — Netlify function failed. Check Netlify function logs. Common causes: Supabase credentials missing in Netlify env vars, Supabase down.

**Dashboard data is stale / changes not showing** — The sync didn't run. Check:
1. Preview the diff: `node --env-file=.env scripts/sync-from-neo.mjs --dry-run`
2. Run sync manually: `node --env-file=.env scripts/sync-from-neo.mjs`
3. Check the daily GitHub Actions run: https://github.com/squid-baby/Mills-Dashboard/actions/workflows/sync-neo.yml — was the last run green?

**Sync exits with "Missing required column header(s)"** — A required header (`Property` in either tab, or `Resident` in Tenant Info) is no longer present under any known alias. Open the Neo sheet, confirm the actual header text, and add it to the relevant `headers` array in `src/config/tenantInfoColumns.js` (Tenant Info) or `HEADER_TO_FIELD` in `src/config/columns.js` (property-info-clean). The sync correctly refused to delete residents — no data was lost.

**Sync exits with "N Tenant Info address(es) do not resolve to any unit"** — The named addresses appear in Tenant Info but not in property-info-clean (and don't fuzzy-match anything there either). Either add them to property-info-clean, or correct the spelling in Tenant Info to match. The sync refused to touch residents — no data was lost.

**Owner/area appearing wrong on tiles** — Almost always means property-info-clean has the wrong value. Fix it in the Neo sheet, then run sync. Reminder: Tenant Info's Owner/Area columns are advisory and **not synced** — they're for Amanda's view only.

**Sync fails with "invalid input syntax for type integer"** — A free-text value landed in an integer column (`year_built`, `sq_ft`). The script's `coerce()` function uses `parseInt` which extracts leading digits ("1925, 1995 renov." → 1925), but if the cell starts with non-digits, it returns null. If null is invalid for the column, fix the source cell or relax the column type.

**Phone numbers / new columns not appearing** — The header probably isn't in the field-spec. Inspect the source headers (run `--dry-run` and look at the `Header map` line). For Tenant Info, add to `src/config/tenantInfoColumns.js`. For property-info-clean, add to `HEADER_TO_FIELD` in `src/config/columns.js`. If the target Supabase column doesn't exist yet, add it via a new SQL migration in `db/migrations/`.

**`netlify dev` API endpoints hang locally** — macOS Google Drive sync creates `._*` resource-fork files alongside every function file. Netlify-dev tries to load those as functions and routing breaks. Workaround: delete the `netlify/functions/._*` files (they regenerate harmlessly when Drive next syncs) before running `netlify dev`. The deployed Netlify site doesn't have this issue.

**Need to roll back the Neo migration** — `git revert` the merge commit. The `.numbers` file is still in Drive at `/Volumes/One Touch/The_Team_Google_Drive Sync/2025-2026 Renewals_Dashboard.numbers` as a frozen backup. Restoring `sync-from-numbers.mjs` + `sync-property-cache.mjs` + `download-numbers-file.mjs` from history pre-cutover gets you back to the prior architecture.

**Adding a new property info field** — Two-step process: (1) add a SQL migration in `db/migrations/` that adds the column to `units`, run it in Supabase. (2) Add `HEADER_TO_FIELD` + `FIELD_TO_HEADER` entries in `src/config/columns.js`. Next sync run picks it up automatically.

## Dev Setup
```bash
npm install
# Copy .env.example to .env and fill in credentials
npx netlify dev  # Runs on port 8888, proxies /api to Netlify functions
```

## Environment Variables
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Supabase service role key (never commit this)
- `GOOGLE_SERVICE_ACCOUNT_JSON` — Google service account credentials (one service account, used for all Neo sheet reads/writes)
- `SHEET_ID_PROPERTY_INFO` — Neo Google Sheet ID (hosts all four tabs)
- `GH_DISPATCH_TOKEN` — GitHub PAT with `actions:write` scope (Netlify env var, used by `trigger-sync.js` to dispatch `sync-neo.yml`)
- `GMAIL_USER` — Gmail address for sending change summary emails (optional)
- `GMAIL_APP_PASSWORD` — Gmail app password (optional)
- `MEETING_EMAIL_TO` — recipient for change-summary emails (optional)
- `RECORDING_SECRET` — shared secret protecting `POST /api/recording-status`. Set in Netlify env vars **and** in `scripts/meeting-capture/meeting-capture.env` on the recording Mac. Any random ~32-char string works (e.g. `openssl rand -hex 16`).

**GitHub Actions secrets** (used by `.github/workflows/sync-neo.yml`): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SHEET_ID_PROPERTY_INFO`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MEETING_EMAIL_TO`. The pre-Neo `NUMBERS_FILE_ID` secret is no longer used — safe to delete or leave.
- `MEETING_EMAIL_TO` — Recipient address for sync change emails + meeting summaries (optional)
