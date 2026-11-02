-- Copy rotation as a maintained property of a contract
-- (docs/underwriting-traffic-redesign.md §13, 2026-09-27).
--
-- A contract's messages rotate as one cycle in broadcast order across every
-- schedule line, and the sequence is kept current after any write that
-- changes it: lib/underwriting/rotation.ts decides which future placement
-- should carry which message, and this migration adds the two boundary
-- functions that walk needs, in the exact shape of the existing Log
-- crossings this tool owns (log_place_underwriting_credit,
-- log_clear_underwriting_credit, log_list_placeable_rundown_breaks):
--
--   1. log_list_underwriting_credit_rooms(p_contract_id) — the read: every
--      non-superseded placement of the contract with the room its break
--      offers it, its rundown's status and its break's start (for the
--      freeze rule, applied in TypeScript by lib/underwriting/freeze.ts),
--      and whether it has a broadcast event. An underwriting-only session
--      has no RLS access to Log's rundown tables, so this is security
--      definer like the listing function.
--   2. log_reassign_underwriting_credit_copy(p_placement_id, p_copy_id) —
--      the write: swaps which message one future placement carries, with a
--      named refusal for every guard. Never touches an aired placement, a
--      frozen rundown or a started break (uw_automation_block), a placement
--      made with a manager override (its override_reason is the pin), or a
--      message that isn't linked, approved, in date, flight-appropriate and
--      short enough for the room. Nothing about the placement's slot,
--      bucket or line changes; only underwriting_copy_id on the Log item
--      (with planned_duration_seconds) and copy_id on the placement.
--
-- Rotation itself is never enforced here: log_place_underwriting_credit()
-- keeps accepting whatever copy a caller names, and a staffer's hand-picked
-- approved message may later be re-sequenced by the walk. Only an override
-- pins.

-- ============================================================================
-- 1. The read: each placement's room
-- ============================================================================

create or replace function public.log_list_underwriting_credit_rooms(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rooms jsonb;
begin
  if auth.uid() is null or not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'placement_id', sp.id,
    -- The break's remaining room plus this item's own current length: what
    -- the slot could hold if its message were swapped.
    'room_seconds', b.available_duration_seconds - coalesce(occupied.total, 0)
                    + coalesce(i.planned_duration_seconds, 0),
    'rundown_status', lr.status,
    'break_scheduled_at', b.scheduled_at,
    'has_outcome', exists (
      select 1 from public.log_broadcast_events e where e.rundown_item_id = i.id
    )
  ) order by sp.scheduled_at), '[]'::jsonb)
  into v_rooms
  from public.uw_scheduled_placements sp
  join public.uw_contract_schedule_lines sl on sl.id = sp.schedule_line_id
  join public.log_rundown_items i on i.id = sp.log_rundown_item_id
  join public.log_rundown_breaks b on b.id = i.break_id
  join public.log_rundowns lr on lr.id = b.rundown_id
  left join lateral (
    select sum(x.planned_duration_seconds) as total
    from public.log_rundown_items x
    where x.break_id = b.id
  ) occupied on true
  where sl.contract_id = p_contract_id
    and sp.status <> 'superseded';

  return jsonb_build_object('ok', true, 'rooms', v_rooms);
end;
$$;

revoke execute on function public.log_list_underwriting_credit_rooms(uuid) from public, anon;
grant execute on function public.log_list_underwriting_credit_rooms(uuid) to authenticated;

comment on function public.log_list_underwriting_credit_rooms(uuid) is
  'The rotation walk''s read (lib/underwriting/rotation-rebalance.ts): every non-superseded placement of a contract with the room its break could give it (remaining plus its own current length), its rundown''s status and break start for the freeze rule, and whether a broadcast event exists. Security definer: an underwriting-only caller has no RLS access to Log''s rundown tables.';

-- ============================================================================
-- 2. The write: swap one future placement's message
-- ============================================================================

