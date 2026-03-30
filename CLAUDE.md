# Mills Rentals Dashboard

**Production URL**: https://mills-dashboard.netlify.app

## Architecture

### Data Sources
- **Tenant/Renewal data**: Source of truth is Amanda's `.numbers` file on Google Drive. Exported as CSV daily to Supabase. Dashboard reads from Supabase (`unit_full` view) — **read-only**.
- **Property Info**: Google Sheet (`SHEET_ID_PROPERTY_INFO`). Dashboard has **read/write** access via service account.
- **Turnover Inspections**: Stored in "Turnover Inspections" tab of the Property Info Google Sheet. Written by `save-inspection.js`, read by `get-inspection.js` and `get-all-inspections.js`.
- **Property Info History**: Stored in "Property Info History" tab. Appended on every property field edit.

### Supabase Schema
- `units` — one row per property (address, beds, baths, area, owner_name, utilities, property_type, sq_ft, freeze_warning, pets_allowed, year_built)
- `residents` — one row per current resident (name, email, phone, status, lease_end, move_out_date, lease_signed, deposit_paid, notes)
- `next_residents` — one row per future resident (name, email, phone, move_in_date)
- `unit_full` — view joining units + residents + next_residents (used for reference; `get-units.js` queries tables directly to get all fields)
- `notes`, `pending_changes`, `sync_log` — supporting tables

### Netlify Functions
| Function | Method | Purpose |
|----------|--------|---------|
| `get-units` | GET | Queries Supabase `units` with embedded `residents` + `next_residents`, derives status groups |
| `get-property-info` | GET | Fetches editable property fields from Google Sheet |
| `update-property-info` | POST | Updates a property field in Google Sheet + appends history |
| `save-inspection` | POST | Saves/updates turnover inspection to Google Sheet |
| `get-inspection` | GET | Fetches a single inspection by address |
| `get-all-inspections` | GET | Fetches all inspection summaries (address + overallCondition) |

### Sheet 1 Column Indices (Supabase handles this now)
The `.numbers` file columns map to Supabase fields:
- A: Property → `units.address`
- B: Resident → `residents.name`
- C: Email → `residents.email`
- D: Phone → `residents.phone`
- E: Lease End → `residents.lease_end`
- F: Move Out Date → `residents.move_out_date`
- G: Status → `residents.status`
- H: Lease Signed → `residents.lease_signed`
- I: Deposit Paid → `residents.deposit_paid`
- J: Notes → `residents.notes`
- K: Next Resident → `next_residents.name`
- L: Next Email → `next_residents.email`
- M: Next Phone → `next_residents.phone`
- N: Next Move In Date → `next_residents.move_in_date`
- O: Next Lease End → (unused)
- P: Turnover Notes → (handled separately)
- Q: Freeze Warning → `units.freeze_warning`
- R: Owner → `units.owner_name`
- S: Area → `units.area`

### Property Info Sheet (Google Sheet) Columns
Cleaned headers (Title Case). Notable columns:
- A: Property, B: Bedrooms, C: Bathrooms, D-F: Washer/Dryer/Dishwasher
- G: Town, H: Property Type, I: Sq Ft, J: Gas, K: Included Utilities
- L: Freeze Warning, V: Owner, X: Area
- AF-BA: Dashboard-managed fields (Door Code, Lockbox Code, appliance dates, paint, etc.)

## Key Decisions (March 2026)

### Data Safety
- Amanda's `.numbers` file is the **single source of truth** for tenant data. The dashboard NEVER writes to it. Changes flow: `.numbers` → CSV → Supabase → dashboard (read-only).
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

## Dev Setup
```bash
npm install
# Copy .env.example to .env and fill in credentials
npx netlify dev  # Runs on port 8888
```

## Environment Variables
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Supabase service role key
- `GOOGLE_SERVICE_ACCOUNT_JSON` — Google service account credentials (for Property Info sheet)
- `SHEET_ID_PROPERTY_INFO` — Google Sheet ID for property info + inspections
