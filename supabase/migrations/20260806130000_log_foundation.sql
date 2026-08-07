-- Log: the seventh tool on the portal foundation, and the first of three
-- splitting the WUWF Unified Broadcast Rundown and Traffic System spec (see
-- docs/broadcast-operations-strategy.md). Log owns the operational spine —
-- Program, Clock, Content item, Rundown, Broadcast event — that Underwriting
-- & Traffic and FCC Reporting will read from once they exist.
--
-- See docs/log-design.md for the full product and architecture rationale.
-- This migration is Slice 1 of Log's milestone 1 ("Foundation"): only the
-- five tables Workflows A (defining a clock) and B (scheduling programs)
-- need. Content library, NPR/weather, rundown generation + the host console,
-- and broadcast events all follow in later slices, each with its own
-- migration — see docs/log-design.md §7 and CLAUDE.md's Log section for the
-- planned breakdown. Building all ten of §5's tables in one migration before
-- any of the later slices' code exists to use them would be exactly the
-- speculative-schema mistake CLAUDE.md warns against elsewhere.
--
-- What's different from other tools here, worth knowing before extending it:
--
--   1. This tool is invite_only, like Academic Partnerships — a tool_access
--      grant is the ticket in, not an elevation on top of open access (unlike
--      Roadmap's approved_staff shape). private.has_log_access() mirrors
--      private.has_academic_partnerships_access() exactly.
--   2. Member vs. Producer is the same shape as Academic Partnerships'
--      member/coordinator split: private.is_log_producer() checks
--      tool_role = 'producer', OR'd with private.is_administrator().
--   3. log_clock_versions and log_clock_slots are insert-only from the
--      application, on purpose (docs/log-design.md §5's "no update path on
--      this table from the application beyond the fields above at
--      creation... a correction is a new version"). A completed rundown must
--      forever point at the exact clock that generated it, the same reason
--      Audience Listening's answers snapshot their question rather than
--      referencing a live al_questions row. RLS below grants producers
--      select+insert only on both tables — no update, no delete.
--
-- Tables are prefixed log_ per CLAUDE.md's directory conventions.

create type public.log_program_kind as enum ('recurring', 'special');

create type public.log_schedule_entry_type as enum ('recurring', 'override', 'holiday');

create type public.log_clock_version_variant as enum (
  'weekday',
  'weekend',
  'program_specific',
  'holiday',
  'special_event'
);

create type public.log_slot_fill_mode as enum ('required', 'optional', 'host_fillable');

create type public.log_slot_assignment_mode as enum ('automatic', 'preassigned', 'host_selected');

create type public.log_slot_timing_mode as enum ('fixed', 'float');

-- Programs -------------------------------------------------------------------

create table public.log_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  kind public.log_program_kind not null default 'recurring',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

comment on table public.log_programs is
  'A recurring or special broadcast program (docs/log-design.md §3, §4.1). Identifies scheduled air periods; does not itself carry timing structure — see log_schedule and log_clock_templates.';

create index log_programs_name_idx on public.log_programs (name);

-- Clock templates / versions / slots ------------------------------------------
-- A template is the named, editable clock staff maintain. A version is an
-- immutable, dated snapshot of that template's slots — see the file header.

create table public.log_clock_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

comment on table public.log_clock_templates is
  'The named, editable clock staff maintain ("Weekday Morning Drive"). Has no "current slots" of its own — see log_clock_versions.';

create table public.log_clock_versions (
  id uuid primary key default gen_random_uuid(),
  clock_template_id uuid not null references public.log_clock_templates (id) on delete cascade,
  variant public.log_clock_version_variant not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint log_clock_versions_effective_range_check
    check (effective_to is null or effective_to >= effective_from)
);

comment on table public.log_clock_versions is
  'An immutable, dated snapshot of a template''s slots for one variant. Insert-only from the application (RLS below grants no update) — a correction is a new version, never an edit, so a completed rundown forever points at the exact clock that generated it.';

create index log_clock_versions_template_idx
  on public.log_clock_versions (clock_template_id, variant, effective_from desc);

create table public.log_clock_slots (
  id uuid primary key default gen_random_uuid(),
  clock_version_id uuid not null references public.log_clock_versions (id) on delete cascade,
  position integer not null,
  start_offset_seconds integer,
  duration_seconds integer not null,
  permitted_content_types text[] not null default '{}'::text[],
  fill_mode public.log_slot_fill_mode not null default 'host_fillable',
  assignment_mode public.log_slot_assignment_mode not null default 'host_selected',
  replaceable boolean not null default true,
  shortenable boolean not null default false,
  allow_empty boolean not null default false,
  allow_multiple boolean not null default false,
  timing_mode public.log_slot_timing_mode not null default 'fixed',
  lock_on_air boolean not null default false,
  label text,
  constraint log_clock_slots_duration_check check (duration_seconds > 0)
);

comment on table public.log_clock_slots is
  'A position within a clock version: offset, duration, permitted content types, and how it may be filled (docs/log-design.md §4.2). Insert-only from the application, same reasoning as log_clock_versions.';

create index log_clock_slots_version_idx on public.log_clock_slots (clock_version_id, position);

-- Schedule ---------------------------------------------------------------------

create table public.log_schedule (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.log_programs (id) on delete cascade,
  clock_template_id uuid not null references public.log_clock_templates (id) on delete restrict,
  entry_type public.log_schedule_entry_type not null default 'recurring',
  days_of_week integer[] not null default '{}'::integer[],
  start_date date not null,
  end_date date,
  effective_from date not null default current_date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  constraint log_schedule_date_range_check check (end_date is null or end_date >= start_date)
);

comment on table public.log_schedule is
  'Maps a program to the calendar: the recurring weekly grid plus date-bounded substitutions and holiday overrides (docs/log-design.md §4.1). days_of_week is 0=Sunday..6=Saturday, populated for entry_type = recurring.';

create index log_schedule_program_idx on public.log_schedule (program_id);
create index log_schedule_template_idx on public.log_schedule (clock_template_id);
create index log_schedule_dates_idx on public.log_schedule (start_date, end_date);

-- updated_at maintenance -------------------------------------------------------

create trigger set_log_clock_templates_updated_at
  before update on public.log_clock_templates
  for each row execute function public.set_updated_at();

-- Authorization helpers ---------------------------------------------------------
-- In `private`, never `public` — see 20260724120000_private_authz_functions.sql.

create function private.has_log_access(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tool_access ta
    join public.tools t on t.id = ta.tool_id
    join public.profiles p on p.id = uid
    where ta.user_id = uid
      and t.key = 'log'
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

-- The elevation within the tool: a grant carrying tool_role = 'producer',
-- same shape as private.is_academic_partnerships_coordinator(). Producers
-- additionally edit clock templates/versions and the program schedule
-- (docs/log-design.md §6); every member builds/executes rundowns and runs
-- the console once those slices exist.
create function private.is_log_producer(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tool_access ta
    join public.tools t on t.id = ta.tool_id
    join public.profiles p on p.id = uid
    where ta.user_id = uid
      and t.key = 'log'
      and ta.revoked_at is null
      and ta.tool_role = 'producer'
      and p.account_status = 'active'
  ) or private.is_administrator(uid);
$$;

revoke execute on function private.has_log_access(uuid) from public, anon;
revoke execute on function private.is_log_producer(uuid) from public, anon;
grant execute on function private.has_log_access(uuid) to authenticated;
grant execute on function private.is_log_producer(uuid) to authenticated;

-- Row Level Security ------------------------------------------------------------
-- Staff-only on every table, no unauthenticated participant the way Audience
-- Listening or Academic Partnerships' public form have.

alter table public.log_programs enable row level security;
alter table public.log_clock_templates enable row level security;
alter table public.log_clock_versions enable row level security;
alter table public.log_clock_slots enable row level security;
alter table public.log_schedule enable row level security;

grant select, insert, update on public.log_programs to authenticated;
grant select, insert, update on public.log_clock_templates to authenticated;
-- Insert-only: no update grant for versions/slots — see file header.
grant select, insert on public.log_clock_versions to authenticated;
grant select, insert on public.log_clock_slots to authenticated;
grant select, insert, update on public.log_schedule to authenticated;

create policy log_programs_select on public.log_programs
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_programs_insert on public.log_programs
  for insert to authenticated
  with check (private.is_log_producer(auth.uid()));

create policy log_programs_update on public.log_programs
  for update to authenticated
  using (private.is_log_producer(auth.uid()))
  with check (private.is_log_producer(auth.uid()));

create policy log_clock_templates_select on public.log_clock_templates
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_clock_templates_insert on public.log_clock_templates
  for insert to authenticated
  with check (private.is_log_producer(auth.uid()));

create policy log_clock_templates_update on public.log_clock_templates
  for update to authenticated
  using (private.is_log_producer(auth.uid()))
  with check (private.is_log_producer(auth.uid()));

create policy log_clock_versions_select on public.log_clock_versions
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_clock_versions_insert on public.log_clock_versions
  for insert to authenticated
  with check (private.is_log_producer(auth.uid()));

create policy log_clock_slots_select on public.log_clock_slots
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_clock_slots_insert on public.log_clock_slots
  for insert to authenticated
  with check (private.is_log_producer(auth.uid()));

create policy log_schedule_select on public.log_schedule
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_schedule_insert on public.log_schedule
  for insert to authenticated
  with check (private.is_log_producer(auth.uid()));

create policy log_schedule_update on public.log_schedule
  for update to authenticated
  using (private.is_log_producer(auth.uid()))
  with check (private.is_log_producer(auth.uid()));

-- Registry row ------------------------------------------------------------------
-- Upsert rather than update, per the audience-listening/remote-interview
-- lesson: a bare update silently no-ops on a project whose seed never ran.

insert into public.tools (key, name, description, route, status, enabled, default_access, sort_order)
values (
  'log',
  'Log',
  'Daily broadcast rundown planning — clocks, the content library, and the live host console for on-air programs.',
  '/log',
  'available',
  true,
  'invite_only',
  7
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  route = excluded.route,
  status = excluded.status,
  enabled = excluded.enabled;
