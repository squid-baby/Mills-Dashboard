-- 2026-04-29-expand-inspections-for-worklist.sql
--
-- Phase 1A of the property/turnover redesign.
-- 1. Adds status + turnover_year + unit_address to the existing `inspections` table.
--    `unit_address` is added because the dashboard frontend uses sequential indices
--    in place of real unit UUIDs (same constraint that drove `calendar_tasks` to key
--    by unit_address). New writes populate unit_address; unit_id stays for
--    legacy rows that already have it.
-- 2. Creates `inspection_items` — one row per inspectable item, with action state
--    (needs_this / gathered_at / done_at) for the Worklist + Turnover Overview
--    introduced in Phases 1C–1D.
--
-- Idempotent: safe to re-run. Run BEFORE deploying the new save-inspection /
-- get-inspection / get-all-inspections functions.

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS status text DEFAULT 'complete';
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS turnover_year int;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS unit_address text;

CREATE INDEX IF NOT EXISTS idx_inspections_unit_address ON inspections(unit_address);

CREATE TABLE IF NOT EXISTS inspection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid REFERENCES inspections(id) ON DELETE CASCADE,
  unit_address text NOT NULL,
  category text NOT NULL,        -- 'blinds' | 'bulbs' | 'stove_parts' | 'toilet_seats' | 'outlets' | 'detectors' | 'keys' | 'paint' | 'condition' | 'custom'
  item_type text NOT NULL,       -- 'purchase' | 'work'
  payload jsonb NOT NULL,        -- item-specific fields (width/drop/qty, condition assessment, paint location, etc.)
  needs_this boolean DEFAULT false,
  gathered_at timestamptz,
  done_at timestamptz,
  done_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_items_unit ON inspection_items(unit_address);
CREATE INDEX IF NOT EXISTS idx_inspection_items_inspection ON inspection_items(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_items_needs ON inspection_items(needs_this) WHERE needs_this = true;
