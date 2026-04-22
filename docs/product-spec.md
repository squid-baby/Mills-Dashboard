# Mills Rentals Dashboard — Product Specification

**Production URL:** https://mills-dashboard.netlify.app  
**Last updated:** April 2026  
**Stack:** React (Vite), Netlify Functions, Supabase, Google Sheets API

---

## 1. Purpose

The Mills Rentals Dashboard is an internal tool for the Mills Rentals team to track lease renewals, monitor tenant status, manage property information, schedule turnover work, and conduct move-out inspections — all in one place. It is read-only for tenant data and read-write for property data and operational records.

---

## 2. Users

| Role | Description |
|------|-------------|
| Amanda | Owns the source-of-truth Numbers spreadsheet; triggers syncs; monitors renewal status |
| Team members | View tenant info, manage property details, conduct inspections, schedule turnover work |

No per-user authentication. All users share the same dashboard with the same read/write access. Notes default to `created_by: 'Team'`.

---

## 3. Data Architecture

### 3.1 Sources of Truth

| Domain | Source | Access |
|--------|--------|--------|
| Tenant / Renewal data | Amanda's `.numbers` file (Google Drive synced) | Read-only via sync pipeline |
| Property attributes | "property-info-clean" tab, Property Info Google Sheet | Read-write |
| Turnover inspections | "Turnover Inspections" tab, same Google Sheet | Read-write |
| Property info history | "Property Info History" tab, same Google Sheet | Append-only |
| Notes | Supabase `notes` table | Read-write |
| Turnover calendar | Supabase `calendar_tasks` table | Read-write |

### 3.2 Supabase Tables

| Table | Description |
|-------|-------------|
| `units` | One row per property — address, beds, baths, area, owner, utilities, appliances, HVAC, misc attributes |
| `residents` | Current residents per unit — name, email, phone, status, lease dates, deposit, notes |
| `next_residents` | Future residents per unit — name, email, phone, move-in date |
| `notes` | Timestamped team notes per unit |
| `inspections` | Move-out inspection records per unit (JSON blob for items) |
| `calendar_tasks` | Turnover work tasks keyed by `unit_address` |
| `pending_changes`, `sync_log` | Supporting sync tables |

### 3.3 Sync Pipeline

```
Amanda edits .numbers file
  → Google Drive syncs locally
  → node scripts/sync-from-numbers.mjs (scheduled or manual)
      → numbers-parser re-exports fresh CSVs
      → Upserts residents/next_residents into Supabase (matches to existing units)
      → Emails change summary if Gmail env vars are set

Property Info Google Sheet edited by team
  → node scripts/sync-property-cache.mjs (scheduled or manual)
      → Reads "property-info-clean" tab
      → Upserts property attributes into Supabase units
```

Dashboard reads from Supabase via `GET /api/get-units`. Property info reads from Google Sheet directly via `GET /api/get-property-info`.

---

## 4. Features

### 4.1 Dashboard — Unit Grid

The main view shows all units as tiles in a responsive grid.

**Unit tile displays:**
- Street address
- Bedroom count
- Lease end date
- Area (Northcutt, Downtown, etc.)
- Left-edge color bar (status color)
- Alert badge (top-right, red) for urgent flags
- Inspection condition flag (bottom-right corner triangle): green/yellow/red
- Notes count indicator

**Status groups** (in priority order):

| Group | Description | Color |
|-------|-------------|-------|
| `full_turnover` | Tenant leaving, no new lease | Orange |
| `partial_turn` | One tenant leaving, another staying | Purple |
| `partial_turn_leased` | Partial turnover with new lease signed | Purple (muted) |
| `turnover_rented` | Turnover unit now leased | Blue |
| `renewing` | Current tenant renewing | Teal |
| `renewed` | Renewal confirmed | Green |
| `month_to_month` | No fixed lease end | Gray |
| `unknown` | Status unclear | Gray (dark) |

**Alert flags** (worst flag wins on tile; all shown in DetailPanel):

