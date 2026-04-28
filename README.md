# Mills Rentals Dashboard

**Live:** https://mills-dashboard.netlify.app

A renewal-tracking dashboard for Mills Rentals. Shows every unit in the portfolio with lease status, resident contact info, turnover timelines, property details, and inspection tracking. Built for Amanda and the team to manage the 2025-2026 renewal cycle.

---

## The Big Picture

There are three systems that feed the dashboard, and data flows in one direction:

```
APPFOLIO (property management software)
    |
    |  [Manual CSV export]
    v
AMANDA'S NUMBERS SPREADSHEET (source of truth for tenant data)
    |
    |  [Automated sync script]
    v
SUPABASE (cloud database)
    |
    |  [Netlify function API call]
    v
DASHBOARD (React app on Netlify)
    |
    |  [Netlify function reads/writes]
    v
PROPERTY INFO GOOGLE SHEET (editable property details, inspections)
```

The dashboard **never writes back** to the Numbers file or Appfolio. It only writes to the Property Info Google Sheet (door codes, appliance info, inspection forms, etc.).

---

## Data Sources

### 1. Appfolio Tenant Directory (upstream)

Appfolio is the official property management system. It has the most complete tenant contact info (phone numbers, emails) but doesn't track renewal status, lease signing progress, or next-year tenant assignments.

**What it provides:** Phone numbers, emails, lease dates, tenant status (Current / Notice / Future)

**How to export:**
1. Log into Appfolio
2. Reports > Tenant Directory
3. **Important:** Make sure all status filters are checked (Current, Notice, Future) - missing "Notice" will skip tenants who have given notice to move out
4. Export as CSV
5. Save to: `/Volumes/One Touch/The_Team_Google_Drive Sync/Mills Dashboard/2025-2026 Renewals_Dashboard_Sync_v4/2025-2026 Renewals_Dashboard_export_Fresh/`

### 2. Neo Google Sheet (source of truth — all sheet data lives here)

Single Google Sheet ("Mills Dashboad - Neo") that holds everything Amanda and the team edit. Service-account access is shared with the dashboard. Replaces the prior `.numbers` file + separate Property Info sheet split (April 2026).

**Tabs:**
- `Tenant Info` — current/next residents, lease/move dates, status. Sync reads it; nothing writes back.
- `property-info-clean` — every property attribute (beds, owner, codes, appliance models, paint, etc.). Sync reads it; PropertyInfoTab writes back via `update-property-info`.
- `Turnover Inspections` — inspection records written by the inspection app.
- `Property Info History` — audit log appended on every property field edit.

Column lookup is **header-name based** (case-insensitive, smart-quote-tolerant). Mappings live in:
- `src/config/tenantInfoColumns.js` for Tenant Info
- `src/config/columns.js` (`HEADER_TO_FIELD` / `FIELD_TO_HEADER`) for property-info-clean

Renaming columns in the sheet is safe — add the new header to the relevant `headers` array. Reordering columns is safe — code never relies on position.

The pre-Neo `.numbers` file is still in Drive at `/Volumes/One Touch/The_Team_Google_Drive Sync/2025-2026 Renewals_Dashboard.numbers` as a frozen backup. Nothing reads it.

### 4. Supabase (cloud database)

The bridge between the Numbers spreadsheet and the live dashboard. Stores a structured copy of the tenant data.

**Tables:**
- `units` - one row per property address
- `residents` - one row per current tenant (linked to unit)
- `next_residents` - one row per future tenant (linked to unit)
- `unit_full` - a view joining all three (reference only)

---

## How Data Flows: Step by Step

### Step 1: Backfill Phone Numbers from Appfolio

Amanda's Numbers spreadsheet often has missing phone numbers and emails because she adds tenants manually. Appfolio has this info. The backfill script merges them.

**Tool:** `sync-tenant-phones.js`
**Location:** `/Volumes/One Touch/The_Team_Google_Drive Sync/Mills Dashboard/2025-2026 Renewals_Dashboard_Sync_v4/`

```bash
cd "/Volumes/One Touch/The_Team_Google_Drive Sync/Mills Dashboard/2025-2026 Renewals_Dashboard_Sync_v4"

node sync-tenant-phones.js \
  --numbers  "/tmp/mills_export/2025-26 renewals.csv" \
  --appfolio "2025-2026 Renewals_Dashboard_export_Fresh/tenant_directory-20260330.csv"
```

**What it does:**
1. Reads both CSVs
2. Matches tenants by name (handles "Last, First" vs "First Last" formats)
3. Backfills blank phone and email fields - **never overwrites existing data**
4. Flags conflicts where both files have different values (logged but not changed)
5. Writes an HTML report (`sync-report.html`) for review
6. Overwrites the Numbers CSV with the backfilled data

