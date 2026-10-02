-- Underwriting's auto-fill and rotation need to know which breaks fall in
-- automated hours (only copy with a DAD cut can fill those — the guard is
-- uw_guard_placement_dad_cut(), 20261002130000), and an underwriting-only
-- session can't read Log's tables. Automated hours are a station schedule,
-- not sensitive, so this is a plain additive select policy — the same
-- shape as tools_select_proposed_for_roadmap — rather than a boundary
-- function. Writes stay producer-only.

create policy log_automated_weekly_select_underwriting on public.log_automated_weekly
  for select to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));

create policy log_on_air_changes_select_underwriting on public.log_on_air_changes
  for select to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));
