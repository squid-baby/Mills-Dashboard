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

### 2. Amanda's Numbers Spreadsheet (source of truth)

This is the master renewal tracking file. Amanda maintains it manually throughout the renewal season. It tracks everything Appfolio doesn't: who's renewing vs leaving, whether leases are signed, deposit status, next-year resident assignments, and notes.

**File location (Google Drive, synced locally):**
```
/Volumes/One Touch/The_Team_Google_Drive Sync/2025-2026 Renewals_Dashboard.numbers
```

**Working copy (used by sync tools):**
```
/Volumes/One Touch/The_Team_Google_Drive Sync/Mills Dashboard/
  2025-2026 Renewals_Dashboard_Sync_v4/2025-26 renewals-2019-20 Tenants.numbers
```

**Sheet 1 columns ("2025-26 renewals"):**

| Col | Header | What it tracks |
|-----|--------|---------------|
| A | Property | Unit address (e.g. "136 B Purefoy Rd") |
| B | Resident | Current tenant name |
| C | Email | Current tenant email |
| D | Phone | Current tenant phone |
| E | Lease end date | When the current lease expires |
| F | Move Out Date | When they're actually moving out (if leaving) |
| G | Status | `renewing`, `leaving`, `month to month`, `unknown` |
| H | Lease signed | `yes` / blank |
| I | Deposit paid | `yes` / blank |
| J | Notes | Amanda's notes |
| K | Resident for Next Year | Next tenant name (if turnover) |
| L | Next Resident's Email | Next tenant email |
| M | Next Resident's Phone Number | Next tenant phone |
| N | Next Residents Move In Date | When the new tenant moves in |
| O | Next year's lease end date | (unused by dashboard) |
| P | Notes for next turnover | (handled separately) |
| Q | Freeze warning? | `yes` if pipes freeze |
| R | Owner | Property owner name |
| S | Area | Geographic area (Purefoy, Carrboro, etc.) |

### 3. Property Info Google Sheet (read/write)

A separate Google Sheet with detailed property information that the dashboard can both read and write to. Shared with a Google service account.

**What it stores:**
- Physical details: bedrooms, bathrooms, sq ft, property type, year built
- Appliances: washer, dryer, dishwasher, AC type, heat type
- Management: door codes, lockbox codes, paint colors, appliance dates
- Turnover inspections: condition assessments, replacement items, overall ratings
- Edit history: every field change is logged with timestamp

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

### Step 2: Amanda Reviews and Updates the Numbers File

After the backfill, Amanda (or you) opens the updated CSV and the Numbers spreadsheet side by side:

1. Open the backfilled CSV (the one the script overwrote)
2. Open the Numbers spreadsheet
3. **Copy column, paste column** - transfer the filled-in phone/email columns from the CSV into the Numbers file
4. Review the `sync-report.html` for any conflicts that need manual resolution
5. Save the Numbers file

This manual review step is intentional - Amanda is the source of truth and needs to verify everything before it goes into her spreadsheet.

**Alternatively**, the sync can write directly to the `.numbers` file using `numbers-parser`:

```bash
# This was done on 2026-03-30 to backfill 80 fields directly
python3 -c "
import numbers_parser, csv
# ... reads backfilled CSV, writes to .numbers file
# Only fills blank cells, never overwrites
"
```

### Step 3: Sync Numbers File to Supabase

Once the Numbers file is updated, push it to Supabase so the dashboard can see it.

**Tool:** `scripts/sync-from-numbers.mjs`
**Location:** `/Users/millsrentals/Mills-Dashboard/scripts/`

```bash
cd /Users/millsrentals/Mills-Dashboard
node --env-file=.env scripts/sync-from-numbers.mjs
```

**What it does:**
1. Reads the `.numbers` file directly using `numbers-parser` (Python) - no manual CSV export needed
2. Exports fresh CSVs to `/tmp/mills_export/`
3. Parses Sheet 1 (tenants) and Sheet 2 (property info)
4. Upserts units into Supabase (matched by address)
5. Deletes and re-inserts residents and next_residents for synced units
6. Reports counts when done

**This runs automatically** via a Claude Code scheduled task or GitHub Actions, and can also be triggered manually from the dashboard's Sync button (see below).

**Requires:**
- `/Volumes/One Touch/` must be mounted (external drive connected)
- `.env` file with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- `numbers-parser` Python package installed

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
    sync-from-numbers.mjs                       #   Numbers file -> Supabase sync
    sync-property-cache.mjs                     #   Google Sheet -> Supabase property attrs
    meeting-capture/                            #   Meeting recording + transcription + email
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
cd /Users/millsrentals/Mills-Dashboard
node --env-file=.env scripts/sync-from-numbers.mjs
```

### "We have a new Appfolio export and need to backfill phones"

1. Save the Appfolio CSV to the export folder on the drive
2. Export fresh CSVs from the Numbers file:
```bash
cd /Users/millsrentals/Mills-Dashboard
node --env-file=.env scripts/sync-from-numbers.mjs
# (this exports CSVs to /tmp/mills_export/ as a side effect)
```
3. Run the backfill:
```bash
cd "/Volumes/One Touch/The_Team_Google_Drive Sync/Mills Dashboard/2025-2026 Renewals_Dashboard_Sync_v4"
node sync-tenant-phones.js \
  --numbers "/tmp/mills_export/2025-26 renewals.csv" \
  --appfolio "2025-2026 Renewals_Dashboard_export_Fresh/tenant_directory-YYYYMMDD.csv"
```
4. Review `sync-report.html` in a browser
5. Copy the backfilled columns into the Numbers spreadsheet (or use numbers-parser to write directly)
6. Re-run the Supabase sync:
```bash
cd /Users/millsrentals/Mills-Dashboard
node --env-file=.env scripts/sync-from-numbers.mjs
```

### "Dashboard shows 'Local data' (orange dot)"

The Netlify function is failing. Check:
1. Netlify function logs at https://app.netlify.com
2. `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set in Netlify env vars

### "Data looks stale"

1. Is the external drive mounted? `ls "/Volumes/One Touch/"`
2. Run sync manually (see above)
3. Hard refresh the browser (Cmd+Shift+R) - old data may be cached

### "Column indices are wrong / Numbers file layout changed"

Print current headers:
```bash
python3 -c "
import numbers_parser
doc = numbers_parser.Document('/Volumes/One Touch/The_Team_Google_Drive Sync/2025-2026 Renewals_Dashboard.numbers')
for i, c in enumerate(doc.sheets[0].tables[0].rows()[0]):
    print(f'{i}: {c.value}')
"
```

Then update the `S1` constants in `scripts/sync-from-numbers.mjs`.

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
- **Property Info:** Google Sheets API via service account
- **Numbers parsing:** `numbers-parser` (Python) for reading/writing `.numbers` files
- **Sync tooling:** Node.js scripts, Claude Code scheduled tasks

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
