# Handoff: Neo Spreadsheet Column Shift Fix

**Date:** April 23, 2026  
**Branch:** `claude/investigate-spreadsheet-migration-TkYjw`  
**Priority:** High — ownership and possibly several other fields are currently reading wrong data

---

## What Happened

When Amanda's data was copied from the original `2025-2026 Renewals_Dashboard.numbers` into the new "Neo" spreadsheet, the column layout changed. The sync script (`scripts/sync-from-numbers.mjs`) reads data by **hardcoded column position** (`S1.OWNER = 17`, etc.), so any column insertion or reordering silently maps fields to the wrong values.

This is the second time this has happened — the April 2026 comment in the script shows it was already patched once:
> `updated April 2026 — Move Out moved to col 8, new col 13 inserted`

That patch bumped `NEXT_MOVE_IN` from 13 → 14 and re-shuffled four other fields. The Neo migration introduced another round of changes that weren't reflected.

---

## Confirmed Impact

- **`owner_name`** — reading wrong column; owners are assigned to wrong properties in Supabase
- **`area`** — likely wrong for the same reason (col 18, right next to owner)

## Likely Additional Impact

Any column inserted **before** position 9 would shift every field after it. Fields at risk:

| S1 constant | Current index | Field written to Supabase |
|-------------|---------------|--------------------------|
| `NOTES` | 9 | `residents.notes` |
| `NEXT_RESIDENT` | 10 | `next_residents.name` |
| `NEXT_EMAIL` | 11 | `next_residents.email` |
| `NEXT_PHONE` | 12 | `next_residents.phone` |
| `NEXT_MOVE_IN` | 14 | `next_residents.move_in_date` |
| `OWNER` | 17 | `units.owner_name` |
| `AREA` | 18 | `units.area` |

Fields 0–4 (address, resident name, email, phone, lease end) are low risk — they'd only shift if a column was inserted before column A.

**Not affected:** `freeze_warning` is not read from the Numbers file at all. It comes from the Property Info Google Sheet via `sync-property-cache.mjs`.

---

## Step 1: Diagnose the Actual Column Layout

Run this against the Neo file to see what's actually at each position:

```bash
python3 -c "
import numbers_parser
doc = numbers_parser.Document('/path/to/Neo spreadsheet.numbers')
for i, cell in enumerate(doc.sheets[0].tables[0].rows()[0]):
    print(i, repr(cell.value))
"
```

Compare the output to the `S1` constants at the top of `scripts/sync-from-numbers.mjs` (lines 24–41). Every mismatch is a field being read from the wrong column.

---

## Step 2: Immediate Patch (Tactical)

Update the hardcoded indices in `S1` to match the Neo file's actual layout, then re-run the sync. This stops the bleeding quickly.

```bash
node --env-file=.env scripts/sync-from-numbers.mjs
```

Verify in Supabase that `units.owner_name` and `units.area` look correct after the run.

---

## Step 3: Permanent Fix (Recommended)

Refactor `sync-from-numbers.mjs` to look up columns **by header name** instead of by index — the same pattern the Google Sheet integration already uses (`src/config/columns.js`).

High-level approach:
1. Export the Numbers file with headers included (row 0)
2. After parsing the CSV, read row 0 to build a `headerName → columnIndex` map
3. Replace all `S1.X` integer constants with lookups against that map
4. Log a warning (and skip the field) if an expected header isn't found

This makes the sync resilient to any future column reordering Amanda does in Numbers. She can add, move, or rename columns without breaking the sync — matching is by name, not position.

---

## Step 4: Update CLAUDE.md

The column index table in CLAUDE.md (`### Numbers Sheet 1 Column Indices`) is stale — it still shows the original positions, not the April 2026 ones. After the permanent fix lands, replace that table with the canonical header names the script expects (since positions will no longer be meaningful).

---

## Files to Touch

| File | Change |
|------|--------|
| `scripts/sync-from-numbers.mjs` | Replace hardcoded `S1` indices with header-based lookup |
| `CLAUDE.md` | Update the Numbers Sheet 1 column table to reflect header names, not indices |

No Netlify functions, no Supabase schema changes, no frontend changes needed.

---

## Testing Checklist

- [ ] Print Neo file headers and verify all expected header names are present
- [ ] Run sync against Neo file: `node --env-file=.env scripts/sync-from-numbers.mjs`
- [ ] Spot-check 5–10 units in Supabase: confirm `owner_name`, `area`, `residents.notes`, `next_residents.move_in_date` look correct
- [ ] Confirm no "unmatched address" warnings increased (address matching is unrelated but good to verify)
- [ ] Run sync a second time and confirm change-detection email shows no spurious changes
