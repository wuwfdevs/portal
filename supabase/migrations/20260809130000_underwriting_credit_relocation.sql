-- Lets a Log host relocate an already-placed underwriting credit to a
-- different open break in the same rundown themselves — before its break's
-- time passes, or after (recovering from a "missed" mark) — without needing
-- an Underwriting & Traffic tool_access grant. Only if a credit is *still*
-- missed and unmoved when the broadcast wraps does it escalate to
-- Underwriting's own makegood workflow, unchanged by this migration. See
-- CLAUDE.md's Log/Underwriting note dated 2026-08-09 for the product
-- reasoning.
--
-- Two things this migration does:
--
-- 1. Fixes a real, latent bug found while designing the above, unrelated to
--    #2's own mechanism but found in the same investigation:
--    log_clear_underwriting_credit() (20260808200000_underwriting_redesign.sql)
--    deletes the log_rundown_items row and then tries to mark the
--    corresponding uw_scheduled_placements row 'superseded' — but
--    log_rundown_item_id's FK was `on delete cascade`, so the DELETE also
--    cascaded away the placement row itself before the UPDATE could touch
--    it. Every "clear a credit" call has actually been hard-deleting the
--    placement, not soft-deleting it, contradicting the documented design
--    ("uw_scheduled_placements rows are never deleted or repointed, only
--    marked superseded" — see the Slice 5 CLAUDE.md note) and leaving the
--    'superseded' status effectively dead code. Fixed by making the column
--    nullable with `on delete set null`, so a cleared placement's row
--    survives (with log_rundown_item_id null) as uw_affidavit_line_items'
--    own `on delete restrict` against this table already assumed it would.
--
-- 2. Adds log_relocate_underwriting_credit() — a new, narrower boundary
--    function alongside log_place_underwriting_credit()/
--    log_clear_underwriting_credit(), gated by private.has_log_access()
--    rather than private.has_underwriting_access(). It only ever moves an
--    *already-placed* credit between breaks in the *same* rundown — no new
--    copy selection, no override, no ability to place a credit that was
--    never placed. That narrower shape is what makes has_log_access an
--    appropriate gate here: a host can only rearrange something Underwriting
--    staff already approved and scheduled, never originate a new
--    underwriting placement.
--
--    Deliberately does NOT reuse log_place_underwriting_credit's own
--    delete-then-reinsert shape (a fresh log_rundown_items row + a fresh
--    uw_scheduled_placements row, marking the old placement superseded).
--    That shape is right for a genuinely new occurrence, but wrong here:
--    log_broadcast_events.rundown_item_id is *also* `on delete cascade` —
--    deleting the old item would have cascaded away the very "missed"
--    broadcast event this whole feature exists to let a host recover from,
--    silently erasing the fact that the credit didn't air on time. Instead,
--    this function moves the *same* log_rundown_items row (updates break_id
--    only — its id, and therefore every log_broadcast_events row already
--    pointing at it, never changes) and updates the *same*
--    uw_scheduled_placements row's denormalized scheduled_at/break_label/
--    program fields to match. Nothing about "did this air on time" is lost
--    by this: the original miss stays exactly as recorded in
--    log_broadcast_events (append-only, untouched), and the promised time
--    itself is independently preserved in uw_exceptions.original_scheduled_at
--    (captured once, when the exception was first raised) — the placement
--    row's own scheduled_at is a "where does this currently run" pointer,
--    not the historical record.
--
--    A credit that already aired (a log_broadcast_events row with
--    outcome = 'aired_as_scheduled') can never be relocated — that's
--    settled history. A credit only marked 'missed' can still be relocated.
--    If an open uw_exceptions row already exists against the missed
--    outcome, a successful relocation auto-resolves it with
--    resolution_action = 'reassign' — an enum value the exception screen
--    has offered since 20260807220000_underwriting_exceptions.sql but that
--    nothing has ever actually set; this is its first real use. Traffic
--    staff still see it in the exception queue's history, just already
--    resolved, and don't have to separately notice the host fixed it live.

-- ============================================================================
-- 1. Fix: preserve cleared placements instead of cascading them away
-- ============================================================================

alter table public.uw_scheduled_placements
  drop constraint uw_scheduled_placements_log_rundown_item_id_fkey;

alter table public.uw_scheduled_placements
  alter column log_rundown_item_id drop not null;

alter table public.uw_scheduled_placements
  add constraint uw_scheduled_placements_log_rundown_item_id_fkey
  foreign key (log_rundown_item_id) references public.log_rundown_items (id) on delete set null;

comment on column public.uw_scheduled_placements.log_rundown_item_id is
  'The Log rundown item this occurrence currently lives in — null once the item is deleted by log_clear_underwriting_credit(), at which point this row''s own status should already be ''superseded''. Nullable specifically so a cleared row survives its item''s deletion instead of cascading away with it — see this migration''s header. log_relocate_underwriting_credit() (also this migration) never deletes the item at all, so it never needs this path.';

-- ============================================================================
-- 2. log_relocate_underwriting_credit — the new, narrower boundary function
-- ============================================================================

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
  v_item_count integer;
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

  select * into v_placement from public.uw_scheduled_placements
    where log_rundown_item_id = p_item_id and status <> 'superseded'
    order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('error', 'unknown_placement');
  end if;

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
  -- own destination's occupancy/duration math.
  select count(*), coalesce(sum(planned_duration_seconds), 0)
    into v_item_count, v_occupied
    from public.log_rundown_items where break_id = p_destination_break_id and id <> p_item_id;
  if v_item_count > 0 and not v_dest_break.allow_multiple then
    return jsonb_build_object('error', 'break_occupied');
  end if;
  if v_item.planned_duration_seconds > (v_dest_break.available_duration_seconds - v_occupied) then
    return jsonb_build_object('error', 'too_long');
  end if;

  select * into v_dest_rundown from public.log_rundowns where id = v_dest_break.rundown_id;
  select * into v_program from public.log_programs where id = v_dest_rundown.program_id;

  select coalesce(max(position), 0) + 1 into v_next_position
    from public.log_rundown_items where break_id = p_destination_break_id and id <> p_item_id;

  -- Same row, same id — every log_broadcast_events row already recorded
  -- against p_item_id (an earlier "missed", most importantly) stays exactly
  -- where it is. See this migration's header for why this is an update, not
  -- log_place_underwriting_credit's delete-and-reinsert shape.
  update public.log_rundown_items
  set break_id = p_destination_break_id,
      position = v_next_position
  where id = p_item_id;

  update public.uw_scheduled_placements
  set scheduled_at = v_dest_break.scheduled_at,
      break_label = v_dest_break.label,
      program_id = v_dest_rundown.program_id,
      program_name = v_program.name
  where id = v_placement.id;

  -- Auto-resolve an open exception against this credit's earlier miss, if
  -- any — see this migration's header. A credit that was never marked
  -- missed (a proactive pre-air or ahead-of-time relocation) has no
  -- exception to find here, and this is a no-op.
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
  'Moves an already-placed, not-yet-aired underwriting credit to a different open, eligible break in the same rundown, in place (same log_rundown_items row, same id) — never a delete/reinsert, so it can never cascade away a prior log_broadcast_events row. Gated by has_log_access, not has_underwriting_access — narrower than log_place_underwriting_credit() (no new copy, no override, same rundown only), which is what makes the lighter gate appropriate. Auto-resolves an open exception against a prior miss, if any (resolution_action = reassign).';

revoke all on function public.log_relocate_underwriting_credit(uuid, uuid) from public, anon;
grant execute on function public.log_relocate_underwriting_credit(uuid, uuid) to authenticated;
