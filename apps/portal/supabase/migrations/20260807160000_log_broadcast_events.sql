-- Log: milestone 1's next slice — "the host console with mid-broadcast
-- actions" (CLAUDE.md), Workflows F and G in docs/log-design.md ("Running
-- the console live" and "Mid-broadcast host actions"). Adds
-- log_broadcast_events, the last of the ten §5 tables and, per that
-- section, "the single source of as-aired truth."
--
-- Append-only from the application — same reasoning as log_clock_versions/
-- log_clock_slots, but for a different purpose: §1.2's "planned is not
-- aired... every deviation is retained, never silently dropped from the
-- record" means a broadcast event, once recorded, is a fact about what
-- happened, not a draft to edit in place. RLS below grants select+insert
-- only, no update, no delete.
--
-- Outcome vocabulary is copied verbatim from docs/log-design.md §5 ("the
-- full §15.1 vocabulary"). This slice's own code produces only three of the
-- twelve values — 'aired_as_scheduled' (the Aired action), 'missed' (the
-- Missed action), and 'skipped' (see below) — the rest exist for a
-- corrections/exception workflow this milestone doesn't build yet
-- (management_correction, makegood_*, wrong_copy_aired, etc.), matching the
-- same "schema-complete, not all populated yet" precedent as
-- confirmation_source = 'automation'.
--
-- One interpretation this slice had to make, not spelled out in the design
-- doc excerpt available here: what a "moved" action actually writes.
-- log_rundown_items already models "a specific placement... into a clock
-- slot" (docs/log-design.md §2), so moving a piece of content to a
-- different opening is modeled as filling a *different* rundown_item with
-- the same content_item_id and clearing the original one back to empty —
-- not a new column or a special "moved" status. The original placement's
-- own broadcast event gets outcome = 'skipped' ("this specific planned
-- placement did not happen, because the content moved elsewhere") rather
-- than 'replaced' (which reads as "something else took over this slot,"
-- not what happened here). See lib/log/rundown-actions.ts's moveRundownItem
-- and the file header there for the undo mechanism, which is simply the
-- same move run in reverse — no delete/update ever needed on this table.

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
  'The planned-versus-actual record of one rundown item''s airing (docs/log-design.md §2) — the single source of as-aired truth. Append-only: RLS grants select+insert only, no update, no delete.';

create index log_broadcast_events_rundown_item_idx on public.log_broadcast_events (rundown_item_id, recorded_at desc);

-- Row Level Security ------------------------------------------------------------
-- Member-level, no producer gate — recording a mid-broadcast outcome is an
-- ordinary host duty, same as building the rundown (Slice 4).

alter table public.log_broadcast_events enable row level security;

grant select, insert on public.log_broadcast_events to authenticated;

create policy log_broadcast_events_select on public.log_broadcast_events
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_broadcast_events_insert on public.log_broadcast_events
  for insert to authenticated
  with check (private.has_log_access(auth.uid()));
