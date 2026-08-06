-- Academic Partnerships: lets a coordinator permanently delete an inquiry.
--
-- ap_submissions had no delete grant or policy at all until now (see the
-- Phase 1 migration's comment: "No insert grant... staff never create a
-- submission by hand" — delete was simply never considered). Unlike the
-- disposition columns (Deferred/Declined/Withdrawn/Archived), which move a
-- submission out of the active pipeline while keeping its record, this is a
-- real, irreversible delete — for spam/test submissions and mistaken
-- entries that shouldn't be kept around at all. Scoped to coordinators
-- (mirrors ap_settings_update / ap_email_templates_update), not every
-- member, since it can't be undone. ap_submission_events cascades via its
-- existing `on delete cascade` foreign key; audit_events' target_id is a
-- bare text column with no foreign key, so ap.submission.deleted can still
-- be recorded after the row is gone.

grant delete on public.ap_submissions to authenticated;

create policy ap_submissions_delete on public.ap_submissions
  for delete to authenticated
  using (private.is_academic_partnerships_coordinator(auth.uid()));
