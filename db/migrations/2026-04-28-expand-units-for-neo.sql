-- 2026-04-28-expand-units-for-neo.sql
--
-- Add the property-side fields previously kept in the Google Sheet only
-- (door codes, appliance service, paint, etc.) into Supabase.units so the
-- consolidated sync-from-neo.mjs has a target column for every property
-- field on the "property-info-clean" tab of the Neo Google Sheet.
--
-- Idempotent: safe to re-run. All columns nullable with empty-string default
-- so existing dashboard reads tolerate them before the first sync runs.
--
-- Run in Supabase SQL editor BEFORE the first execution of sync-from-neo.mjs.

ALTER TABLE units ADD COLUMN IF NOT EXISTS door_code text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS lockbox_code text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS alarm_code text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS key_location text DEFAULT '';

-- Appliances
ALTER TABLE units ADD COLUMN IF NOT EXISTS stove text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS stove_replaced text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS stove_warranty text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS washer_replaced text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS washer_warranty text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS dryer_replaced text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS dryer_warranty text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS dishwasher_replaced text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS dishwasher_warranty text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS fridge_replaced text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS fridge_warranty text DEFAULT '';

-- HVAC + water heater
ALTER TABLE units ADD COLUMN IF NOT EXISTS hvac_last_service text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS water_heater_location text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS water_heater_type text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS water_heater_last_service text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS water_shutoff text DEFAULT '';

-- Filters / utilities meta
ALTER TABLE units ADD COLUMN IF NOT EXISTS filter_size text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS filter_size_2 text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS internet_provider text DEFAULT '';

-- Plumbing
ALTER TABLE units ADD COLUMN IF NOT EXISTS toilet_flapper_style text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS toilet_seat_style text DEFAULT '';

-- Paint
ALTER TABLE units ADD COLUMN IF NOT EXISTS paint_interior text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS paint_trim text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS paint_brand text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS paint_last_done text DEFAULT '';

-- Misc
ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_notes text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS portfolio text DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS lead_paint text DEFAULT '';
