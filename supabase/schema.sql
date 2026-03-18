-- ============================================================
-- Mills Rentals Dashboard — Supabase Schema
-- ============================================================
-- Run this in the Supabase SQL editor to set up the database.
--
-- SECURITY NOTES:
-- • RLS (Row Level Security) is enabled on every table.
-- • The browser uses the anon key — read-only access only.
-- • All writes go through Netlify Functions using the service_role key,
--   which bypasses RLS. The browser never sees service_role.
-- • Sensitive property data (door codes, lock box numbers) is NEVER
--   stored here — it stays in the gitignored CSV on Amanda's laptop.
-- ============================================================

-- ─── Extensions ────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── UNITS ─────────────────────────────────────────────────
-- One row per rental unit. Non-sensitive property info only.
create table if not exists units (
  id           uuid primary key default uuid_generate_v4(),
  address      text unique not null,
  beds         text,           -- stored as text to handle "Studio", "1, with an office", etc.
  baths        numeric(3,1),
  area         text,
  owner_name   text,
  utilities    text,
  property_type text,
  sq_ft        int,
  freeze_warning boolean default false,
  pets_allowed text,
  year_built   int,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ─── RESIDENTS ─────────────────────────────────────────────
-- One row per current resident, FK to units.
create table if not exists residents (
  id           uuid primary key default uuid_generate_v4(),
  unit_id      uuid not null references units(id) on delete cascade,
  name         text not null,
  email        text,
  status       text check (status in ('renewing', 'leaving', 'unknown', 'month to month')),
  lease_end    date,
  lease_signed boolean default false,
  deposit_paid boolean default false,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ─── NEXT_RESIDENTS ────────────────────────────────────────
-- Incoming tenants for the next lease term.
create table if not exists next_residents (
  id       uuid primary key default uuid_generate_v4(),
  unit_id  uuid not null references units(id) on delete cascade,
  name     text,
  email    text,
  phone    text,
  created_at timestamptz default now()
);

-- ─── PENDING_CHANGES ───────────────────────────────────────
-- AI / email parser suggests a change → Amanda approves before it's applied.
-- This is the gatekeeper table — nothing writes to units/residents directly
-- from automated sources without going through here first.
create table if not exists pending_changes (
  id           uuid primary key default uuid_generate_v4(),
  unit_id      uuid references units(id) on delete cascade,
  table_name   text not null,  -- 'residents' | 'units' | 'next_residents'
  record_id    uuid,            -- which row is being changed (null = new row)
  field        text not null,
  old_value    text,
  new_value    text not null,
  source       text not null,  -- 'email_parse' | 'csv_sync' | 'manual'
  confidence   numeric(4,3),   -- 0.0–1.0, from AI parser
  source_ref   text,           -- email message-id, CSV filename, etc.
  approved_at  timestamptz,
  approved_by  text,
  rejected_at  timestamptz,
  created_at   timestamptz default now()
);

-- ─── NOTES ─────────────────────────────────────────────────
-- Per-unit notes, synced across devices (replaces localStorage).
create table if not exists notes (
  id         uuid primary key default uuid_generate_v4(),
  unit_id    uuid not null references units(id) on delete cascade,
  body       text not null,
  created_by text default 'dashboard',
  created_at timestamptz default now()
);

-- ─── SYNC_LOG ──────────────────────────────────────────────
-- Audit trail of every data sync (CSV upload, Sheets poll, etc.)
create table if not exists sync_log (
  id                uuid primary key default uuid_generate_v4(),
  source            text not null,  -- 'csv' | 'google_sheets'
  status            text not null,  -- 'success' | 'error'
  units_upserted    int default 0,
  residents_upserted int default 0,
  error_msg         text,
  created_at        timestamptz default now()
);

-- ─── INDEXES ───────────────────────────────────────────────
create index if not exists idx_residents_unit_id      on residents(unit_id);
create index if not exists idx_next_residents_unit_id on next_residents(unit_id);
create index if not exists idx_pending_changes_unit_id on pending_changes(unit_id);
create index if not exists idx_pending_changes_approved on pending_changes(approved_at) where approved_at is null;
create index if not exists idx_notes_unit_id          on notes(unit_id);

-- ─── updated_at trigger ────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger units_updated_at
  before update on units
  for each row execute function set_updated_at();

create trigger residents_updated_at
  before update on residents
  for each row execute function set_updated_at();

-- ─── ROW LEVEL SECURITY ────────────────────────────────────
-- Browser uses anon key → read-only.
-- Netlify Functions use service_role key → bypasses RLS, full write access.

alter table units            enable row level security;
alter table residents        enable row level security;
alter table next_residents   enable row level security;
alter table pending_changes  enable row level security;
alter table notes            enable row level security;
alter table sync_log         enable row level security;

-- Anon: read-only on core data
create policy "anon_select_units"
  on units for select using (true);

create policy "anon_select_residents"
  on residents for select using (true);

create policy "anon_select_next_residents"
  on next_residents for select using (true);

-- Anon: can see pending changes (needed for approval UI in dashboard)
create policy "anon_select_pending"
  on pending_changes for select using (true);

-- Anon: can read notes
create policy "anon_select_notes"
  on notes for select using (true);

-- Anon: NO access to sync_log (internal only)
-- (no policy = deny by default under RLS)

-- ─── VIEWS ─────────────────────────────────────────────────
-- Convenience view: units with all residents + next residents as JSON arrays.
-- Used by get-units Netlify Function to fetch everything in one query.
create or replace view unit_full as
select
  u.id,
  u.address,
  u.beds,
  u.baths,
  u.area,
  u.owner_name,
  u.utilities,
  u.property_type,
  u.sq_ft,
  u.freeze_warning,
  u.pets_allowed,
  u.year_built,
  u.updated_at,
  coalesce(
    json_agg(
      json_build_object(
        'id',           r.id,
        'name',         r.name,
        'email',        r.email,
        'status',       r.status,
        'leaseEnd',     r.lease_end,
        'leaseSigned',  r.lease_signed,
        'depositPaid',  r.deposit_paid,
        'notes',        r.notes
      ) order by r.name
    ) filter (where r.id is not null),
    '[]'
  ) as residents,
  coalesce(
    json_agg(
      json_build_object(
        'id',    nr.id,
        'name',  nr.name,
        'email', nr.email,
        'phone', nr.phone
      ) order by nr.name
    ) filter (where nr.id is not null),
    '[]'
  ) as next_residents
from units u
left join residents r on r.unit_id = u.id
left join next_residents nr on nr.unit_id = u.id
group by u.id;
