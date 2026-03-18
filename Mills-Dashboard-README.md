---
project: Mills Rentals Dashboard
status: Phase 2 - Vite App + Google Sheets Integration
started: 2026-03-16
owner: Nathan
team:
  - name: Nathan
    role: Project owner, builds the dashboard, property walks, improvement decisions
  - name: Amanda
    role: Maintains the Google Sheet (source of truth), renewal pipeline manager
  - name: Andrea
    role: Bulk email operations (uses copy-email buttons to paste into Gmail)
  - name: Fernando
    role: Turn scheduling, Stage 2 physical work
  - name: Nic
    role: Secondary user, morning brief recipient
  - name: Tina
    role: Secondary user, morning brief recipient
hosting: Netlify (static deploy + Netlify Functions)
live_url: null # TODO: add Netlify URL after first deploy
hardware: null # TODO: touchscreen display, researching options
tech_stack:
  frontend: React 18 (Vite 6)
  hosting: Netlify (free tier, with Netlify Functions for serverless backend)
  data_source: Google Sheets API v4 (read-only, service account)
  polling: Every 30 minutes via Netlify Function proxy
  fallback: Local seed data (78 units from Phase 1)
  calendar: Google Calendar API (Phase 3)
  ai: Claude API (Haiku 3.5) — future email parsing + morning briefs
tags:
  - property-management
  - dashboard
  - google-sheets
  - react
  - vite
  - netlify
---

# Mills Rentals Dashboard

A live, wall-mounted portfolio dashboard replacing the office whiteboard, renewal spreadsheet, and Trello board. Shows all units across 20+ properties with color-coded status, pipeline tracking, and copy-email tools for bulk tenant communication.

## Quick Links

