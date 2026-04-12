-- Calendar Tasks table for Mills Dashboard turnover calendar
-- Run this in the Supabase SQL editor

create table if not exists calendar_tasks (
  id           uuid primary key default gen_random_uuid(),
  unit_address text not null,
  task_type    text not null check (task_type in ('move_out','paint','repair','clean','finalize','move_in')),
  start_date   date not null,
  start_slot   text not null check (start_slot in ('am','pm')),
  end_date     date not null,
  end_slot     text not null check (end_slot in ('am','pm')),
  crew         text default '',
  notes        text default '',
  status       text default 'planned' check (status in ('planned','in_progress','done')),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Index for date range queries (calendar view fetches by week/month window)
create index if not exists idx_calendar_tasks_dates
  on calendar_tasks (start_date, end_date);

-- Index for per-unit lookups
create index if not exists idx_calendar_tasks_address
  on calendar_tasks (unit_address);

-- Allow service role full access (matches existing RLS pattern for notes table)
alter table calendar_tasks enable row level security;

create policy "Service role full access on calendar_tasks"
  on calendar_tasks
  for all
  using (true)
  with check (true);
