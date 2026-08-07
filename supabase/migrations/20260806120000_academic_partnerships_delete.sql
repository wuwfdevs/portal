-- Coordinator-only delete for ap_submissions.
--
-- Every other submission write (stage, owner, assessment, next action,
-- disposition) is available to any tool member per
-- assertAcademicPartnershipsAccess() — deleting an inquiry outright is
-- rarer and, unlike a disposition, not reversible, so it uses the same
-- coordinator elevation Settings' write actions do
-- (assertAcademicPartnershipsCoordinator() / is_academic_partnerships_coordinator()).
--
-- ap_submission_events carries `on delete cascade` back to ap_submissions
-- (see 20260803140000_academic_partnerships.sql), so a submission's own
-- activity log disappears with it — the deletion itself is recorded in
-- audit_events instead (src/app/(portal)/academic-partnerships/actions.ts's
-- deleteSubmission, action "ap.submission.deleted"), which is the only
-- durable trace once RLS and the cascade have both finished.

create policy ap_submissions_delete on public.ap_submissions
  for delete to authenticated
  using (private.is_academic_partnerships_coordinator(auth.uid()));
