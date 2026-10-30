-- Underwriting & Traffic: Slice 3 (the post-broadcast exception queue) —
-- Workflow E from docs/underwriting-design.md. Workflow D (pre-broadcast
-- conflict review) is a computed dashboard over Slice 1/2's existing tables
-- (lib/underwriting/conflicts.ts) and needs no schema of its own.
--
-- Three pieces, one migration since they're one relationship:
--
--   1. uw_exceptions (§5) — the real row staff triage over time (compliance
--      judgment, resolution action, notes), not a derived view. It has no
--      insert grant to authenticated: the only way a row is ever created is
--      the trigger below, mirroring uw_scheduled_placements' own
--      select-only-then-write-via-function precedent from Slice 2.
--   2. uw_flag_exception_from_broadcast_event() — an AFTER INSERT trigger on
--      Log's log_broadcast_events, not a job this repo has no queue to run.
--      Every underwriting-kind broadcast event whose outcome isn't
--      'aired_as_scheduled' gets an open exception automatically, the
--      moment a host records it — "produce an exception list for traffic
--      review" (§6.4) applied for real, not polled for. Security definer:
--      the host who inserted the broadcast event has no grants on
--      uw_exceptions at all.
--   3. The read side of the same boundary Slice 2 named but didn't need
--      yet: log_broadcast_events_select_for_underwriting, a plain additive
--      select policy scoped to underwriting-kind rundown items, so the
--      exception queue can show the full broadcast event alongside
--      uw_exceptions' own snapshot of it.
--
-- Also fixes a real gap from Slices 1-2: docs/underwriting-design.md's
-- Architecture section requires logAuditEvent() for four privileged
-- actions (waiving an exception, certifying an affidavit, overriding
-- copy into a placement, terminating a contract), but no
-- audit_events_insert_underwriting policy existed yet, so every one of
-- those calls has been silently failing RLS and hitting logAuditEvent's own
-- console.error since Slice 1 — the same class of gap
-- audit_events_insert_academic_partnerships closed for that tool. Adding
-- the policy here (this slice's own waive action needs it) and wiring up
-- the two already-shipped actions (override, terminate) that were missing
-- the call entirely.

create type public.uw_compliance_judgment as enum ('compliant', 'noncompliant', 'pending');
create type public.uw_resolution_status as enum ('open', 'resolved');
create type public.uw_resolution_action as enum (
  'accept_alternate',
  'schedule_makegood',
  'reassign',
  'waive',
  'clarification_requested',
  'corrected',
  'closed'
);

create table public.uw_exceptions (
  id uuid primary key default gen_random_uuid(),
  log_broadcast_event_id uuid not null references public.log_broadcast_events (id) on delete cascade,
  obligation_id uuid not null references public.uw_placement_obligations (id) on delete cascade,
  original_scheduled_at timestamptz not null,
  -- Snapshots of the broadcast event at the moment the exception was raised
  -- (docs/underwriting-design.md §5) — plain text, not a shared enum type,
  -- since these are a copy for display, not a live reference.
  host_action text not null,
  host_reason text,
  requirement_note text,
  compliance_judgment public.uw_compliance_judgment not null default 'pending',
  recommended_action text,
  resolution_status public.uw_resolution_status not null default 'open',
  resolution_action public.uw_resolution_action,
  resolution_notes text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint uw_exceptions_broadcast_event_unique unique (log_broadcast_event_id)
);

comment on table public.uw_exceptions is
  'An unresolved discrepancy between what a contract required and what actually aired (docs/underwriting-design.md §2, §16) — created only by uw_flag_exception_from_broadcast_event(), never a bare insert.';

create index uw_exceptions_obligation_idx on public.uw_exceptions (obligation_id);
create index uw_exceptions_resolution_status_idx on public.uw_exceptions (resolution_status);

-- RLS: uw_exceptions -------------------------------------------------------------
-- Select + update only — no insert grant, matching uw_scheduled_placements'
-- precedent. Every member can triage (accept an alternate, schedule a
-- makegood, reassign, request clarification, correct the record, close),
-- but not waive — the guard trigger below enforces that specific case.

alter table public.uw_exceptions enable row level security;

grant select, update on public.uw_exceptions to authenticated;

create policy uw_exceptions_select on public.uw_exceptions
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_exceptions_update on public.uw_exceptions
  for update to authenticated
  using (private.has_underwriting_access(auth.uid()))
  with check (private.has_underwriting_access(auth.uid()));

-- Guard: only a manager can set resolution_action = 'waive' -----------------------
-- Same shape as rd_guard_post_curation() (20260801121000_roadmap.sql): RLS
-- is row-level and the update policy above already admits any member, so
-- the one column value §6 reserves to management is enforced here instead
-- of by a second, narrower RLS policy Postgres would have to somehow
-- distinguish by value.

create function public.uw_guard_exception_resolution()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.resolution_action = 'waive'
     and old.resolution_action is distinct from 'waive'
     and not private.is_underwriting_manager(auth.uid())
  then
    raise exception 'Only an underwriting manager can waive an exception.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.uw_guard_exception_resolution() from public, anon, authenticated;

create trigger uw_exceptions_guard_resolution
  before update on public.uw_exceptions
  for each row execute function public.uw_guard_exception_resolution();

-- Auto-creation: uw_flag_exception_from_broadcast_event ---------------------------

create function public.uw_flag_exception_from_broadcast_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.log_rundown_items;
  v_placement public.uw_scheduled_placements;
begin
  if new.outcome = 'aired_as_scheduled' then
    return new;
  end if;

  select * into v_item from public.log_rundown_items where id = new.rundown_item_id;
  if not found or v_item.item_kind <> 'underwriting_credit' then
    return new;
  end if;

  select * into v_placement
  from public.uw_scheduled_placements
  where log_rundown_item_id = new.rundown_item_id
    and status <> 'superseded'
  order by created_at desc
  limit 1;
  if not found then
    return new;
  end if;

  insert into public.uw_exceptions (
    log_broadcast_event_id, obligation_id, original_scheduled_at, host_action, host_reason
  ) values (
    new.id, v_placement.obligation_id, v_item.scheduled_at, new.outcome::text, new.reason::text
  )
  on conflict (log_broadcast_event_id) do nothing;

  return new;
end;
$$;

comment on function public.uw_flag_exception_from_broadcast_event() is
  'Replaces a job queue this repo doesn''t have: every underwriting-kind broadcast event whose outcome is not aired_as_scheduled gets an open uw_exceptions row the moment a host records it.';

revoke execute on function public.uw_flag_exception_from_broadcast_event() from public, anon, authenticated;

create trigger uw_flag_exception_after_broadcast_event
  after insert on public.log_broadcast_events
  for each row execute function public.uw_flag_exception_from_broadcast_event();

-- RLS: the read side of the exception-queue boundary -------------------------------
-- docs/underwriting-design.md §6: "a plain additive select policy scoped to
-- that join condition plus underwriting membership — read-only, no write
-- access needed in this direction, since hosts are the only ones who write
-- broadcast events."

create policy log_broadcast_events_select_for_underwriting on public.log_broadcast_events
  for select to authenticated
  using (
    private.has_underwriting_access(auth.uid())
    and exists (
      select 1 from public.log_rundown_items lri
      where lri.id = log_broadcast_events.rundown_item_id
        and lri.item_kind = 'underwriting_credit'
    )
  );

-- audit_events: without this, every logAuditEvent() call from this tool would
-- fail RLS and be swallowed by that helper's console.error — same shape as
-- audit_events_insert_academic_partnerships. See file header: this closes a
-- gap that's existed since Slice 1.

create policy audit_events_insert_underwriting on public.audit_events
  for insert to authenticated
  with check (private.has_underwriting_access(auth.uid()) and actor_id = auth.uid());
