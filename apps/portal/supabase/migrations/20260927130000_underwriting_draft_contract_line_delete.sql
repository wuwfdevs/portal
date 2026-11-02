-- Underwriting & Traffic: a draft *contract's* schedule lines can be removed too.
--
-- 20260925170000_underwriting_draft_line_delete.sql admitted deleting a line
-- under a draft *revision*, on the rule that nothing has scheduled from it,
-- so a line entered by mistake has no history to keep. The same rule holds
-- for every line on a draft *contract*: log_place_underwriting_credit()
-- refuses a contract that is not active, so nothing can have scheduled
-- from one. The setup wizard creates a contract's first revision as
-- `current` (the contract itself is the draft), so under the old policy a
-- line mistyped during setup could be neither removed nor — since no edit
-- path existed — corrected; the wizard's Remove button, gated on the
-- revision's status, never rendered there at all. This replaces the policy
-- with the union of the two cases. A line under the current revision of an
-- active, expired or terminated contract still cannot be deleted through
-- the API: it is cancelled from a date, and the correction is a new line.
--
-- Editing a line in place (updateScheduleLine, same date) needs no policy
-- change: uw_contract_schedule_lines has had a member-level update policy
-- since 20260808200000, and uw_demand_buckets member-level delete/insert
-- since 20260925150000. The Server Action applies the same draft-contract-
-- or-draft-revision rule (lib/underwriting/line-mutability.ts) before
-- writing.

drop policy if exists uw_contract_schedule_lines_delete_draft on public.uw_contract_schedule_lines;

create policy uw_contract_schedule_lines_delete_draft on public.uw_contract_schedule_lines
  for delete to authenticated
  using (
    (select private.has_underwriting_access((select auth.uid())))
    and (
      exists (
        select 1 from public.uw_contract_revisions r
        where r.id = uw_contract_schedule_lines.revision_id and r.status = 'draft'
      )
      or exists (
        select 1 from public.uw_contracts c
        where c.id = uw_contract_schedule_lines.contract_id and c.status = 'draft'
      )
    )
  );