| Resource | Location |
|----------|----------|
| Repo | `~/Documents/mills-dashboard` |
| Live app | _TODO: add Netlify URL_ |
| Dev server | `npm run dev` → `localhost:5173` |
| Google Sheet (source of truth) | [Renewals Spreadsheet](https://docs.google.com/spreadsheets/d/1AEZoTw-NeAz6ReOBOyN-9dzzcV5aIb4eKHS60qMOhSw/edit) |
| Phase 1 prototype (preserved) | `legacy/index-phase1.html` |

## Current State

**Phase 2 app is built — Vite + React 18 with Google Sheets integration.** 78 real units from the spreadsheet, color-coded by status, sortable/filterable, with expandable detail cards, copy-email buttons, and a quick-note field. The app polls Google Sheets every 30 minutes via a Netlify Function; falls back to local seed data when credentials aren't configured.

### What Works Now
- All 78 units displayed as interactive tiles (Airbnbs excluded)
- 8 color-coded status groups: Renewed, Renewing, Partial Turn, Partial (Lease Done), Unknown, Full Turnover, Turnover (Rented), Month-to-Month
- Sort by: Date (default, with status-priority sub-sort), Area, Owner, Status, Priority
- Filter by: Status group, Area of town
- Search by: Address, tenant name, owner
- Expandable tile detail: residents, lease status, deposit status, next-year tenants, utilities, notes
- **Copy email buttons** per group header — "Copy Current Emails" and "Copy Future Emails" for bulk pasting into Gmail
- Amanda's quick-note field with timestamps (persists in localStorage per browser)
- Urgency flags on tiles with lease ending < 30 days
- **Google Sheets polling** every 30 min via Netlify Function (service account, read-only)
- "Synced Xm ago" / "Using local data" indicator in header
- Summary bar showing counts by status group

### What Doesn't Work Yet
- Google service account not yet configured (app falls back to seed data)
- No write access to Google Sheet (by design — future "Request to Update" module)
- No automated email sending
- No Google Calendar integration (Phase 3)
- No morning brief emails (Phase 4)
- No cross-device note syncing (notes are per-browser, localStorage only)
- Hardware not purchased yet

## Architecture

### Data Source: Google Sheets (read-only)

Amanda maintains a Google Sheet as the single source of truth. The dashboard reads it — never writes to it. A Google Cloud service account authenticates server-side; credentials are stored in Netlify env vars, never exposed to the browser.

```
Google Sheet (Amanda maintains)
    ↓ Google Sheets API v4 (service account, read-only)
Netlify Function (get-units.js)
    ↓ JSON response
React App (polls every 30 min, falls back to seed data)
```

### Why Google Sheets instead of Supabase?
Amanda already maintains a spreadsheet. Adding a database creates a sync problem and a second source of truth. By reading the sheet directly, the dashboard always reflects Amanda's latest updates with zero additional workflow. Supabase remains an option for Phase 3+ if we need real-time sync, auth, or multi-tenancy.

### Why a Netlify Function proxy?
Google service account credentials must stay server-side. The Netlify Function authenticates with Google, fetches the sheet, parses it into unit objects, and returns JSON to the client. The browser never sees credentials.

### Why service account instead of OAuth?
A service account is simpler for an always-on wall display — no user login flow, no token refresh prompts. The sheet is shared with the service account email and it just works.

### Status Priority (Amanda's ordering)
When sorted by date, units within each month are sub-sorted by urgency:
1. **Full Turnover** — most urgent, needs listing
2. **Turnover (Rented)** — turnover with new tenants found
3. **Unknown** — haven't heard back yet
4. **Partial Turn** — some work needed
5. **Partial (Lease Done)** — mostly handled
6. **Renewing** — working through it
7. **Renewed** — done
8. **Month-to-Month** — stable

### Group Derivation
The Google Sheet has no explicit "status group" column. Groups are computed from aggregate resident statuses:
- **Full Turnover**: all residents leaving, no next-year tenants
- **Turnover (Rented)**: all leaving, but next-year tenants exist
- **Renewed**: all renewing + all leases signed
- **Renewing**: renewing but not all signed
- **Partial Turn**: mix of leaving + renewing residents
- **Partial (Lease Done)**: partial turn where staying tenants have signed
- **Unknown**: no status info or all unknown
- **Month-to-Month**: any resident with "month to month" status

## Google Sheet Column Mapping

### Sheet 1 — Renewals (one row per resident)
| Col | Field |
|-----|-------|
| 0 | Property (address) — grouping key |
| 1 | Resident name |
| 2 | Email |
| 3 | Lease end date |
| 6 | Status (renewing / leaving / unknown / month to month) |
| 7 | Lease signed (yes/no) |
| 8 | Deposit paid (yes/no) |
| 9 | Notes |
| 10 | Next year resident name |
| 11 | Next resident email |
| 12 | Next resident phone |
| 14 | Turnover notes |
| 16 | Owner |
| 17 | Area (no header label — recommend adding "Area") |

### Sheet 2 — Property Info (one row per property)
| Col | Field |
|-----|-------|
| 0 | Property (address) — join key |
| 1 | Bedrooms |
| 2 | Bathrooms |
| 10 | Utilities always included |
| 24 | Area |

## File Structure

```
Mills Dashboard/
├── Mills-Dashboard-README.md     ← This file
├── package.json                  ← React 18, Vite 6
├── vite.config.js                ← React plugin + /api proxy for local dev
├── netlify.toml                  ← Build config + /api/* → functions redirect
├── .env.example                  ← Template for Google credentials
├── index.html                    ← Vite entry point
├── netlify/
│   └── functions/
│       └── get-units.js          ← Fetches Google Sheet, parses to JSON
├── src/
│   ├── main.jsx                  ← React mount
│   ├── App.jsx                   ← Dashboard: state, filters, sort, polling
│   ├── index.css                 ← Global dark theme styles
│   ├── data/
│   │   ├── units.js              ← GC, PRIO, sort opts, seed data, helpers
│   │   └── units-seed.json       ← 78 units extracted from Phase 1
│   ├── lib/
│   │   └── sheetParser.js        ← Maps raw sheet rows → unit objects
│   └── components/
│       ├── StatusBadge.jsx       ← Color-coded status pill
│       ├── Tile.jsx              ← Unit card with hover + urgency
│       ├── DetailPanel.jsx       ← Slide-out panel with full unit details
│       ├── SummaryBar.jsx        ← Status counts bar
│       └── GroupHeader.jsx       ← Group label + copy email buttons
└── legacy/
    └── index-phase1.html         ← Original single-file prototype (preserved)
```

## Setup

### Local Development (seed data only)
```bash
npm install
npm run dev
# Opens at localhost:5173 with 78 seed units, "Using local data" indicator
```

### With Live Google Sheets Data
1. Create a Google Cloud project and enable the Sheets API
2. Create a service account and download the JSON key
3. Share the Google Sheet with the service account email (Viewer access)
4. Create `.env` from `.env.example`:
   ```
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
   SHEET_ID=1AEZoTw-NeAz6ReOBOyN-9dzzcV5aIb4eKHS60qMOhSw
   SHEET_TAB_RENEWALS=Sheet1
   SHEET_TAB_PROPERTIES=Sheet2
   ```
5. Run with Netlify CLI for function support:
   ```bash
   npx netlify dev
   ```

### Deploy to Netlify
1. Push to git repo
2. Connect repo to Netlify
3. Set env vars in Netlify dashboard (same as `.env`)
4. Build command: `npm run build`, publish dir: `dist`

## Status System

| Icon | Group | Color | Meaning |
|------|-------|-------|---------|
| ✓ | Renewed | Green | Tenant staying, lease signed |
| ↻ | Renewing | Teal | Tenant wants to stay, working through renewal |
| ◐ | Partial Turn | Blue | Some tenants leaving, some staying |
| ◑ | Partial (Lease Done) | Light blue | Partial turn, staying tenants signed |
| ? | Unknown | Gray | Haven't heard from tenant |
| ⟳ | Full Turnover | Orange | Everyone leaving, needs listing |
| ★ | Turnover (Rented) | Purple | Everyone leaving, new tenants found |
| ∞ | Month-to-Month | Slate | No fixed lease end |

## Build Phases

| Phase | What | Status |
|-------|------|--------|
| 1 | Single-file React prototype, real data, sorting, filtering, notes | ✅ Done |
| 2 | Vite + React 18, Google Sheets integration, copy-email buttons, status priority sort | ✅ Built (pending Google credentials) |
| 3 | Google Calendar watcher, post-showing forms, alert badges, automated emails | ⬜ Not started |
| 4 | Morning brief emails, improvement tracker, "Request to Update" module | ⬜ Not started |
| 5 | Hardware install, kiosk mode, wall mount | ⬜ Not started |

## Immediate TODOs

- [ ] `npm install && npm run dev` — verify app compiles and 78 seed units render
- [ ] Create Google Cloud project and enable Sheets API
- [ ] Create service account and share sheet with it
- [ ] Add env vars to Netlify and deploy
- [ ] Add "Area" header label to Sheet 1, column 17 (currently unlabeled)
- [ ] Test copy-email buttons with real tenant data
- [ ] Get team feedback on v2 UI
- [ ] Push repo to GitHub and connect to Netlify
- [ ] Research and purchase touchscreen display (55–65", 4K, <$800)

## Future: Request to Update Module (Phase 4)

The dashboard is read-only by design. A future "Request to Update" module will let the AI suggest changes to the Google Sheet (e.g., "Mark unit as renewed"), but Amanda must approve before any write occurs. This keeps Amanda as the gatekeeper of the source of truth.

## Cost Summary

| Item | Cost | Status |
|------|------|--------|
| Netlify hosting + functions | Free | ✅ Active |
| Google Cloud (Sheets API) | Free | ⬜ Needs setup |
| Claude API (future email parsing) | ~$1/month | ⬜ Phase 3+ |
| Touchscreen display | ~$500–800 | ⬜ Researching |
| **Total ongoing** | **~$0/month** (until Phase 3) | |
| **Total one-time** | **~$500–800** | |

## Data Notes

- **78 units** parsed from the 2025–2026 renewals spreadsheet
- **Airbnb units excluded** — filtered out during parsing (resident name = "Airbnb")
- **Owner column** = property owner (Jim, Brian, Carolyn, Nate and Amanda, etc.)
- **Bedroom count** sourced from Sheet 2 (property info), not approximated
- **Utilities** sourced from Sheet 2, shown in detail panel for future move-in emails
