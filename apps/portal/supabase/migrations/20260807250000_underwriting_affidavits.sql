-- Underwriting & Traffic: Slice 5 (generating affidavits) — Workflow G from
-- docs/underwriting-design.md, the last of milestone 1's seven workflows.
-- "Select a contract and a campaign period; the system assembles verified
-- air dates/times, actual durations, approved alternates and makegoods, and
-- relevant exceptions from the underlying broadcast events, and produces a
-- document a manager certifies."
--
-- Two pieces:
--
--   1. uw_affidavits/uw_affidavit_line_items (§5), exactly the columns
--      listed there. uw_affidavit_line_items has no separate id — a
--      composite (affidavit_id, log_broadcast_event_id) primary key, same
--      shape as uw_contract_copy's own plain join-table precedent, since a
--      broadcast event has at most one placement and belongs to at most one
--      affidavit's evidence set by construction.
--   2. A broadened read policy on log_broadcast_events. Slice 3's own
--      log_broadcast_events_select_for_underwriting is scoped to broadcast
--      events an uw_exceptions row already references — correct for the
--      exception queue, but affidavit generation (Workflow G) needs every
--      broadcast event behind a contract's placements in a period,
--      including the compliant majority that never became an exception at
--      all. This is additive, not a replacement, and — like Slice 3's own
--      exception_read_fix — keyed off a permanent reference
--      (uw_scheduled_placements rows are never deleted or repointed, only
--      marked superseded) rather than log_rundown_items.item_kind's
--      current, reassignable state, so it doesn't reintroduce that bug.
--
-- Generating an affidavit (assembling uw_affidavit_line_items from a
-- contract's placements in a period) is ordinary application-layer
-- orchestration over existing reads — see
-- lib/underwriting/queries.ts's findAffidavitEvidence() — not a security
-- definer function: unlike Slice 2's placement boundary, nothing here
-- writes into a table this tool doesn't already own, so there's no
-- cross-tool guard to centralize.
--
-- Certifying an affidavit (status -> certified) is one of
-- docs/underwriting-design.md §6's four privileged, manager-only actions —
-- enforced by uw_guard_affidavit_certification(), a before-update trigger
-- in the exact shape of Slice 3's uw_guard_exception_resolution(): RLS
-- admits any member's update (editing certification_text before
-- certifying, correcting a draft's period), and only the trigger stops a
-- non-manager from being the one who flips status to certified.

create type public.uw_affidavit_status as enum ('draft', 'certified');

create table public.uw_affidavits (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.uw_contracts (id) on delete cascade,
  campaign_period_start date not null,
  campaign_period_end date not null,
  generated_at timestamptz not null default now(),
  generated_by uuid references public.profiles (id) on delete set null,
  certifying_staff_id uuid references public.profiles (id) on delete set null,
  certification_text text,
  report_identifier text not null,
  status public.uw_affidavit_status not null default 'draft',
  constraint uw_affidavits_period_range_check check (campaign_period_end >= campaign_period_start)
);

comment on table public.uw_affidavits is
  'A proof-of-performance document for a contract''s campaign period (docs/underwriting-design.md §2, §17) — milestone 1''s version is a structured on-screen record styled for browser print, not a generated PDF (see design doc §6). certifying_staff_id/certification_text stay null until a manager certifies it.';

create index uw_affidavits_contract_idx on public.uw_affidavits (contract_id);

create table public.uw_affidavit_line_items (
  affidavit_id uuid not null references public.uw_affidavits (id) on delete cascade,
  log_broadcast_event_id uuid not null references public.log_broadcast_events (id) on delete restrict,
  scheduled_placement_id uuid not null references public.uw_scheduled_placements (id) on delete restrict,
  primary key (affidavit_id, log_broadcast_event_id)
);

comment on table public.uw_affidavit_line_items is
  'The durable link between a certified affidavit and the specific airings that support it (docs/underwriting-design.md §17) — enables both audit and regeneration without re-deriving which broadcast events counted.';

create index uw_affidavit_line_items_placement_idx on public.uw_affidavit_line_items (scheduled_placement_id);

-- RLS: uw_affidavits / uw_affidavit_line_items ------------------------------
-- Member-level, no manager gate on the table itself — generating an
-- affidavit and editing its draft fields are ordinary traffic-staff work
-- per §3G ("traffic staff, certified by manager"); the guard trigger below
-- is what actually reserves certification to a manager.

alter table public.uw_affidavits enable row level security;
alter table public.uw_affidavit_line_items enable row level security;

grant select, insert, update on public.uw_affidavits to authenticated;
grant select, insert on public.uw_affidavit_line_items to authenticated;

create policy uw_affidavits_select on public.uw_affidavits
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_affidavits_insert on public.uw_affidavits
  for insert to authenticated
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_affidavits_update on public.uw_affidavits
  for update to authenticated
  using (private.has_underwriting_access(auth.uid()))
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_affidavit_line_items_select on public.uw_affidavit_line_items
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_affidavit_line_items_insert on public.uw_affidavit_line_items
  for insert to authenticated
  with check (private.has_underwriting_access(auth.uid()));

-- Guard: only a manager can certify -----------------------------------------

create function public.uw_guard_affidavit_certification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'certified'
     and old.status is distinct from 'certified'
     and not private.is_underwriting_manager(auth.uid())
  then
    raise exception 'Only an underwriting manager can certify an affidavit.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.uw_guard_affidavit_certification() from public, anon, authenticated;

create trigger uw_affidavits_guard_certification
  before update on public.uw_affidavits
  for each row execute function public.uw_guard_affidavit_certification();

-- RLS: broadened read of log_broadcast_events for affidavit generation ------
-- See file header. Additive to Slice 3's exception-scoped policy, not a
-- replacement of it.

create policy log_broadcast_events_select_for_underwriting_placements on public.log_broadcast_events
  for select to authenticated
  using (
    private.has_underwriting_access(auth.uid())
    and exists (
      select 1 from public.uw_scheduled_placements sp
      where sp.log_rundown_item_id = log_broadcast_events.rundown_item_id
    )
  );
