-- One narrow, read-only cross-tool boundary function so Log's own
-- rundown-submission screen can ask "does this rundown have an unresolved
-- underwriting exception" without needing Underwriting & Traffic access —
-- most hosts running Log's console don't have a tool_access grant on
-- Underwriting at all, and uw_exceptions' own RLS
-- (private.has_underwriting_access) correctly keeps it that way. Mirrors
-- the existing precedent of security-definer functions crossing this same
-- boundary in the other direction (log_place_underwriting_credit,
-- log_list_placeable_rundown_items, owned by Underwriting's own migration
-- so an Underwriting-only caller can read/write Log's tables) — this is
-- the same shape, reversed: owned by Underwriting since it's the table
-- being read, gated to Log members since that's the caller.
--
-- Backs the rundown submission attestation: a host can't close out a
-- rundown carrying underwriting credits while one of them still has an
-- open, unresolved exception. "Open" excludes anything a coordinator has
-- already waived, accepted an alternate for, or scheduled a makegood
-- against — resolution_status flips to 'resolved' the moment any of those
-- happen.

create or replace function public.uw_has_open_exceptions_for_rundown(p_rundown_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.has_log_access(auth.uid()) and exists (
    select 1
    from public.uw_exceptions ex
    join public.log_broadcast_events lbe on lbe.id = ex.log_broadcast_event_id
    join public.log_rundown_items lri on lri.id = lbe.rundown_item_id
    join public.log_rundown_breaks lrb on lrb.id = lri.break_id
    where lrb.rundown_id = p_rundown_id
      and ex.resolution_status = 'open'
  );
$$;

revoke all on function public.uw_has_open_exceptions_for_rundown(uuid) from public, anon;
grant execute on function public.uw_has_open_exceptions_for_rundown(uuid) to authenticated;