create or replace function public.log_reassign_underwriting_credit_copy(
  p_placement_id uuid,
  p_copy_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placement public.uw_scheduled_placements;
  v_line public.uw_contract_schedule_lines;
  v_contract public.uw_contracts;
  v_item public.log_rundown_items;
  v_break public.log_rundown_breaks;
  v_rundown public.log_rundowns;
  v_copy public.uw_copy;
  v_link public.uw_contract_copy;
  v_block text;
  v_occupied integer;
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
  if v_placement.override_reason is not null then
    return jsonb_build_object('error', 'placement_pinned');
  end if;
  if v_placement.copy_id = p_copy_id then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  -- Same lock the placement guard takes, so two walks over one contract
  -- serialize per line rather than interleave.
  select * into v_line from public.uw_contract_schedule_lines
    where id = v_placement.schedule_line_id for update;
  if not found then
    return jsonb_build_object('error', 'unknown_schedule_line');
  end if;
  select * into v_contract from public.uw_contracts where id = v_line.contract_id;
  if v_contract.status <> 'active' then
    return jsonb_build_object('error', 'contract_not_active');
  end if;

  if v_placement.log_rundown_item_id is null then
    return jsonb_build_object('error', 'unknown_item');
  end if;
  select * into v_item from public.log_rundown_items where id = v_placement.log_rundown_item_id;
  if not found then
    return jsonb_build_object('error', 'unknown_item');
  end if;
  if exists (select 1 from public.log_broadcast_events e where e.rundown_item_id = v_item.id) then
    return jsonb_build_object('error', 'already_aired');
  end if;
  select * into v_break from public.log_rundown_breaks where id = v_item.break_id;
  select * into v_rundown from public.log_rundowns where id = v_break.rundown_id;
  v_block := public.uw_automation_block(v_break, v_rundown);
  if v_block is not null then
    return jsonb_build_object('error', v_block);
  end if;

  select * into v_copy from public.uw_copy where id = p_copy_id;
  if not found then
    return jsonb_build_object('error', 'unknown_copy');
  end if;
  select * into v_link from public.uw_contract_copy
    where contract_id = v_line.contract_id and copy_id = p_copy_id;
  if not found then
    return jsonb_build_object('error', 'copy_not_linked');
  end if;
  if v_link.flight_id is not null and v_link.flight_id is distinct from v_line.flight_id then
    return jsonb_build_object('error', 'copy_wrong_flight');
  end if;
  if v_copy.approval_status <> 'approved'
    or v_copy.effective_from > v_rundown.air_date
    or (v_copy.effective_to is not null and v_copy.effective_to < v_rundown.air_date) then
    return jsonb_build_object('error', 'copy_not_approved');
  end if;
  if v_copy.duration_seconds is null then
    return jsonb_build_object('error', 'copy_duration_unknown');
  end if;
  select coalesce(sum(planned_duration_seconds), 0) into v_occupied
    from public.log_rundown_items where break_id = v_break.id and id <> v_item.id;
  if v_copy.duration_seconds > (v_break.available_duration_seconds - v_occupied) then
    return jsonb_build_object('error', 'too_long');
  end if;

  update public.log_rundown_items
  set underwriting_copy_id = p_copy_id, planned_duration_seconds = v_copy.duration_seconds
  where id = v_item.id;

  update public.uw_scheduled_placements
  set copy_id = p_copy_id
  where id = p_placement_id;

  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;

revoke execute on function public.log_reassign_underwriting_credit_copy(uuid, uuid) from public, anon;
grant execute on function public.log_reassign_underwriting_credit_copy(uuid, uuid) to authenticated;

comment on function public.log_reassign_underwriting_credit_copy(uuid, uuid) is
  'The rotation walk''s write (lib/underwriting/rotation-rebalance.ts): swaps which linked message one future placement carries. Refuses a superseded placement, one made with a manager override (placement_pinned), one with a broadcast event (already_aired), a frozen rundown or started break (uw_automation_block), an inactive contract, and a message not linked to the contract, scoped to another flight, not approved or in date for the air date (copy_not_approved), without a duration, or too long for the break with this item''s own length excluded. Updates the Log item''s underwriting_copy_id and planned_duration_seconds and the placement''s copy_id, nothing else.';

-- ============================================================================
-- 3. A linked message's flight scope can actually be changed
-- ============================================================================
-- uw_contract_copy shipped with select/insert/delete policies only, so
-- setCopyFlight() (contract-actions.ts, "Set flight" on the Copy tab) has
-- silently matched zero rows since 2026-09-25 — correct Postgres behavior
-- for an update with no applicable policy, not an error. Found by the
-- rolled-back scenario this migration was verified with, where the same
-- update didn't take either. Member-level, like the other three.

create policy uw_contract_copy_update on public.uw_contract_copy
  for update
  using ((select private.has_underwriting_access((select auth.uid()))))
  with check ((select private.has_underwriting_access((select auth.uid()))));