**Rules:**
- Only fills fields that are **blank** - never overwrites
- Conflicts are flagged in the report, not auto-resolved
- Future tenants in Appfolio map to "Next Year Residents" in Numbers
- Current/Notice tenants map to "Current Residents"

### Step 2: Amanda Reviews and Updates the Neo Sheet

After the Appfolio backfill, transfer the filled-in phone/email columns into the Neo sheet's "Tenant Info" tab:
1. Open the backfilled CSV (the one the script overwrote)
2. Open the Neo Google Sheet → "Tenant Info" tab
3. **Copy column, paste column** — transfer the filled-in phone/email values
4. Review `sync-report.html` for conflicts needing manual resolution

This manual review step is intentional — Amanda verifies everything before it lands in the source-of-truth sheet. (The legacy `.numbers` workflow that bypassed this via `numbers-parser` writes is no longer used.)

### Step 3: Sync Neo Sheet to Supabase

Once Neo is updated, push it to Supabase so the dashboard can see it.

**Tool:** `scripts/sync-from-neo.mjs`

```bash
node --env-file=.env scripts/sync-from-neo.mjs --dry-run  # preview first
node --env-file=.env scripts/sync-from-neo.mjs            # live
```

**What it does (single pass over both data tabs):**
1. `batchGet` "Tenant Info" + "property-info-clean" via the Sheets API
2. Validates required headers in both tabs; exits non-zero before any write if missing
3. Validates every Tenant address resolves to a unit; exits non-zero before any delete if not (per "no lost properties" rule)
4. Upserts units (batch 50, by address)
5. Deletes + reinserts residents/next_residents for matched units
6. Sends change-summary email if Gmail env vars set

**Runs automatically** via the daily GitHub Actions workflow (`sync-neo.yml`, 8am ET) and on-demand from the dashboard's Sync button.

