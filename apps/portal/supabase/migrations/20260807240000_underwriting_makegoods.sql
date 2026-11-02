-- Underwriting & Traffic: Slice 4 (scheduling and confirming makegoods) —
-- Workflow F from docs/underwriting-design.md. "A makegood created from an
-- exception is itself a scheduled placement once a slot is chosen, going
-- through the same eligibility check as any other placement, then tracked
-- through to its own broadcast event."
--
-- One new table, uw_makegoods (§5), reusing every mechanism Slice 2 already
-- built rather than adding new ones: scheduling a makegood's slot is the
-- same log_place_underwriting_credit()/log_list_placeable_rundown_items()
-- pair the contract page's own "Place a credit" form already calls
-- (lib/underwriting/placement.ts), and cancelling one that already has a
-- slot reuses log_clear_underwriting_credit() too. Nothing here writes into
-- log_rundown_items or log_broadcast_events directly, and
-- log_broadcast_events' insert policy stays scoped to has_log_access only
-- (hosts) — the outcome vocabulary's makegood_scheduled/makegood_aired/
-- waived values (see 20260807160000_log_broadcast_events.sql's header) stay
-- unpopulated; nothing in docs/underwriting-design.md's milestone 1 asks
-- this tool to write into Log's append-only log, only read from it.
--
-- §5's literal column list makes uw_makegoods.status a three-value enum
-- (scheduled | aired | cancelled) with scheduled_placement_id nullable
-- "until scheduled" — read together, a makegood record can exist before a
-- slot is chosen (status stays 'scheduled', scheduled_placement_id null,
-- meaning "committed to make this good, not yet placed") and after
-- (scheduled_placement_id set once a slot is picked, status still
-- 'scheduled' until the placement's own broadcast event confirms it aired).
-- The "awaiting a slot" vs "slot chosen, awaiting air" distinction is
-- derived from scheduled_placement_id at read time
-- (lib/underwriting/makegoods.ts), not a fourth stored status — same
-- "derived, not stored" discipline as uw_placement_obligations.status's own
-- header and every computeProjectStatus()-shaped helper elsewhere in this
-- portal.
--
-- Ordinary member-level RLS throughout (has_underwriting_access, no manager
-- gate) — docs/underwriting-design.md §3F lists this workflow under
-- "traffic staff," not the four privileged actions §6 reserves to a
-- manager.
--
-- uw_update_makegood_from_broadcast_event(): an AFTER INSERT trigger on
-- log_broadcast_events, security definer for the same reason Slice 3's
-- uw_flag_exception_from_broadcast_event() is — the host recording an
-- outcome has no grant on uw_makegoods at all. Flips a scheduled makegood
-- to 'aired' the moment its placement's rundown item is marked aired as
-- scheduled. If the makegood's own airing is itself missed or moved, this
-- trigger leaves the makegood's status alone (still 'scheduled') and
-- Slice 3's own uw_flag_exception_from_broadcast_event() already raises a
-- fresh uw_exceptions row against it, since that trigger doesn't
-- distinguish an original placement's rundown item from a makegood's —
-- the recursive resolution path Workflow F's "tracked through to its own
-- broadcast event" implies, with no new code needed for it.

create type public.uw_makegood_status as enum ('scheduled', 'aired', 'cancelled');

create table public.uw_makegoods (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.uw_exceptions (id) on delete cascade,
  obligation_id uuid not null references public.uw_placement_obligations (id) on delete cascade,
  scheduled_placement_id uuid references public.uw_scheduled_placements (id) on delete set null,
  status public.uw_makegood_status not null default 'scheduled',
  scheduled_for timestamptz,
  aired_log_broadcast_event_id uuid references public.log_broadcast_events (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.uw_makegoods is
  'A scheduled or aired alternate airing resolving an exception (docs/underwriting-design.md §2, §16). scheduled_placement_id/scheduled_for stay null until a slot is picked (Workflow F); aired_log_broadcast_event_id is set by uw_update_makegood_from_broadcast_event() once that placement''s own broadcast event confirms it aired as scheduled.';

create index uw_makegoods_exception_idx on public.uw_makegoods (exception_id);
create index uw_makegoods_obligation_idx on public.uw_makegoods (obligation_id);

-- At most one active (non-cancelled) makegood may claim a given placement —
-- a placement row maps to at most one live makegood.
create unique index uw_makegoods_active_placement_idx
  on public.uw_makegoods (scheduled_placement_id)
  where scheduled_placement_id is not null and status <> 'cancelled';

-- RLS ---------------------------------------------------------------------
-- Member-level, no manager gate — see file header.

alter table public.uw_makegoods enable row level security;

grant select, insert, update on public.uw_makegoods to authenticated;

create policy uw_makegoods_select on public.uw_makegoods
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_makegoods_insert on public.uw_makegoods
  for insert to authenticated
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_makegoods_update on public.uw_makegoods
  for update to authenticated
  using (private.has_underwriting_access(auth.uid()))
  with check (private.has_underwriting_access(auth.uid()));

-- uw_update_makegood_from_broadcast_event ----------------------------------

create function public.uw_update_makegood_from_broadcast_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placement_id uuid;
begin
  if new.outcome <> 'aired_as_scheduled' then
    return new;
  end if;

  select sp.id into v_placement_id
  from public.uw_scheduled_placements sp
  where sp.log_rundown_item_id = new.rundown_item_id
    and sp.status <> 'superseded'
  order by sp.created_at desc
  limit 1;

  if v_placement_id is null then
    return new;
  end if;

  update public.uw_makegoods
  set status = 'aired',
      aired_log_broadcast_event_id = new.id
  where scheduled_placement_id = v_placement_id
    and status = 'scheduled';

  return new;
end;
$$;

comment on function public.uw_update_makegood_from_broadcast_event() is
  'Flips a scheduled makegood to aired the moment its own placement''s rundown item is confirmed aired as scheduled — the other half of Workflow F''s "tracked through to its own broadcast event," mirroring uw_flag_exception_from_broadcast_event()''s trigger shape.';

revoke execute on function public.uw_update_makegood_from_broadcast_event() from public, anon, authenticated;

create trigger uw_makegoods_update_from_broadcast_event
  after insert on public.log_broadcast_events
  for each row execute function public.uw_update_makegood_from_broadcast_event();
