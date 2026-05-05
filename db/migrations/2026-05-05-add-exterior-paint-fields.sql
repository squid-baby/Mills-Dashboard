-- 2026-05-05-add-exterior-paint-fields.sql
--
-- Adds exterior paint fields to `units` so the Property tab's Paint section can
-- track exterior color + exterior trim alongside the existing interior fields.
--
-- Idempotent: safe to re-run.

ALTER TABLE units ADD COLUMN IF NOT EXISTS paint_exterior text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS paint_trim_exterior text DEFAULT '';
