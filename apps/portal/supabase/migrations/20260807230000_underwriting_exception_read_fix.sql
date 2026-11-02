-- Fixes a real bug in 20260807220000_underwriting_exceptions.sql's
-- log_broadcast_events_select_for_underwriting policy, found by a
-- self-review before that migration was ever relied on in production.
--
-- The original policy checked the rundown item's *current*
-- log_rundown_items.item_kind = 'underwriting_credit'. But clearing a
-- placement (log_clear_underwriting_credit(), a completely ordinary
-- reassign-the-obligation action) resets item_kind back to 'content' —
-- which retroactively revoked underwriting staff's read access to a
-- broadcast event an exception had already been raised against, silently
-- blanking the "what happened" section of a still-open uw_exceptions row
-- with no error at all.
--
-- The fix: key the policy off whether a uw_exceptions row actually
-- references the broadcast event, not off the rundown item's present
-- state. uw_exceptions rows are never deleted or reassigned once created
-- (docs/underwriting-design.md §2's "an obligation is not the same as an
-- airing" — the exception is a permanent record of that airing, regardless
-- of what happens to the slot afterward), so this is also simpler: no join
-- through log_rundown_items at all.

drop policy log_broadcast_events_select_for_underwriting on public.log_broadcast_events;

create policy log_broadcast_events_select_for_underwriting on public.log_broadcast_events
  for select to authenticated
  using (
    private.has_underwriting_access(auth.uid())
    and exists (
      select 1 from public.uw_exceptions ue
      where ue.log_broadcast_event_id = log_broadcast_events.id
    )
  );
