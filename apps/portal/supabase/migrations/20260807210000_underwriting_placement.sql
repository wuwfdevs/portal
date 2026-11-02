-- Underwriting & Traffic: Slice 2 (manual credit placement into Log's
-- rundown) — Workflow C from docs/underwriting-design.md. This is the
-- two-way Log boundary §6 describes, built in one migration since it's one
-- relationship with two directions, not two unrelated changes:
--
--   1. Write into Log: log_rundown_items gains item_kind/underwriting_copy_id
--      (same shape sw_source_excerpts already uses for "exactly one of
--      several possible references" — see the strategy doc §2). The actual
--      write goes through log_place_underwriting_credit(), a security
--      definer function, not a bare insert/update through RLS: a plain
--      policy naming underwriting members would let them write any
--      log_rundown_items row, not just an underwriting-credit one in a slot
--      that actually permits it, so the guard lives in the function body.
--      log_list_placeable_rundown_items() is the read-side counterpart the
--      design doc doesn't name explicitly but Workflow C's own UI needs: an
--      underwriting-only caller has no RLS access to log_rundowns/
--      log_rundown_items/log_clock_slots/log_programs at all, so finding an
--      open, eligible slot to place into has to go through a security
--      definer function too, the same reasoning as the write side.
--      log_clear_underwriting_credit() is the undo, symmetric to the two
--      above — a placement mechanism with no way back isn't complete.
--   2. The reverse read Log needs from this tool: a narrow additive select
--      policy on uw_placement_obligations for Log members, scoped to
--      obligations with an active scheduled placement. Not consumed by any
--      Log-side code yet (the console's existing move-destination check in
--      lib/log/mid-broadcast.ts is already content-type-based and works
--      for underwriting-credit items without it) — added now anyway because
--      the design doc treats both directions of this boundary as one
--      relationship this tool's own migration builds, and a future
--      obligation-aware move check (daypart/spacing) will need it.
--
-- This slice also defines private.is_underwriting_manager() for the first
-- time — Slice 1's migration deliberately left it undefined ("there is
-- nothing in this slice for it to gate"). This is the slice that adds the
-- first action that needs it: overriding expired/unapproved copy into a
-- placement, checked inside log_place_underwriting_credit() itself.
--
-- What's NOT in this slice: the post-broadcast exception queue's read of
-- log_broadcast_events (Workflow E — nothing here reads broadcast events),
-- makegoods, and affidavits. Each is its own later slice per
-- docs/underwriting-design.md §7.

-- item_kind/underwriting_copy_id on log_rundown_items --------------------------
-- Plain text + check constraint, matching sw_source_excerpts.locator_kind's
-- own precedent for an existing table gaining a discriminated shape via
-- ALTER TABLE rather than a new enum type.

alter table public.log_rundown_items
  add column item_kind text not null default 'content'
    check (item_kind in ('content', 'underwriting_credit')),
  add column underwriting_copy_id uuid references public.uw_copy (id) on delete restrict;

alter table public.log_rundown_items
  add constraint log_rundown_items_item_kind_shape_check check (
    (item_kind = 'underwriting_credit' or underwriting_copy_id is null)
    and (item_kind = 'content' or content_item_id is null)
  );

comment on column public.log_rundown_items.item_kind is
  'content | underwriting_credit (docs/broadcast-operations-strategy.md §2). Only ever set to underwriting_credit by log_place_underwriting_credit() — never a bare update through RLS.';
comment on column public.log_rundown_items.underwriting_copy_id is
  'Set only when item_kind = underwriting_credit. References uw_copy, owned by Underwriting & Traffic.';

-- Placement status + uw_scheduled_placements ------------------------------------

create type public.uw_placement_status as enum ('scheduled', 'locked', 'conflict', 'superseded');

create table public.uw_scheduled_placements (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.uw_placement_obligations (id) on delete cascade,
  copy_id uuid not null references public.uw_copy (id) on delete restrict,
  log_rundown_item_id uuid not null references public.log_rundown_items (id) on delete cascade,
  placement_date date not null,
  -- scheduled_at/program_name/clock_slot_label are denormalized snapshots,
  -- captured by log_place_underwriting_credit() (which, being security
  -- definer, can read Log's tables) precisely so this tool's own screens
  -- never need a live cross-tool read into log_rundowns/log_programs just
  -- to render a placement list — the same reasoning Audience Listening's
  -- answers snapshot their question rather than joining live.
  scheduled_at timestamptz not null,
  program_id uuid not null references public.log_programs (id) on delete restrict,
  program_name text not null,
  clock_slot_label text,
  status public.uw_placement_status not null default 'scheduled',
  override_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.uw_scheduled_placements is
  'One obligation slated into one Log rundown item on one date (docs/underwriting-design.md §2). Only ever written by log_place_underwriting_credit()/log_clear_underwriting_credit() — no insert/update grant to authenticated, see RLS below.';

create index uw_scheduled_placements_obligation_idx on public.uw_scheduled_placements (obligation_id);
create index uw_scheduled_placements_copy_idx on public.uw_scheduled_placements (copy_id);

-- A rundown item holds at most one *active* placement — superseded rows
-- (cleared placements) don't count, so the same opening can be placed into
-- again after being cleared.
create unique index uw_scheduled_placements_active_item_idx
  on public.uw_scheduled_placements (log_rundown_item_id)
  where status <> 'superseded';

-- Authorization: is_underwriting_manager -----------------------------------------
-- First defined here — see file header.

create function private.is_underwriting_manager(uid uuid)
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
      and t.key = 'underwriting'
      and ta.revoked_at is null
      and ta.tool_role = 'manager'
      and p.account_status = 'active'
  ) or private.is_administrator(uid);
$$;

revoke execute on function private.is_underwriting_manager(uuid) from public, anon;
grant execute on function private.is_underwriting_manager(uuid) to authenticated;

-- RLS: uw_scheduled_placements ----------------------------------------------------
-- Select-only for authenticated — every write happens inside the security
-- definer functions below, which bypass RLS entirely as their owner. No
-- insert/update grant, matching al_answers/al_submissions' precedent for a
-- table only ever written by a security definer function.

alter table public.uw_scheduled_placements enable row level security;

grant select on public.uw_scheduled_placements to authenticated;

create policy uw_scheduled_placements_select on public.uw_scheduled_placements
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

-- RLS: the reverse read Log needs from this tool -------------------------------
-- Additive to Slice 1's uw_placement_obligations_select (has_underwriting_
-- access) — Postgres OR's same-command policies together, so a Log member
-- with no Underwriting grant can still see an obligation once it has an
-- active placement, and nothing else.

create policy uw_placement_obligations_select_for_log on public.uw_placement_obligations
  for select to authenticated
  using (
    private.has_log_access(auth.uid())
    and exists (
      select 1 from public.uw_scheduled_placements sp
      where sp.obligation_id = uw_placement_obligations.id
        and sp.status <> 'superseded'
    )
  );

-- log_list_placeable_rundown_items: the read side of the boundary -------------
-- An underwriting-only caller has no RLS access to log_rundowns/
-- log_rundown_items/log_clock_slots/log_programs, so finding an obligation's
-- eligible open slots has to go through a security definer read, same
-- reasoning as the write side below.

create function public.log_list_placeable_rundown_items(p_obligation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obligation public.uw_placement_obligations;
  v_items jsonb;
begin
  if auth.uid() is null or not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_obligation from public.uw_placement_obligations where id = p_obligation_id;
  if not found then
    return jsonb_build_object('error', 'unknown_obligation');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'rundown_item_id', lri.id,
    'rundown_id', lr.id,
    'air_date', lr.air_date,
    'scheduled_at', lri.scheduled_at,
    'clock_slot_label', lcs.label,
    'slot_duration_seconds', lcs.duration_seconds,
    'program_name', lp.name
  ) order by lri.scheduled_at), '[]'::jsonb)
  into v_items
  from public.log_rundown_items lri
  join public.log_rundowns lr on lr.id = lri.rundown_id
  join public.log_clock_slots lcs on lcs.id = lri.clock_slot_id
  join public.log_programs lp on lp.id = lr.program_id
  where lri.item_kind = 'content'
    and lri.content_item_id is null
    and 'underwriting_credit' = any(lcs.permitted_content_types)
    and lr.air_date >= v_obligation.start_date
    and (v_obligation.end_date is null or lr.air_date <= v_obligation.end_date)
    and (
      array_length(v_obligation.eligible_program_ids, 1) is null
      or lr.program_id = any(v_obligation.eligible_program_ids)
    );

  return jsonb_build_object('ok', true, 'items', v_items);
