# Mills Rentals Dashboard

**Production URL**: https://mills-dashboard.netlify.app

## Architecture

### Data Sources
- **Tenant/Renewal data**: Source of truth is Amanda's `.numbers` file at `/Volumes/One Touch/The_Team_Google_Drive Sync/2025-2026 Renewals_Dashboard.numbers` (Google Drive synced locally). The sync script reads this file directly using `numbers-parser` (Python), exports fresh CSVs to `/tmp/mills_export/`, then upserts into Supabase. Dashboard reads from Supabase — **read-only**.
- **Property Info**: Google Sheet (`SHEET_ID_PROPERTY_INFO`). Dashboard has **read/write** access via service account.
- **Turnover Inspections**: Stored in "Turnover Inspections" tab of the Property Info Google Sheet. Written by `save-inspection.js`, read by `get-inspection.js` and `get-all-inspections.js`.
- **Property Info History**: Stored in "Property Info History" tab. Appended on every property field edit.

### Sync Pipeline
```
Tenant domain (read-only):
  Amanda edits .numbers file (on Google Drive)
    → Google Drive syncs to /Volumes/One Touch/...
    → Scheduled task: node scripts/sync-from-numbers.mjs
        → numbers-parser reads Sheet 1 only → exports 2025-26 renewals.csv
        → Upserts units (address/owner/area only), residents, next_residents into Supabase

Property domain (read-write):
  Google Sheet edited by team / seeded by seed-units-from-csv.mjs
    → Scheduled task: node scripts/sync-property-cache.mjs
        → Reads "property info" Google Sheet tab
        → Upserts property attributes (beds, baths, ac_type, etc.) into Supabase units

  → Dashboard calls /api/get-units → Netlify function queries Supabase → renders data
  → Property Info tab calls /api/get-property-info → reads Google Sheet → renders fields
  → Edits call /api/update-property-info → writes to Google Sheet → sync-property-cache picks up
```

**Key gotcha (fixed March 2026):** The sync script used to read stale CSVs from `/tmp/mills_export/` that were only updated when manually exported from the Numbers app. Now it re-exports fresh CSVs from the `.numbers` file on every run using `numbers-parser`. If data looks stale, check that `/Volumes/One Touch/` is mounted and run the sync manually.

**Key gotcha (fixed March 2026):** `get-units.js` was originally reading from Google Sheets, not Supabase. It now queries Supabase directly. If the dashboard shows "Local data" instead of "Synced", the Netlify function is failing — check Netlify function logs.

### Supabase Schema
- `units` — one row per property (address, beds, baths, area, owner_name, utilities, property_type, sq_ft, freeze_warning, pets_allowed, year_built, town, washer, dryer, dishwasher, gas, sump_pump, breaker_box, ac_type, heat_type, sheet_notes)
- `residents` — one row per current resident (name, email, phone, status, lease_end, move_out_date, lease_signed, deposit_paid, notes)
- `next_residents` — one row per future resident (name, email, phone, move_in_date)
- `unit_full` — view joining units + residents + next_residents (reference only; `get-units.js` queries tables directly to get all fields including phone and move_out_date)
- `notes` — per-unit notes (id, unit_id, text, created_by, created_at)
- `inspections` — per-unit inspection records (id, unit_id, inspector, inspection_date, overall_condition, overall_notes, items_json, created_at, updated_at)
- `pending_changes`, `sync_log` — supporting tables

**Phase 2 SQL (already run):** Added 11 new columns to `units` + created `notes` and `inspections` tables. If setting up fresh, run the SQL block from the Phase 2 migration handoff.

### Numbers File Sheet Names (as exported to CSV)
- `2025-26 renewals.csv` → Sheet1 (tenant/renewal data)
- `property info.csv` → Sheet2 (property details)

### Numbers Sheet 1 Column Indices
| Col | Header | Supabase field |
|-----|--------|---------------|
| 0 | Property | `units.address` |
| 1 | Resident | `residents.name` |
| 2 | Email | `residents.email` |
| 3 | Phone | `residents.phone` |
| 4 | Lease end date | `residents.lease_end` |
| 5 | Move Out Date | `residents.move_out_date` |
| 6 | Status | `residents.status` |
| 7 | Lease signed | `residents.lease_signed` |
| 8 | Deposit paid | `residents.deposit_paid` |
| 9 | Notes | `residents.notes` |
| 10 | Resident for Next Year | `next_residents.name` |
| 11 | Next Resident's Email | `next_residents.email` |
| 12 | Next Resident's Phone Number | `next_residents.phone` |
| 13 | Next Residents Move In Date | `next_residents.move_in_date` |
| 16 | Freeze warning? | `units.freeze_warning` |
| 17 | Owner | `units.owner_name` |
| 18 | Area | `units.area` |

