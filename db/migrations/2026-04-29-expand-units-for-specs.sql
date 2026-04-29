-- 2026-04-29-expand-units-for-specs.sql
--
-- Phase 1B: outlet_standard_color is the house-wide outlet/switch cover color
-- (e.g. "White", "Almond"). Displayed on the Property tab; in Phase 1C, used
-- to pre-fill new Outlet rows in the turnover replacement checklist so the
-- inspector doesn't have to repeat themselves.
--
-- Blinds were considered for the same treatment but dropped — a single house
-- has many different blind sizes, so per-unit standards are the wrong shape.
-- Phase 1C will pull blind sizes from the previous turnover's inspection_items.
--
-- Idempotent: safe to re-run.

ALTER TABLE units ADD COLUMN IF NOT EXISTS outlet_standard_color text DEFAULT '';
