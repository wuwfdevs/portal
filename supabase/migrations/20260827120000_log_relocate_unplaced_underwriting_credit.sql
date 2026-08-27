-- Fixes a real, fully deterministic bug found by reproducing a user report
-- directly against production: relocating an underwriting credit on an
-- *imported* rundown failed every single time, regardless of source break,
-- destination break, or whether the rundown was live — always with
-- 'unknown_placement'.
--
-- log_relocate_underwriting_credit() (20260809130000_underwriting_credit_
-- relocation.sql, last replaced by 20260809170000_log_local_opportunities_
-- slot_based.sql) unconditionally required a uw_scheduled_placements row for
-- the credit being moved. That's wrong for a program-log-imported credit:
-- per 20260821180000_log_program_log_import.sql's own design (see its
-- uw_copy.underwriter_id comment and log_delete_unplaced_credit_item()), an
-- imported credit is written straight onto log_rundown_items with
-- item_kind = 'underwriting_credit' and NO uw_scheduled_placements row at
-- all — "no uw_scheduled_placements row until traffic adopts and attributes
-- it." That's a real, valid, and — per a real production rundown checked
-- while diagnosing this — common state for an imported rundown's credits,
-- not an error condition. The relocation function never accounted for it,
-- so every relocation attempt on any such credit hit the same hard stop
-- before ever looking at the destination break at all.
--
-- Fixed by making the uw_scheduled_placements lookup optional: a credit with
-- no placement just skips the placement-row update (there's nothing to
-- update) and returns a null placement_id, mirroring how
-- log_delete_unplaced_credit_item() already treats "no placement" as the
-- normal case for an imported credit rather than a fault. A placement-backed
-- credit's own uw_scheduled_placements row is still kept in sync exactly as
-- before.

create or replace function public.log_relocate_underwriting_credit(
  p_item_id uuid,
  p_destination_break_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.log_rundown_items;
  v_source_break public.log_rundown_breaks;
  v_placement public.uw_scheduled_placements;
  v_dest_break public.log_rundown_breaks;
  v_dest_rundown public.log_rundowns;
  v_program public.log_programs;
  v_occupied integer;
  v_next_position integer;
  v_open_exception_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.has_log_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_item from public.log_rundown_items where id = p_item_id;
  if not found or v_item.item_kind <> 'underwriting_credit' then
    return jsonb_build_object('error', 'not_a_credit');
  end if;

  if exists (
    select 1 from public.log_broadcast_events
    where rundown_item_id = p_item_id and outcome = 'aired_as_scheduled'
  ) then
    return jsonb_build_object('error', 'already_aired');
  end if;

  select * into v_source_break from public.log_rundown_breaks where id = v_item.break_id;

  -- A program-log-imported credit legitimately has no uw_scheduled_placements
  -- row at all (see this migration's header) — that's a normal state, not an
  -- error, so v_placement is simply left null (found stays false) rather
  -- than short-circuiting the whole function the way it used to.
  select * into v_placement from public.uw_scheduled_placements
    where log_rundown_item_id = p_item_id and status <> 'superseded'
    order by created_at desc limit 1;

  select * into v_dest_break from public.log_rundown_breaks where id = p_destination_break_id;
  if not found then
    return jsonb_build_object('error', 'unknown_break');
  end if;
  if v_dest_break.id = v_source_break.id then
    return jsonb_build_object('error', 'same_break');
  end if;
  if v_dest_break.rundown_id <> v_source_break.rundown_id then
    return jsonb_build_object('error', 'different_rundown');
  end if;
  if not ('underwriting_credit' = any(v_dest_break.permitted_content_types)) then
    return jsonb_build_object('error', 'break_not_eligible');
  end if;

  -- Excludes the item itself: it's still sitting in the source break at
  -- this point (nothing has moved yet), so it must not count against its
  -- own destination's duration math.
  select coalesce(sum(planned_duration_seconds), 0)
    into v_occupied
    from public.log_rundown_items where break_id = p_destination_break_id and id <> p_item_id;
  if v_item.planned_duration_seconds > (v_dest_break.available_duration_seconds - v_occupied) then
    return jsonb_build_object('error', 'too_long');
  end if;

  select * into v_dest_rundown from public.log_rundowns where id = v_dest_break.rundown_id;
  select * into v_program from public.log_programs where id = v_dest_rundown.program_id;

  select coalesce(max(position), 0) + 1 into v_next_position
    from public.log_rundown_items where break_id = p_destination_break_id and id <> p_item_id;

  update public.log_rundown_items
  set break_id = p_destination_break_id,
      position = v_next_position
  where id = p_item_id;

  if v_placement.id is not null then
    update public.uw_scheduled_placements
    set scheduled_at = v_dest_break.scheduled_at,
        break_label = v_dest_break.label,
        program_id = v_dest_rundown.program_id,
        program_name = v_program.name
    where id = v_placement.id;
  end if;

  select ex.id into v_open_exception_id
  from public.log_broadcast_events lbe
  join public.uw_exceptions ex on ex.log_broadcast_event_id = lbe.id
  where lbe.rundown_item_id = p_item_id
    and ex.resolution_status = 'open'
  order by lbe.recorded_at desc
  limit 1;

  if v_open_exception_id is not null then
    update public.uw_exceptions
    set resolution_status = 'resolved',
        resolution_action = 'reassign',
        resolution_notes = coalesce(resolution_notes || E'\n\n', '')
          || 'Automatically resolved: the host moved this credit to another break in the same broadcast.',
        resolved_by = auth.uid(),
        resolved_at = now()
    where id = v_open_exception_id;
  end if;

  return jsonb_build_object('ok', true, 'item_id', p_item_id, 'placement_id', v_placement.id);
end;
$$;

comment on function public.log_relocate_underwriting_credit(uuid, uuid) is
  'Moves an already-placed or placement-less (program-log-imported) underwriting credit to a different open, eligible break in the same rundown, in place (same log_rundown_items row, same id) — never a delete/reinsert, so it can never cascade away a prior log_broadcast_events row. No allow_multiple gate — a break holds as many items as fit in its remaining duration. A missing uw_scheduled_placements row (an imported credit — see log_delete_unplaced_credit_item()) is a normal state, not an error: the placement update is skipped and placement_id comes back null. Gated by has_log_access, not has_underwriting_access — narrower than log_place_underwriting_credit() (no new copy, no override, same rundown only), which is what makes the lighter gate appropriate. Auto-resolves an open exception against a prior miss, if any (resolution_action = reassign).';

revoke all on function public.log_relocate_underwriting_credit(uuid, uuid) from public, anon;
grant execute on function public.log_relocate_underwriting_credit(uuid, uuid) to authenticated;