end;
$$;

comment on function public.log_list_placeable_rundown_items(uuid) is
  'Every currently-open Log rundown item eligible for this obligation (permits underwriting_credit, within the obligation''s program/date eligibility). Security definer: the caller may have no Log access at all.';

revoke execute on function public.log_list_placeable_rundown_items(uuid) from public, anon;
grant execute on function public.log_list_placeable_rundown_items(uuid) to authenticated;

-- log_place_underwriting_credit: the write side of the boundary -----------------

create function public.log_place_underwriting_credit(
  p_rundown_item_id uuid,
  p_obligation_id uuid,
  p_copy_id uuid,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.log_rundown_items;
  v_rundown public.log_rundowns;
  v_slot public.log_clock_slots;
  v_program public.log_programs;
  v_obligation public.uw_placement_obligations;
  v_contract public.uw_contracts;
  v_copy public.uw_copy;
  v_linked boolean;
  v_needs_override boolean;
  v_placement_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_item from public.log_rundown_items where id = p_rundown_item_id;
  if not found then
    return jsonb_build_object('error', 'unknown_item');
  end if;
  if v_item.content_item_id is not null or v_item.underwriting_copy_id is not null then
    return jsonb_build_object('error', 'slot_occupied');
  end if;

  select * into v_rundown from public.log_rundowns where id = v_item.rundown_id;
  select * into v_slot from public.log_clock_slots where id = v_item.clock_slot_id;
  select * into v_program from public.log_programs where id = v_rundown.program_id;

  if v_slot.fill_mode not in ('optional', 'host_fillable') then
    return jsonb_build_object('error', 'slot_not_fillable');
  end if;
  if not ('underwriting_credit' = any(v_slot.permitted_content_types)) then
    return jsonb_build_object('error', 'slot_not_eligible');
  end if;

  select * into v_obligation from public.uw_placement_obligations where id = p_obligation_id;
  if not found then
    return jsonb_build_object('error', 'unknown_obligation');
  end if;

  select * into v_contract from public.uw_contracts where id = v_obligation.contract_id;
  if v_contract.status <> 'active' then
    return jsonb_build_object('error', 'contract_not_active');
  end if;

  if array_length(v_obligation.eligible_program_ids, 1) is not null
     and not (v_rundown.program_id = any(v_obligation.eligible_program_ids))
  then
    return jsonb_build_object('error', 'program_not_eligible');
  end if;

  select * into v_copy from public.uw_copy where id = p_copy_id;
  if not found then
    return jsonb_build_object('error', 'unknown_copy');
  end if;

  select exists(
    select 1 from public.uw_contract_copy
    where contract_id = v_obligation.contract_id and copy_id = p_copy_id
  ) into v_linked;
  if not v_linked then
    return jsonb_build_object('error', 'copy_not_linked');
  end if;

  if v_copy.duration_seconds is null then
    return jsonb_build_object('error', 'copy_duration_unknown');
  end if;
  if v_copy.duration_seconds > v_slot.duration_seconds then
    return jsonb_build_object('error', 'too_long');
  end if;

  -- §6.3's "explicit override": expired or unapproved copy needs a reason
  -- and a manager, checked here rather than displayed as a warning after
  -- the fact (§3C: "checked at the moment of placement").
  v_needs_override := v_copy.approval_status <> 'approved'
    or v_copy.effective_from > v_rundown.air_date
    or (v_copy.effective_to is not null and v_copy.effective_to < v_rundown.air_date);

  if v_needs_override then
    if p_override_reason is null or trim(p_override_reason) = '' then
      return jsonb_build_object('error', 'copy_needs_override');
    end if;
    if not private.is_underwriting_manager(auth.uid()) then
      return jsonb_build_object('error', 'override_requires_manager');
    end if;
  end if;

  insert into public.uw_scheduled_placements (
    obligation_id, copy_id, log_rundown_item_id, placement_date, scheduled_at,
    program_id, program_name, clock_slot_label, status, override_reason, created_by
  ) values (
    p_obligation_id, p_copy_id, p_rundown_item_id, v_rundown.air_date, v_item.scheduled_at,
    v_rundown.program_id, v_program.name, v_slot.label,
    'scheduled', case when v_needs_override then p_override_reason else null end, auth.uid()
  )
  returning id into v_placement_id;

  update public.log_rundown_items
  set item_kind = 'underwriting_credit',
      underwriting_copy_id = p_copy_id,
      content_item_id = null,
      planned_duration_seconds = v_copy.duration_seconds,
      placement_status = 'replaceable'
  where id = p_rundown_item_id;

  return jsonb_build_object('ok', true, 'placement_id', v_placement_id);
end;
$$;

comment on function public.log_place_underwriting_credit(uuid, uuid, uuid, text) is
  'The only path that ever sets log_rundown_items.item_kind = underwriting_credit (docs/underwriting-design.md §6). Security definer so the guard (a permitted, open slot; an active contract; linked, eligible copy; an explicit manager-checked override otherwise) lives in one place instead of a blanket RLS policy.';

revoke execute on function public.log_place_underwriting_credit(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.log_place_underwriting_credit(uuid, uuid, uuid, text) to authenticated;

-- log_clear_underwriting_credit: the undo ---------------------------------------

create function public.log_clear_underwriting_credit(p_placement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placement public.uw_scheduled_placements;
  v_slot_duration integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_placement from public.uw_scheduled_placements where id = p_placement_id;
  if not found then
    return jsonb_build_object('error', 'unknown_placement');
  end if;
  if v_placement.status = 'superseded' then
    return jsonb_build_object('error', 'already_cleared');
  end if;

  select lcs.duration_seconds into v_slot_duration
  from public.log_rundown_items lri
  join public.log_clock_slots lcs on lcs.id = lri.clock_slot_id
  where lri.id = v_placement.log_rundown_item_id;

  update public.log_rundown_items
  set item_kind = 'content',
      underwriting_copy_id = null,
      content_item_id = null,
      planned_duration_seconds = coalesce(v_slot_duration, planned_duration_seconds),
      placement_status = 'editable'
  where id = v_placement.log_rundown_item_id;

  update public.uw_scheduled_placements
  set status = 'superseded'
  where id = p_placement_id;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.log_clear_underwriting_credit(uuid) is
  'Undoes a placement: reopens the Log rundown item and marks the placement superseded (never deleted, matching log_broadcast_events'' append-only precedent for as-planned history).';

revoke execute on function public.log_clear_underwriting_credit(uuid) from public, anon;
grant execute on function public.log_clear_underwriting_credit(uuid) to authenticated;
