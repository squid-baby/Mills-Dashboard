-- 2026-05-03-add-inspection-stages.sql
--
-- Adds the cleaning + finalizing lifecycle stages to inspections, plus an
-- idempotency marker for the "all flagged tasks done" notification email.
--
-- Workflow modeled:
--   inspector saves inspection         → existing "Inspection Status: Complete" email
--   team checks off every flagged task → NEW "Turnover Task Status: Complete" email
--                                        (gated by tasks_complete_email_sent_at so
--                                         un-check / re-check loops don't spam)
--   cleaner clicks "Cleaned" + notes   → NEW "Cleaning Status: Complete" email
--   someone clicks "Finalized" + notes → NEW "Turnover Status: Finalized" email
--
-- Stage notes live in dedicated columns (cleaned_notes / finalized_notes) rather
-- than getting appended to overall_notes, so each actor's comments stay
-- attributable and the email bodies can render them under their own headings.
--
-- Idempotent: safe to re-run.

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS cleaned_at    timestamptz;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS cleaned_by    text;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS cleaned_notes text;

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS finalized_at    timestamptz;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS finalized_by    text;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS finalized_notes text;

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS tasks_complete_email_sent_at timestamptz;