### Netlify Functions
| Function | Method | Purpose |
|----------|--------|---------|
| `get-units` | GET | Queries Supabase `units` with embedded `residents` + `next_residents`, derives status groups |
| `get-property-info` | GET | Fetches property fields from Google Sheet (all fields in `src/config/columns.js`) |
| `update-property-info` | POST | Updates a property field in Google Sheet + appends history |
| `save-inspection` | POST | Saves/updates turnover inspection to Google Sheet |
| `get-inspection` | GET | Fetches a single inspection by address |
| `get-all-inspections` | GET | Fetches all inspection summaries (address + overallCondition) |

### Column Config (`src/config/columns.js`)
Single source of truth for the Google Sheet ↔ field key mapping. Both `get-property-info.js` and `update-property-info.js` import from here — **add new fields here only**.
- `HEADER_TO_FIELD` — sheet header → field key (53 entries; supports aliases for legacy column names)
- `FIELD_TO_HEADER` — field key → canonical sheet header (48 entries; used for writes)
- `NEW_SHEET_COLUMNS` — 7 columns appended by the migration script (Year Built, Sump Pump, Breaker Box, AC Type, Heat Type, Pets Allowed, Sheet Notes)

### Property Info Sheet (Google Sheet) Columns
Cleaned headers (Title Case). Notable columns:
- A: Property, B: Bedrooms, C: Bathrooms, D-F: Washer/Dryer/Dishwasher
- G: Town, H: Property Type, I: Sq Ft, J: Gas, K: Included Utilities
- L: Freeze Warning, V: Owner, X: Area
- AF-BA: Dashboard-managed fields (Door Code, Lockbox Code, appliance dates, paint, etc.)
- End of sheet: Year Built, Sump Pump, Breaker Box, AC Type, Heat Type, Pets Allowed, Sheet Notes (appended by `migrate-sheet2-to-gsheet.mjs`)

### Scripts
| Script | Purpose | Run |
|--------|---------|-----|
| `sync-from-numbers.mjs` | Reads Numbers Sheet 1 → upserts Supabase (tenant domain: residents, next_residents, address/owner/area) | Scheduled + manual |
| `sync-property-cache.mjs` | Reads Property Info Google Sheet → upserts Supabase units (property attributes) | Scheduled + manual |
| `seed-units-from-csv.mjs` | One-time seed from `Mills_Dashboard_Property_info_sheet.csv` → Supabase units | Manual only |
| `migrate-sheet2-to-gsheet.mjs` | One-time migration — Numbers Sheet 2 → Google Sheet (run once to populate new columns) | Manual only |

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
- Export button in main header: "Export Turnovers" — filters to future move-in dates.

## Troubleshooting

**Dashboard shows "Local data" (orange dot)** — Netlify function failed. Check Netlify function logs. Common causes: Supabase credentials missing in Netlify env vars, Supabase down.

**Dashboard data is stale / changes not showing** — The sync didn't run or ran against old CSVs. Check:
1. Is `/Volumes/One Touch/` mounted? (`ls "/Volumes/One Touch/"`)
2. Run sync manually: `cd /Users/millsrentals/Mills-Dashboard && node --env-file=.env scripts/sync-from-numbers.mjs`
3. Check scheduled task is active in Claude Code.

**Phone numbers / new columns not appearing** — Verify the Numbers file column indices match `scripts/sync-from-numbers.mjs` `S1`/`S2` constants. Print headers with: `python3 -c "import numbers_parser; doc = numbers_parser.Document('...'); [print(i, c.value) for i, c in enumerate(doc.sheets[0].tables[0].rows()[0])]"`

**Property Info fields missing (beds, baths, town, etc.)** — Run `sync-property-cache.mjs` to pull latest from Google Sheet → Supabase: `node --env-file=.env scripts/sync-property-cache.mjs`. Or re-seed from CSV: `node --env-file=.env scripts/seed-units-from-csv.mjs`.

**Adding a new property info field** — Add entries to both `HEADER_TO_FIELD` and `FIELD_TO_HEADER` in `src/config/columns.js`. If it's a new Google Sheet column, add the header name to `NEW_SHEET_COLUMNS` in the same file and re-run the migration script.

## Dev Setup
```bash
npm install
# Copy .env.example to .env and fill in credentials
npx netlify dev  # Runs on port 8888, proxies /api to Netlify functions
```

## Environment Variables
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Supabase service role key (never commit this)
- `GOOGLE_SERVICE_ACCOUNT_JSON` — Google service account credentials (for Property Info sheet)
- `SHEET_ID_PROPERTY_INFO` — Google Sheet ID for property info + inspections