| Flag | Condition | Badge |
|------|-----------|-------|
| 4+ Bed Unrented | 4+ bed, not renewed by Nov 1 or not rented by Jan 1 | Red |
| Needs Attention | Available 30+ days with no lease | Red |
| 60 Day | Within 60 days of lease end, no renewal/new lease | Red |

### 4.2 Filtering and Sorting

**Filter controls (header bar):**
- **Search**: Free-text filter across address, resident name, area, owner, notes
- **Group filter**: Dropdown to show one status group only
- **Area filter**: Dropdown to show one area only (Northcutt, Downtown, etc.)

**Sort options:**
- By date (lease end)
- By priority (worst flag first)
- By area
- By owner
- By status group

### 4.3 Summary Bar

Horizontal strip below the header showing counts per status group. Each pill is color-coded. Clicking a pill filters to that group.

### 4.4 Detail Panel

Slide-in panel (right side) opened by clicking any unit tile. Three tabs:

#### Tab 1 — Tenant Info
- Status banner (colored, with group label)
- All active alert flags listed
- Facts grid: beds, baths, lease end, move-out date, move-in date, turn window, owner, area
- Turn window color coding: red ≤7 days, amber 8–14, green 15+
- Current residents: name, email (copy button), phone (copy button), status, lease signed, deposit paid
- Next year residents: name, email (copy button), phone (copy button), move-in date
- Spreadsheet notes (from Amanda's Numbers file, read-only)
- Dashboard notes: team-written timestamped notes, loaded from Supabase, saved via `/api/save-note`

#### Tab 2 — Property Info
Accordion sections (collapsed by default, each expandable):

| Section | Fields |
|---------|--------|
| Access | Door Code, Lockbox Code |
| Appliances | Washer, Dryer, Dishwasher, Fridge, Stove, Stove Replaced, Stove Warranty |
| HVAC & Water Heater | AC Type, Heat Type, and related service records |
| Utilities | Gas, Electric, Water/Sewer |
| Plumbing | Sump Pump info |
| Paint | Paint color, finish, location, date |

Each field is individually editable. Saves write to the Google Sheet and append to history tab. Field history (last N changes with timestamp) viewable inline.

#### Tab 3 — Turnover Inspection (turnover units only)
Full move-out inspection form:
- Inspector name, inspection date
- Replacement items checklist (blinds, bulbs, stove parts, toilet seats, outlets, smoke/CO detectors, keys, custom)
- Paint section (location, color, finish, condition, notes)
- Condition assessment: 10 categories, 40+ items, each rated Good / Fair / Poor
- Overall condition: **Up to date** / **Needs love** / **At risk**
- Submit saves to `/api/save-inspection` (upsert by address)
- Saved inspection loads automatically on panel open
- Overall condition shown as colored corner flag on unit tile

### 4.5 Export Turnovers

Button in header. Exports a CSV of the **currently filtered view** — only units with a future move-in date.

**CSV columns:**
Address, Beds, Lease End, Move Out, Move In, Turn Window (days), Current Tenants, Next Tenants, Overall Condition, Inspector, Inspection Date, Overall Notes, Replacement Items, Needs Attention Now, Update Next Turn, Paint, Turnover Notes (Amanda's spreadsheet), Dashboard Notes (Supabase)

Full inspection detail is fetched per-unit during export from `/api/get-inspection`.

### 4.6 Sync Button

Button in header (↻ Sync). Triggers the `sync-numbers.yml` GitHub Actions workflow via `POST /api/trigger-sync`.

**States:**
- Idle — "↻ Sync"
- Syncing — "Syncing…" (disabled)
- Success — "✓ Triggered" (green, 3 seconds, then resets)
- Error — "✗ Failed" (red, 3 seconds, then resets)

Note: GitHub Actions takes ~60–90 seconds to complete after dispatch is accepted. The button only confirms the dispatch was received.

### 4.7 Turnover Calendar

Separate view accessible via "Calendar" button in header. The header morphs — no extra navigation bar.

**Views:**
- **Month** — Grid with colored task pills per day. Click a day → Day view.
- **Week** — Swimlane layout with AM/PM slots per day.
- **Day** — Expanded task cards with full detail.

**Task types:**

| Type | Color |
|------|-------|
| move_out | Orange |
| paint | Blue |
| repair | Red |
| clean | Teal |
| finalize | Amber |
| move_in | Green |

**Ghost tasks:** Auto-generated from lease data for turnover units missing real tasks of the matching type. Rendered with dashed borders + 50% opacity. Users can:
- **Confirm** — saves as a real Supabase task
- **Dismiss** — hidden for the session (resets on refresh)

**Task granularity:** AM/PM half-day slots only. No hour-level scheduling.

**Data:** `calendar_tasks` table in Supabase, keyed by `unit_address` (text, not FK).

### 4.8 Light/Dark Mode

Toggle button (sun/moon icon) in the header.

- Inline `<script>` in `index.html` sets `data-theme` on `<html>` before React renders (no flash)
- Falls back to OS `prefers-color-scheme`
- Persisted to `localStorage`
- CSS custom properties handle theming; status badge colors use `GC` (dark) and `GC_LIGHT` (light) palettes
- All light-mode text/background pairs verified WCAG AA (4.5:1 minimum contrast)

---

## 5. API — Netlify Functions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/get-units` | GET | Queries Supabase units + residents + next_residents, returns enriched unit list |
| `/api/get-property-info` | GET | Reads property fields from Google Sheet by address |
| `/api/update-property-info` | POST | Writes a field to Google Sheet + appends history row |
| `/api/get-inspection` | GET | Fetches inspection by address |
| `/api/save-inspection` | POST | Upserts inspection (creates or updates) |
| `/api/get-all-inspections` | GET | Returns all inspection summaries (address + overall condition) |
| `/api/get-notes` | GET | Returns all notes for a unit by `unit_id` |
| `/api/save-note` | POST | Inserts a note (`unit_id`, `text`, `created_by`) |
| `/api/get-calendar-tasks` | GET | Returns tasks overlapping a date range (`?start=&end=`) |
| `/api/save-calendar-task` | POST | Upserts task (id present → update, else insert) |
| `/api/delete-calendar-task` | POST | Deletes task by `{ id }` |
| `/api/trigger-sync` | POST | Dispatches `sync-numbers.yml` GitHub Actions workflow |

---

## 6. Environment Variables

| Variable | Used by | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | All Netlify functions | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | All Netlify functions | Supabase service role key |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Property info functions | Google service account credentials |
| `SHEET_ID_PROPERTY_INFO` | Property info functions | Google Sheet ID |
| `GH_DISPATCH_TOKEN` | `trigger-sync.js` | GitHub PAT with `actions:write` scope |
| `GMAIL_USER` | `sync-from-numbers.mjs` | Gmail sender address (optional) |
| `GMAIL_APP_PASSWORD` | `sync-from-numbers.mjs` | Gmail app password (optional) |
| `MEETING_EMAIL_TO` | `sync-from-numbers.mjs` | Recipient for change summary emails (optional) |

---

## 7. Scripts

| Script | When to run |
|--------|------------|
| `sync-from-numbers.mjs` | Scheduled (cron) + manual — syncs tenant data from Numbers → Supabase |
| `sync-property-cache.mjs` | Scheduled (cron) + manual — syncs Google Sheet property attributes → Supabase |
| `cleanup-duplicate-units.mjs` | Manual only — removes orphan unit rows not in the Google Sheet |
| `seed-units-from-csv.mjs` | Manual only — initial seed of units from CSV |

---

## 8. Key Constraints and Invariants

- **Amanda's `.numbers` file is never written to.** Data flows one-way: Numbers → Supabase → dashboard.
- **The Property Info Google Sheet is the sole authority for what units exist.** `sync-from-numbers.mjs` never creates unit rows.
- **Column lookup is name-based, never positional.** Rearranging Google Sheet columns is safe.
- **Calendar tasks reference units by address string,** not Supabase UUID. (Unit UUIDs are replaced with sequential indices by `get-units.js`.)
- **Notes were migrated from `localStorage` to Supabase** (April 2026). All notes are now shared across users and devices.
- **`task.type` is undefined** — always use `task.task_type`.
- **`unit.turnoverNotes` is always empty** — use `unit.notes` for Amanda's resident notes.