**Requires:** `.env` (or env vars) with `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `SHEET_ID_PROPERTY_INFO`.

### Step 4: Dashboard Reads from Supabase

The Netlify function `/api/get-units` queries Supabase and returns the data to the React frontend.

**What happens on page load:**
1. App loads with seed data (hardcoded fallback)
2. Fetches `/api/get-units` immediately
3. Netlify function queries `units` table with embedded `residents` + `next_residents`
4. Function derives status groups (renewed, renewing, full_turnover, etc.) and substates
5. Returns formatted JSON to the frontend
6. App re-renders with live data, shows green "Synced" indicator
7. Polls every 30 minutes for updates

---

## The Dashboard

### Status Groups

Every unit is classified into a status group based on what its residents are doing:

| Group | Meaning | How it's derived |
|-------|---------|-----------------|
| **Renewed** | All staying, leases signed | All residents renewing + all lease_signed = yes |
| **Renewing** | Interested but not all signed | Some/all renewing, not all signed |
| **Full Turnover** | Everyone leaving, no replacement yet | All leaving, no next residents |
| **Turnover (Rented)** | Everyone leaving, new tenants found | All leaving + next residents assigned |
| **Partial Turn** | Mix of staying and leaving | Some renewing + some leaving |
| **Partial Turn (Leased)** | Partial turn, renewal side done | Partial turn + renewing ones all signed |
| **Month to Month** | On month-to-month lease | Any resident status = "month to month" |
| **Unknown** | Waiting to hear back | No clear status |

### Flagging Rules

Red badges appear on tiles when units need attention:

- **"4+B Unrented"** - 4+ bedroom properties not renewed by Nov 1 or not rented by Jan 1
- **"Needs Attention"** - Available 30+ days without a lease
- **"60 Day"** - Within 60 days of lease end, no renewal or new lease

### Detail Panel

Click any tile to see:

**Tenant Info tab:**
- Unit details (beds, lease end, owner, area, utilities)
- Current residents with status badges, email, phone, copy buttons
- Next year residents with contact info
- Spreadsheet notes
- Dashboard notes (stored in Supabase, shared across all users/devices)

**Property Info tab:**
- Editable property fields pulled from Google Sheet
- Edit any field inline - changes save to Google Sheet with history
- Appliance details: washer, dryer, dishwasher, fridge, stove (with replacement dates and warranty info)

**Turnover tab** (only for turnover units):
- Full inspection form (50+ items)
- Replacement items tracking
- Overall condition rating (Up to date / Needs love / At risk)
- Condition flag shows on the tile in the main grid

### Turnover Window

For units with turnovers, the dashboard calculates the work window between move-out and move-in dates:

- **Red:** 7 days or fewer
- **Amber:** 8-14 days
- **Green:** 15+ days

### Turnover Calendar

Swimlane-style calendar (accessible from the "Calendar" button in the header) for scheduling turnover work during the May-August season:

- **Month view:** Grid with colored task pills per day. Click a day to drill into it.
- **Week view:** Swimlane layout with AM/PM slots per property.
- **Day view:** Expanded task cards with full details.
- **Task types:** Move Out, Paint, Repair, Clean, Finalize, Move In — each color-coded.
- **Ghost tasks:** Auto-generated from lease data (move-out/move-in dates) for units missing those tasks. Confirm to save or dismiss for the session.
- **Create/edit/delete** tasks from the calendar UI.

### Light / Dark Mode

Toggle between dark and light themes via the sun/moon button in the header. Persists to localStorage and respects system preference on first visit.

### Sync Button

The "↻ Sync" button in the header triggers the GitHub Actions sync workflow, which re-reads Amanda's Numbers file and pushes changes to Supabase. After each sync, if any resident data changed (adds, removes, status flips, lease/deposit changes), a summary email is sent to the team.

### Export Turnovers

The "Export Turnovers" button exports a CSV of all turnover units (filtered to your current view) with lease dates, turn window, tenant info, inspection details, and notes.

---

## File Locations

### On the Mac Mini (`millsrentals`)

```
/Users/millsrentals/Mills-Dashboard/          # Dashboard repo
  src/                                          # React frontend
  netlify/functions/                            # Serverless API
    get-units.js                                #   Supabase -> dashboard data
    get-property-info.js                        #   Google Sheet -> property details
    update-property-info.js                     #   Dashboard -> Google Sheet edits
    save-inspection.js                          #   Dashboard -> inspection data
    get-inspection.js                           #   Inspection data -> dashboard
    get-all-inspections.js                      #   All inspection summaries
    get-notes.js                                #   Supabase notes -> dashboard
    save-note.js                                #   Dashboard -> Supabase notes
    get-calendar-tasks.js                       #   Calendar tasks by date range
    save-calendar-task.js                       #   Create/update calendar task
    delete-calendar-task.js                     #   Delete calendar task
    trigger-sync.js                             #   Dispatch GitHub Actions sync workflow
  scripts/
    sync-from-neo.mjs                           #   Neo Google Sheet -> Supabase (consolidated)
    cleanup-duplicate-units.mjs                 #   One-time: dedup orphan unit rows
    meeting-capture/                            #   Meeting recording + transcription + email
  db/migrations/
    2026-04-28-expand-units-for-neo.sql         #   Units schema additions for Neo migration
  .env                                          # Credentials (never committed)
```

### On the External Drive

```
/Volumes/One Touch/The_Team_Google_Drive Sync/
  2025-2026 Renewals_Dashboard.numbers          # SOURCE OF TRUTH (Amanda's file)
  Mills Dashboard/
    2025-2026 Renewals_Dashboard_Sync_v4/
      sync-tenant-phones.js                     # Appfolio -> Numbers backfill
      README.md                                 # Docs for the backfill tool
      2025-26 renewals-2019-20 Tenants.numbers  # Working copy of Numbers file
      2025-2026 Renewals_Dashboard_export_Fresh/
        tenant_directory-YYYYMMDD.csv            # Latest Appfolio export
        sync-report.html                         # Last backfill report
```

### Temp Files

```
/tmp/mills_export/                              # Auto-generated by sync script
  2025-26 renewals.csv                          # Sheet 1 export
  property info.csv                             # Sheet 2 export
  (other sheets...)                             # Exported but unused
```

---

## Quick Reference: Common Tasks

### "Amanda updated the spreadsheet, dashboard needs to reflect it"

```bash
node --env-file=.env scripts/sync-from-neo.mjs --dry-run  # preview
node --env-file=.env scripts/sync-from-neo.mjs            # live
```

Or click the Sync button in the dashboard header (dispatches the GitHub Actions workflow).

### "We have a new Appfolio export and need to backfill phones"

1. Save the Appfolio CSV to the export folder on the drive
2. Export the Tenant Info tab to CSV from the Neo sheet (File → Download → CSV)
3. Run the backfill:
```bash
cd "/Volumes/One Touch/The_Team_Google_Drive Sync/Mills Dashboard/2025-2026 Renewals_Dashboard_Sync_v4"
node sync-tenant-phones.js \
  --numbers "<path-to-tenant-info-export>.csv" \
  --appfolio "2025-2026 Renewals_Dashboard_export_Fresh/tenant_directory-YYYYMMDD.csv"
