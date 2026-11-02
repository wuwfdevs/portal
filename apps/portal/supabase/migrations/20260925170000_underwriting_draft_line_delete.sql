-- Underwriting & Traffic: a draft revision's schedule lines can be removed.
--
-- uw_contract_schedule_lines has had select/insert/update grants only since
-- 20260808200000_underwriting_redesign.sql — a line under the current
-- revision is never deleted, only cancelled from a date, so its placements
-- and history stand. A *draft* revision (20260925150000) is different:
-- nothing has scheduled from it, so a line entered by mistake has no
-- history to keep and should simply go away. This policy admits exactly
-- that case; a line under a current, superseded or cancelled revision still
-- cannot be deleted through the API.

grant delete on public.uw_contract_schedule_lines to authenticated;

create policy uw_contract_schedule_lines_delete_draft on public.uw_contract_schedule_lines
  for delete to authenticated
  using (
    (select private.has_underwriting_access((select auth.uid())))
    and exists (
      select 1 from public.uw_contract_revisions r
      where r.id = uw_contract_schedule_lines.revision_id and r.status = 'draft'
    )
  );
