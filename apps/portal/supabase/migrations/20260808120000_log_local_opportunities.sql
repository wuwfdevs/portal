-- Log: domain redesign, part 1 of several — separates the network clock from
-- WUWF's own local substitution opportunities. See CLAUDE.md's "Log domain
-- redesign" note and docs/log-design.md §4A/§4B for the full account of why.
--
-- The problem: log_clock_slots.fill_mode ('required' | 'optional' |
-- 'host_fillable') conflated three genuinely different things — network
-- content that airs automatically, a local avail WUWF may optionally cover,
-- and content WUWF genuinely must supply — into one column on the network
-- clock's own structural table. Every real clock seeded so far (Morning
-- Edition included) has every slot at fill_mode = 'required'/assignment_mode
-- = 'automatic': there has never actually been a host-fillable network slot
-- in this data, because a WUWF local opportunity (a music-bed cover, a
-- longer story substitution) is not a property of one network segment —
-- it is WUWF's own operational decision layered *on top of* the network
-- clock's accurate structure, and it can span several network segments (a
-- floating story window commonly eats a Music Bed and both adjacent
-- newscasts, per the real Morning Edition case this redesign is built
-- against).
--
-- The fix: log_clock_slots goes back to describing only what NPR/the network
-- actually publishes — offset, duration, label, and (for a genuinely
-- floating network element like Hidden Brain's own described break) a
-- timing window. Nothing about local fillability lives there anymore.
-- log_local_opportunities is new: WUWF's own overlay, independently
-- versioned against a clock_version (so it stays meaningful against the
-- exact offsets it was authored for) but editable in place, unlike the
-- network clock's own insert-only immutability — this is WUWF policy, not
-- NPR's structure, and a producer revising which windows are local avails
-- doesn't rewrite history the way editing the network clock itself would.
--
-- requirement ('optional' | 'required') is the field that actually answers
-- "is this a genuine host obligation, or just an avail WUWF may or may not
-- use" — see log_rundown_breaks (next migration) for how an unused optional
-- opportunity renders as "carrying network," never "unresolved."

-- Local opportunities -----------------------------------------------------

create type public.log_opportunity_requirement as enum ('optional', 'required');

create table public.log_local_opportunities (
  id uuid primary key default gen_random_uuid(),
  clock_version_id uuid not null references public.log_clock_versions (id) on delete cascade,
  position integer not null,
  label text not null,
  requirement public.log_opportunity_requirement not null default 'optional',
  timing_mode public.log_slot_timing_mode not null default 'fixed',
  start_offset_seconds integer not null,
  duration_seconds integer not null,
  earliest_start_offset_seconds integer,
  latest_start_offset_seconds integer,
  permitted_content_types text[] not null default '{}'::text[],
  allow_multiple boolean not null default true,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint log_local_opportunities_duration_check check (duration_seconds > 0),
  constraint log_local_opportunities_offset_check check (start_offset_seconds >= 0),
  constraint log_local_opportunities_float_window_check check (
    (timing_mode = 'float' and earliest_start_offset_seconds is not null
      and latest_start_offset_seconds is not null
      and latest_start_offset_seconds >= earliest_start_offset_seconds)
    or
    (timing_mode = 'fixed' and earliest_start_offset_seconds is null
      and latest_start_offset_seconds is null)
  )
);

comment on table public.log_local_opportunities is
  'WUWF''s own local-substitution overlay on an accurate network clock version — a music-bed cover, a longer local-story window, or a genuinely required local obligation. Distinct from log_clock_slots (the network''s own structure); a single opportunity may span several network segments. requirement = ''optional'' means "WUWF may cover this; if nothing is placed, the network feed simply continues" — never an error. Editable in place (deactivate via active, not deleted) — WUWF policy, not the network''s immutable structure.';

comment on column public.log_local_opportunities.start_offset_seconds is
  'Nominal/diagram-shown start, seconds from the top of the clock. For timing_mode = float this is a default display position; the actual permitted window is earliest_/latest_start_offset_seconds.';
comment on column public.log_local_opportunities.duration_seconds is
  'Local time available once this opportunity begins — the budget local content placed inside it must fit within.';
comment on column public.log_local_opportunities.requirement is
  'optional: a genuine avail WUWF may or may not use — unused is a normal, resolved state. required: a genuine local obligation — unused is unresolved and must be flagged.';
comment on column public.log_local_opportunities.allow_multiple is
  'Whether more than one local item may occupy this opportunity at once (e.g. an underwriting credit plus a legal ID inside one longer window).';

create index log_local_opportunities_version_idx
  on public.log_local_opportunities (clock_version_id, position);

create trigger set_log_local_opportunities_updated_at
  before update on public.log_local_opportunities
  for each row execute function public.set_updated_at();

-- RLS: producer-gated, same as clocks themselves (docs/log-design.md §6) —
-- unlike clock_slots this is update-able (see file header), so it gets the
-- full producer select/insert/update shape log_schedule already uses,
-- rather than clock_slots' insert-only one.

alter table public.log_local_opportunities enable row level security;

grant select, insert, update on public.log_local_opportunities to authenticated;

create policy log_local_opportunities_select on public.log_local_opportunities
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_local_opportunities_insert on public.log_local_opportunities
  for insert to authenticated
  with check (private.is_log_producer(auth.uid()));

create policy log_local_opportunities_update on public.log_local_opportunities
  for update to authenticated
  using (private.is_log_producer(auth.uid()))
  with check (private.is_log_producer(auth.uid()));

-- Simplify log_clock_slots back to pure network structure ------------------
-- Every one of these dropped columns was about local fillability, now owned
-- by log_local_opportunities instead. permitted_content_types moves there
-- too — what may occupy a *local* window is WUWF's call, not a property NPR
-- publishes. timing_mode/earliest_/latest_start_offset_seconds STAY: a
-- genuinely floating *network* element (Hidden Brain's own described break)
-- is still a fact about the network clock, independent of any WUWF overlay.

alter table public.log_clock_slots
  drop column fill_mode,
  drop column assignment_mode,
  drop column permitted_content_types,
  drop column replaceable,
  drop column shortenable,
  drop column allow_empty,
  drop column allow_multiple,
  drop column lock_on_air;

drop type public.log_slot_fill_mode;
drop type public.log_slot_assignment_mode;

comment on table public.log_clock_slots is
  'A position within a clock version, describing only the network''s own structure: offset, duration, label (docs/log-design.md §4.2). Fillability/local substitution is owned by log_local_opportunities, a separate overlay — see that table''s comment. Insert-only from the application, same reasoning as log_clock_versions.';