```
4. Review `sync-report.html`, then paste filled columns back into the Neo sheet
5. Re-run the Supabase sync:
```bash
node --env-file=.env scripts/sync-from-neo.mjs
```

### "Dashboard shows 'Local data' (orange dot)"

The Netlify function is failing. Check:
1. Netlify function logs at https://app.netlify.com
2. `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set in Netlify env vars

### "Data looks stale"

1. Run dry-run to see what the sync would change: `node --env-file=.env scripts/sync-from-neo.mjs --dry-run`
2. If the diff is non-empty, run the live sync
3. Hard-refresh the browser (Cmd+Shift+R)

### "A column was renamed in the Neo sheet"

Check `--dry-run` output — the `Header map` line shows found-vs-expected counts. To support a new header name, append it to the relevant `headers` array in `src/config/tenantInfoColumns.js` (Tenant Info) or to `HEADER_TO_FIELD` in `src/config/columns.js` (property-info-clean).

---

## Environment Variables

| Variable | Where it's used | What it is |
|----------|----------------|------------|
| `SUPABASE_URL` | Sync script + Netlify functions | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Sync script + Netlify functions | Supabase service role key (secret!) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Netlify functions | Google service account credentials JSON |
| `SHEET_ID_PROPERTY_INFO` | Netlify functions | Google Sheet ID for property info |
| `GITHUB_TOKEN` | Netlify function (`trigger-sync.js`) | GitHub PAT with `actions:write` scope |
| `GMAIL_USER` | Sync script (change email) | Gmail address for sending change summaries |
| `GMAIL_APP_PASSWORD` | Sync script (change email) | Gmail app password |
| `MEETING_EMAIL_TO` | Sync script + meeting capture | Recipient for change emails and meeting notes |

**Local:** Stored in `/Users/millsrentals/Mills-Dashboard/.env` (gitignored)
**Production:** Set in Netlify dashboard (Site settings > Environment variables) and GitHub Actions secrets

---

## Tech Stack

- **Frontend:** React 18, Vite, deployed on Netlify
- **API:** Netlify Functions (serverless)
- **Database:** Supabase (PostgreSQL)
- **Source-of-truth sheet:** Google Sheets API via service account (Neo Google Sheet)
- **Sync tooling:** Node.js scripts run by GitHub Actions (daily) + on-demand from the dashboard

---

## History / Lessons Learned

**March 2026 - Initial build:**
Dashboard originally read directly from Google Sheets via the Netlify function. This worked but was slow and tightly coupled to the sheet layout.

**March 2026 - Supabase migration:**
Moved tenant data to Supabase for faster reads and a cleaner schema. Added `sync-from-numbers.mjs` to push data from the Numbers file. Key issues discovered and fixed:

1. **Stale CSV problem:** The sync script was reading pre-exported CSVs from `/tmp/mills_export/` instead of the live Numbers file. Fixed by using `numbers-parser` to read the `.numbers` file directly on every sync run.

2. **Wrong data source:** `get-units.js` was still reading from Google Sheets even after the Supabase migration. Rewrote to query Supabase directly with embedded joins.

3. **Date format mismatch:** `numbers-parser` exports dates as ISO format (`2026-07-31 00:00:00`) while the old manual CSV export used `M/D/YY`. The date parser needed to handle both formats.

4. **GitHub push protection:** Hardcoded Supabase credentials in the sync script blocked pushes. Moved to `.env` file.

5. **Missing phone numbers:** Appfolio has the most complete contact info but Amanda's spreadsheet is the source of truth for everything else. Created `sync-tenant-phones.js` to bridge the gap - backfills blanks without overwriting Amanda's data.

**April 2026 - Neo migration (consolidation):**
Replaced the two-source split (`.numbers` file + separate Property Info Google Sheet) with a single Neo Google Sheet hosting all four tabs (Tenant Info, property-info-clean, Turnover Inspections, Property Info History). Consolidated `sync-from-numbers.mjs` + `sync-property-cache.mjs` into one `sync-from-neo.mjs` that batchGets both data tabs and writes Supabase in one pass. Added 32 property columns to the `units` table (door codes, appliance service records, paint, portfolio, lead paint) so all sheet fields are persisted. Renamed property `Notes` field to `unit_notes` to disambiguate from resident notes. Hard fail-loud rules: missing required header → exit before write; any unresolved Tenant address → exit before resident delete. Dropped the `numbers-parser` Python dependency entirely. The legacy `.numbers` file remains in Drive as a frozen backup.
