-- Log: domain redesign, part 2 — rundown generation and placement now
-- follow local opportunities (previous migration), not clock slots'
-- fill_mode. This is a full replacement of log_rundown_items (and,
-- transitively, log_broadcast_events, which references it) rather than an
-- ALTER, because the shape genuinely changes: a rundown used to get one row
-- per fillable clock slot; now it gets one log_rundown_breaks row per local
-- opportunity occurrence (tiled hourly, same as before), and *inside* a
-- break, zero or more log_rundown_items rows — because an opportunity can
-- allow_multiple, hold an ad-hoc live-read with no library content_item, or
-- sit unused entirely (an optional break with zero items, which is a normal,
-- resolved state — see log_local_opportunities' comment). Both tables were
-- empty in both environments (no production data — see CLAUDE.md), so this
-- is a clean drop-and-recreate, not a backfill.
--
-- log_broadcast_events is dropped and recreated purely because its FK
-- target (log_rundown_items.id) changes identity — its own shape is
-- unchanged from 20260807160000_log_broadcast_events.sql.
--
-- Per-airing overrides (docs' "durable content vs. per-airing overrides"):
-- log_rundown_items carries override_* columns so a specific airing's
-- script/duration/intro/outro/tag can differ from the master log_content_item
-- / its components without ever writing to them. planned_duration_seconds
-- is always the *effective* total for this airing (master or overridden) —
-- see lib/log/content-library.ts's computeEffectiveDurationSeconds.
--
-- item_kind is plain text + a check constraint, not an enum — mirroring the
-- original 20260807210000_underwriting_placement.sql's own reasoning
-- (PostgreSQL can't add-and-use a new enum value in the same transaction),
-- since Underwriting's own migration needs to widen this set with
-- 'underwriting_credit' the same way it did before.

-- Drop the tables being replaced. CASCADE also drops: the Underwriting-added
-- item_kind widening/underwriting_copy_id column and its dependent check
-- constraint on log_rundown_items; the FK from uw_scheduled_placements.
-- log_rundown_item_id (leaving that column orphaned with no constraint,
-- fine since the next migration drops and recreates uw_scheduled_placements
-- wholesale); every trigger/policy attached to log_broadcast_events from
-- Underwriting's Slices 2-5 (uw_flag_exception_from_broadcast_event,
-- uw_update_makegood_from_broadcast_event, and the two select policies) —
-- all recreated, against the redesigned Underwriting schema, by the
-- migration that follows this one. The three security-definer functions
-- (log_place_underwriting_credit, log_clear_underwriting_credit,
-- log_list_placeable_rundown_items) are not dropped here — a plpgsql
-- function body isn't a tracked dependency, so they're left dangling
-- against the old shape and explicitly dropped/redefined in the
-- Underwriting redesign migration, alongside everything else that
-- references the old obligation model.
drop table public.log_broadcast_events cascade;
drop table public.log_rundown_items cascade;
drop type public.log_broadcast_outcome;
drop type public.log_confirmation_source;
drop type public.log_miss_reason;

-- Rundown breaks ------------------------------------------------------------

create table public.log_rundown_breaks (
  id uuid primary key default gen_random_uuid(),
  rundown_id uuid not null references public.log_rundowns (id) on delete cascade,
  local_opportunity_id uuid not null references public.log_local_opportunities (id) on delete restrict,
  position integer not null,
  -- Snapshots of the opportunity at generation time (label/requirement/
  -- permitted_content_types/allow_multiple) — the same "answers snapshot
  -- their question" precedent Audience Listening uses, so a later edit to
  -- the opportunity doesn't rewrite an already-generated rundown's meaning.
  label text not null,
  requirement public.log_opportunity_requirement not null,
  permitted_content_types text[] not null default '{}'::text[],
  allow_multiple boolean not null default true,
  scheduled_at timestamptz not null,
  available_duration_seconds integer not null,
  network_rejoin_at timestamptz not null,
  constraint log_rundown_breaks_duration_check check (available_duration_seconds > 0)
);

comment on table public.log_rundown_breaks is
  'One occurrence of a local opportunity within a rundown (docs/log-design.md §4B) — a container zero or more log_rundown_items may occupy. An unused break with requirement = optional is a normal, resolved state ("carrying network"); requirement = required with zero items is unresolved. See lib/log/timing.ts.';
comment on column public.log_rundown_breaks.network_rejoin_at is
  'The point by which WUWF must be back on network content — start + duration for a fixed opportunity, or the opportunity''s latest permitted start + duration for a floating one. Computed at generation time, not re-derived, since it depends on the opportunity''s offsets at the moment the rundown was built.';

create index log_rundown_breaks_rundown_idx on public.log_rundown_breaks (rundown_id, position);
create index log_rundown_breaks_opportunity_idx on public.log_rundown_breaks (local_opportunity_id);

-- Rundown items ---------------------------------------------------------------

create table public.log_rundown_items (
  id uuid primary key default gen_random_uuid(),
  break_id uuid not null references public.log_rundown_breaks (id) on delete cascade,
  position integer not null,
  item_kind text not null default 'content',
  content_item_id uuid references public.log_content_items (id) on delete restrict,
  live_read_title text,
  live_read_script text,
  -- Per-airing overrides — never written back to log_content_items or
  -- log_content_components. Null means "inherit from the master content
  -- item / its components." See docs/log-design.md's "Durable content vs.
  -- per-airing overrides."
  override_script text,
  override_duration_seconds integer,
  override_live_intro_seconds integer,
  override_live_outro_seconds integer,
  override_tag_seconds integer,
  override_notes text,
  -- The effective total for this specific airing (master or overridden) —
  -- see lib/log/content-library.ts's computeEffectiveDurationSeconds, which
  -- is what computes this value on every write.
  planned_duration_seconds integer not null,
  placement_status text not null default 'editable'
    check (placement_status in ('locked', 'movable', 'replaceable', 'editable')),
  constraint log_rundown_items_duration_check check (planned_duration_seconds > 0),
  constraint log_rundown_items_override_duration_check
    check (override_duration_seconds is null or override_duration_seconds > 0),
  -- Named explicitly (rather than left to Postgres' implicit <table>_<column>_check
  -- naming) since the Underwriting redesign migration drops and replaces this
  -- constraint by name to widen the allowed set with 'underwriting_credit'.
  constraint log_rundown_items_item_kind_check
    check (item_kind in ('content', 'live_read', 'weather')),
  -- Exactly one reference per kind — same discriminated-shape precedent as
  -- sw_source_excerpts. Underwriting's migration widens this to add
  -- 'underwriting_credit' + underwriting_copy_id.
  constraint log_rundown_items_item_kind_shape_check check (
    (item_kind = 'content' and content_item_id is not null and live_read_title is null)
    or
    (item_kind = 'live_read' and content_item_id is null and live_read_title is not null)
    or
    (item_kind = 'weather' and content_item_id is null and live_read_title is null)
  )
);

comment on table public.log_rundown_items is
  'A specific piece of content placed inside a log_rundown_breaks window (docs/log-design.md §4B/§7). item_kind = weather has no content reference at all — its effective text is the current log_weather_reading unless override_script is set for this one airing, which never mutates the master reading. See docs/log-design.md''s per-airing override section.';

create index log_rundown_items_break_idx on public.log_rundown_items (break_id, position);
create index log_rundown_items_content_item_idx on public.log_rundown_items (content_item_id);

-- Broadcast events (recreated — see file header) -----------------------------

create type public.log_broadcast_outcome as enum (
  'scheduled',
  'aired_as_scheduled',
  'aired_different_time',
  'partially_aired',
  'skipped',
  'missed',
  'replaced',
  'wrong_copy_aired',
  'unconfirmed',
  'pending_review',
  'makegood_scheduled',
  'makegood_aired',
  'waived'
);

create type public.log_confirmation_source as enum ('automation', 'host', 'exception_report', 'management_correction');

create type public.log_miss_reason as enum (
  'network_timing',
  'breaking_news',
  'segment_overrun',
  'technical_problem',
  'host_error',
  'unavailable_copy',
  'other'
);

create table public.log_broadcast_events (
  id uuid primary key default gen_random_uuid(),
  rundown_item_id uuid not null references public.log_rundown_items (id) on delete cascade,
  outcome public.log_broadcast_outcome not null,
  actual_started_at timestamptz,
  actual_duration_seconds integer,
  confirmation_source public.log_confirmation_source not null default 'host',
  reason public.log_miss_reason,
  notes text,
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now(),
  constraint log_broadcast_events_duration_check
    check (actual_duration_seconds is null or actual_duration_seconds > 0)
);

comment on table public.log_broadcast_events is
  'The planned-versus-actual record of one rundown item''s airing — the single source of as-aired truth. Append-only: RLS grants select+insert only, no update, no delete.';

create index log_broadcast_events_rundown_item_idx on public.log_broadcast_events (rundown_item_id, recorded_at desc);

-- Row Level Security ----------------------------------------------------------
-- Member-level throughout, matching the tables these replace.

alter table public.log_rundown_breaks enable row level security;
alter table public.log_rundown_items enable row level security;
alter table public.log_broadcast_events enable row level security;

grant select, insert, update on public.log_rundown_breaks to authenticated;
grant select, insert, update, delete on public.log_rundown_items to authenticated;
grant select, insert on public.log_broadcast_events to authenticated;

create policy log_rundown_breaks_select on public.log_rundown_breaks
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_rundown_breaks_insert on public.log_rundown_breaks
  for insert to authenticated
  with check (private.has_log_access(auth.uid()));

create policy log_rundown_breaks_update on public.log_rundown_breaks
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

-- Delete grant: unlike the original single-slot model, an item here is a
-- discrete placement inside a break that may hold several — "remove an
-- item" (docs/log-design.md Workflow E) is now an ordinary delete rather
-- than clearing a slot back to empty. The policy itself excludes
-- underwriting-credit items (added by the next migration), not just an
-- application-layer courtesy: deleting one directly would cascade-delete
-- its uw_scheduled_placements row instead of marking it superseded, erasing
-- placement history RLS is supposed to protect. An underwriting credit is
-- only ever removed through log_clear_underwriting_credit(), which is
-- security definer and bypasses this policy entirely.
create policy log_rundown_items_delete on public.log_rundown_items
  for delete to authenticated
  using (private.has_log_access(auth.uid()) and item_kind <> 'underwriting_credit');

create policy log_broadcast_events_select on public.log_broadcast_events
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_broadcast_events_insert on public.log_broadcast_events
  for insert to authenticated
  with check (private.has_log_access(auth.uid()));
