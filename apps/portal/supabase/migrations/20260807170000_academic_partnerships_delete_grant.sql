-- Fixes a real gap in 20260806120000_academic_partnerships_delete.sql: that
-- migration added the ap_submissions_delete RLS policy but never granted
-- delete on public.ap_submissions to authenticated at all. The original
-- schema migration (20260803140000_academic_partnerships.sql) only grants
-- `select, update` on this table — RLS policies only restrict an operation
-- the table-level grant already permits, so a coordinator calling
-- deleteSubmission() against either live project hits a bare Postgres
-- "permission denied for table ap_submissions" (42501), not just an
-- RLS-filtered no-op. Caught while reconciling two duplicate PRs adding the
-- same feature: the PR branch's own copy of the delete migration included
-- this grant, which is what surfaced the discrepancy against what had
-- already been applied.

grant delete on public.ap_submissions to authenticated;
