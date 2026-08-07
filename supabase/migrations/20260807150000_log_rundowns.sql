-- Log: milestone 1's next slice — "Rundown generation with the timing
-- engine" (CLAUDE.md), Workflow E in docs/log-design.md ("Building the
-- daily rundown"). Adds log_rundowns and log_rundown_items — the two
-- tables that slice needs, out of the ten docs/log-design.md §5 lists for
-- the whole milestone. log_broadcast_events is not built here: nothing in
-- this slice's code reads or writes it, since recording an as-aired outcome
-- belongs to the next slice (the host console with mid-broadcast actions,
-- per CLAUDE.md's ordering) — building it now would be exactly the
-- speculative-schema mistake the Slice 1 migration's own header warns
-- against.
--
-- Two deliberate departures from docs/log-design.md §5's literal column
-- list, both explained here rather than left to be rediscovered later:
--
--   1. log_rundown_items.content_item_id is nullable, and generation never
--      creates a row at all for a clock_slot whose fill_mode = 'required'.
--      Those slots (the overwhelming majority of every seeded clock — the
--      network feed itself, assignment_mode = 'automatic' for every one of
--      them in this tool's real data) have no content_item to pick and
--      nothing for a rundown_item to represent; a row that can never be
--      filled would just be noise in the builder. Only slots where a host
--      actually decides something (fill_mode 'optional' or 'host_fillable')
--      get a row, starting unfilled (content_item_id null) until the host
--      (or a producer preparing ahead) picks something — see
--      lib/log/rundown-generation.ts.
--   2. log_rundowns gets a unique (program_id, air_date) constraint, not
--      specified in §5 but needed to keep "generate a rundown" idempotent —
--      without it, clicking Generate twice for the same program/date would
--      silently create two competing rundowns.
--
-- Member-level RLS throughout (private.has_log_access, no producer gate),
-- matching the content library's precedent: docs/log-design.md's Workflow E
-- is explicit this is "host, or a producer preparing ahead" — an ordinary
-- member action, not a producer-only one, the same distinction Slice 1's
-- migration drew between clock/schedule editing (producer) and everything
-- else (member).

create type public.log_rundown_status as enum ('draft', 'generated', 'in_progress', 'submitted');

-- 'suggested' is reachable only via a future manual override of a specific
-- placement (docs/log-design.md §5: "defaults from the slot but can be
-- overridden") — generation itself only ever produces 'required' or
-- 'optional', see defaultRequirementLevel in lib/log/rundown-generation.ts.
create type public.log_requirement_level as enum ('required', 'suggested', 'optional');

create type public.log_placement_status as enum ('locked', 'movable', 'replaceable', 'editable');

-- Not populated by anything in this slice — a stored, historical warning
-- (e.g. content that was retired after being placed) is a later slice's
-- concern, not the live duration-fit check lib/log/timing.ts computes on
-- every render. Column exists now so the table's shape matches
-- docs/log-design.md §5 without a later migration needing to widen it.
create type public.log_item_warning as enum ('timing_conflict', 'stale_content', 'none');

create table public.log_rundowns (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.log_programs (id) on delete cascade,
  schedule_entry_id uuid references public.log_schedule (id) on delete set null,
  clock_version_id uuid not null references public.log_clock_versions (id) on delete restrict,
  air_date date not null,
  shift_start_at timestamptz not null,
  shift_end_at timestamptz not null,
  status public.log_rundown_status not null default 'draft',
  generated_at timestamptz,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles (id) on delete set null,
  constraint log_rundowns_shift_range_check check (shift_end_at > shift_start_at),
  constraint log_rundowns_program_date_unique unique (program_id, air_date)
);

comment on table public.log_rundowns is
  'The generated, editable plan for one program''s air period on one date (docs/log-design.md §2). One per (program_id, air_date) — generating twice for the same broadcast reuses the existing row rather than creating a competitor.';

create index log_rundowns_air_date_idx on public.log_rundowns (air_date);
create index log_rundowns_program_idx on public.log_rundowns (program_id);

create table public.log_rundown_items (
  id uuid primary key default gen_random_uuid(),
  rundown_id uuid not null references public.log_rundowns (id) on delete cascade,
  clock_slot_id uuid not null references public.log_clock_slots (id) on delete restrict,
  content_item_id uuid references public.log_content_items (id) on delete restrict,
  position integer not null,
  scheduled_at timestamptz not null,
  planned_duration_seconds integer not null,
  requirement_level public.log_requirement_level not null default 'required',
  placement_status public.log_placement_status not null default 'editable',
  current_warning public.log_item_warning,
  constraint log_rundown_items_duration_check check (planned_duration_seconds > 0)
);

comment on table public.log_rundown_items is
  'A specific placement within a rundown (docs/log-design.md §2) — always for a host-decided clock slot (fill_mode optional/host_fillable); required/network-automatic slots never get a row here, see the migration file header. content_item_id is null until filled.';

create index log_rundown_items_rundown_idx on public.log_rundown_items (rundown_id, position);
create index log_rundown_items_content_item_idx on public.log_rundown_items (content_item_id);

-- Row Level Security ------------------------------------------------------------
-- Member-level, no producer gate — see file header.

alter table public.log_rundowns enable row level security;
alter table public.log_rundown_items enable row level security;

grant select, insert, update on public.log_rundowns to authenticated;
grant select, insert, update on public.log_rundown_items to authenticated;

create policy log_rundowns_select on public.log_rundowns
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_rundowns_insert on public.log_rundowns
  for insert to authenticated
  with check (private.has_log_access(auth.uid()));

create policy log_rundowns_update on public.log_rundowns
  for update to authenticated
  using (private.has_log_access(auth.uid()))
  with check (private.has_log_access(auth.uid()));

create policy log_rundown_items_select on public.log_rundown_items
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_rundown_items_insert on public.log_rundown_items
  for insert to authenticated
  with check (private.has_log_access(auth.uid()));

create policy log_rundown_items_update on public.log_rundown_items
  for update to authenticated
  using (private.has_log_access(auth.uid()))
  with check (private.has_log_access(auth.uid()));
