# Strategy Review Handoff — Mills Dashboard

**Date:** 2026-04-01
**Branch:** `claude/review-project-strategy-6RfNm`

---

## What happened in this session

Full project review was conducted. The codebase was explored end-to-end and a set of critical strategic questions were raised. One concrete data gap was identified and confirmed.

---

## Critical Questions Raised (unanswered — need Nathan's input)

### Data & Workflow
1. **Two sources of truth:** Amanda maintains Google Sheets, but a Supabase backend is also being built. Who wins in a conflict? How do you reconcile if both get edited?
2. **Has Amanda agreed to the CSV sync workflow?** The Apple Shortcut → Supabase pipeline is built, but unclear if Amanda has bought into using it.
3. **Read-only dashboard friction:** When Amanda sees wrong data on the wall display, she has to fix her spreadsheet and wait up to 30 minutes. Is that acceptable?

### Product
4. **What's the killer feature?** What single thing would make Amanda open the dashboard instead of her spreadsheet every morning?
5. **Notes on a wall display:** Notes are localStorage-only. Who actually types notes on a wall-mounted kiosk? Does cross-device sync matter if the primary use is a wall display?
6. **Sensitive data stripping:** Door codes and lockbox numbers are stripped from sync. Does the turn crew (Fernando) actually need that info on the dashboard?

### Adoption
7. **Replacing three tools at once** (whiteboard, spreadsheet, Trello) — which does the team actually use today? Replacing multiple workflows simultaneously risks adoption failure.

### Technical
8. **Netlify free tier limits:** 30-min polling = ~1,440 calls/month. Fine now, but what about Phase 3 with real-time features?
9. **Supabase schema built before live data flows:** Was that the right order? The current blocker for live data is just Google service account credentials — should that have been done first?

---

## Concrete Finding: Missing Property Fields

### Problem
The Google Sheet's Property tab (Sheet 2) contains columns for **Paint**, **HVAC**, and **Water Heater**, but the dashboard completely ignores them.

### Where the gap is

**Sheet parser (`src/lib/sheetParser.js:28-35`)** — Only reads 5 columns from Sheet 2:
```
S2 = {
  PROPERTY: 0,   // address
  BEDS: 1,
  BATHS: 2,
  UTILITIES: 10,
  AREA: 24,
}
```
Paint, HVAC, and Water Heater columns are not mapped.

**Inline parser (`netlify/functions/get-units.js:205`)** — Same 5-column limitation:
```js
propInfo[addr] = { beds: clean(row[1]), baths: clean(row[2]), utilities: clean(row[10]), area: clean(row[24]) };
```

**Supabase schema (`supabase/schema.sql`)** — `units` table has no `paint`, `hvac`, or `water_heater` columns.

**Turnover tab (Sheet 1)** — `turnoverNotes` (column 14) contains free-text paint references like "full paint out (2020)", "Paint cabinets?" — but these are unstructured notes, not dedicated fields.

### What needs to happen
1. Identify which Sheet 2 column indices hold Paint, HVAC, and Water Heater
2. Add those to `S2` in `sheetParser.js` and the inline parser in `get-units.js`
3. Add columns to `units` table in Supabase schema
4. Update `unit_full` view to include the new columns
5. Pass them through the API response → React app
6. Display in `DetailPanel.jsx` (property facts section)
7. Clarify how property-level paint info relates to turnover-level paint notes — are they tracking "last painted date" vs "paint needed this turn"?

---

## Project State Summary

- **Phase 2 is feature-complete** — all core UI works with seed data
- **Blocker for live data:** Google service account credentials not configured
- **Supabase foundation is built** but not yet the primary data source
- **78 units rendering** from seed data, all sorting/filtering/search working
- **Architecture is solid** — good security practices, RLS, server-side auth isolation

---

## Files of Interest

| File | What it does |
|------|-------------|
| `src/lib/sheetParser.js` | Maps Google Sheets columns → unit objects (needs Paint/HVAC/WH columns) |
| `netlify/functions/get-units.js` | Server-side data fetch + inline parser (same gap) |
| `supabase/schema.sql` | DB schema (needs new columns) |
| `src/components/DetailPanel.jsx` | Unit detail view (needs to display new fields) |
| `src/data/units-seed.json` | Fallback data (has no paint/HVAC/WH fields) |
| `Mills-Dashboard-README.md` | Comprehensive project documentation |
