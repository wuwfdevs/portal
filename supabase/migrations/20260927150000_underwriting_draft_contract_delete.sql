-- Underwriting & Traffic: a draft contract can be deleted outright.
--
-- Nothing had ever admitted a delete on uw_contracts — no policy, no
-- action — so a contract created by mistake (or read from the wrong
-- document, now that a contract can be created from its agreement,
-- docs/underwriting-traffic-redesign.md §12) could only be terminated,
-- which is a status for a contract with history behind it. A draft has
-- none: log_place_underwriting_credit() refuses a contract that is not
-- active, so a draft has no placements, no broadcast events, no
-- exceptions and no makegoods, and every row that hangs off it — its
-- revisions, schedule lines and their demand buckets, flights, copy links
-- (the copy itself stays) — cascades from the contract already. This is
-- the same rule 20260927130000_underwriting_draft_contract_line_delete.sql
-- applies to a draft's lines, at the level of the contract.
--
-- Active, expired and terminated contracts stay undeletable through the
-- API: their placements and broadcast events are Log's as-aired record and
-- Underwriting's affidavit evidence, and a contract that ran is terminated
-- (audited), never removed. The Server Action checks the status too — a
-- delete RLS refuses matches zero rows with no error, which would
-- otherwise read as a success.

drop policy if exists uw_contracts_delete_draft on public.uw_contracts;

create policy uw_contracts_delete_draft on public.uw_contracts
  for delete to authenticated
  using (
    (select private.has_underwriting_access((select auth.uid())))
    and status = 'draft'
  );
