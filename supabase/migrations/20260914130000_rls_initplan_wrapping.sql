-- RLS: evaluate auth.uid() and the private.* access predicates once per
-- statement instead of once per row.
--
-- Supabase's performance advisor flagged every one of this repo's 207 public
-- RLS policies (auth_rls_initplan): a policy expression like
--
--     using (private.has_log_access(auth.uid()))
--
-- is re-evaluated for every candidate row, because to the planner it's an
-- ordinary function call that might depend on the row. Confirmed on
-- production before this change: a plain `select id from log_content_items`
-- ran `private.has_log_access(...)` 925 times (once per row) — a
-- security-definer lookup against profiles/tool_access each time — for a
-- result the caller's identity fully determines once. On the free-plan Nano
-- instance that was serving production at the time, that per-row overhead
-- was a real contributor to the API stalls diagnosed on 2026-09-14.
--
-- Wrapping the call in a scalar subquery, `(select private.has_log_access(
-- auth.uid()))`, makes it an InitPlan: evaluated once per statement, its
-- result reused for every row. Same semantics — the predicate depends only on
-- the caller, and every private.* predicate is declared STABLE — just not
-- recomputed per row. Where a predicate genuinely takes a row column
-- (`private.ri_is_own_track(track_id, auth.uid())`, `private.ep_review_
-- editable(review_id, auth.uid())`), only its `auth.uid()` argument is
-- hoisted, since the call itself is legitimately per-row.
--
-- This file was generated from pg_policies on production (the expressions
-- below are Postgres's own deparsed form of each policy, not retyped), then
-- reviewed expression by expression. It covers every flagged public policy
-- plus the 16 storage.objects bucket policies this repo owns, which have the
-- identical shape and simply aren't linted by the advisor. It changes no
-- policy's command, roles, or meaning — only how its expression is evaluated.
--
-- Convention going forward: write new policies in this wrapped form
-- (`(select private.<predicate>(auth.uid()))`, `col = (select auth.uid())`).
-- A later `create policy` written the old way will work, just slower, and
-- will show up again in the advisor.

alter policy "access_requests_select_admin_only" on public.access_requests
  using ((select private.is_administrator(auth.uid())));

alter policy "access_requests_update_admin_only" on public.access_requests
  using ((select private.is_administrator(auth.uid())))
  with check ((select private.is_administrator(auth.uid())));

alter policy "al_answers_select" on public.al_answers
  using ((select private.has_audience_listening_access(auth.uid())));

alter policy "al_answers_update" on public.al_answers
  using ((select private.has_audience_listening_access(auth.uid())))
  with check ((select private.has_audience_listening_access(auth.uid())));

alter policy "al_queries_delete" on public.al_queries
  using (((select private.has_audience_listening_access(auth.uid())) AND (created_by = (select auth.uid()))));

alter policy "al_queries_insert" on public.al_queries
  with check (((select private.has_audience_listening_access(auth.uid())) AND (created_by = (select auth.uid()))));

alter policy "al_queries_select" on public.al_queries
  using ((select private.has_audience_listening_access(auth.uid())));

alter policy "al_queries_update" on public.al_queries
  using ((select private.has_audience_listening_access(auth.uid())))
  with check ((select private.has_audience_listening_access(auth.uid())));

alter policy "al_questions_member_all" on public.al_questions
  using ((select private.has_audience_listening_access(auth.uid())))
  with check ((select private.has_audience_listening_access(auth.uid())));

alter policy "al_submissions_select" on public.al_submissions
  using ((select private.has_audience_listening_access(auth.uid())));

alter policy "al_submissions_update" on public.al_submissions
  using ((select private.has_audience_listening_access(auth.uid())))
  with check ((select private.has_audience_listening_access(auth.uid())));

alter policy "ap_email_templates_select" on public.ap_email_templates
  using ((select private.has_academic_partnerships_access(auth.uid())));

alter policy "ap_email_templates_update" on public.ap_email_templates
  using ((select private.is_academic_partnerships_coordinator(auth.uid())))
  with check ((select private.is_academic_partnerships_coordinator(auth.uid())));

alter policy "ap_settings_select" on public.ap_settings
  using ((select private.has_academic_partnerships_access(auth.uid())));

alter policy "ap_settings_update" on public.ap_settings
  using ((select private.is_academic_partnerships_coordinator(auth.uid())))
  with check ((select private.is_academic_partnerships_coordinator(auth.uid())));

alter policy "ap_submission_events_insert" on public.ap_submission_events
  with check (((select private.has_academic_partnerships_access(auth.uid())) AND (actor_id = (select auth.uid()))));

alter policy "ap_submission_events_select" on public.ap_submission_events
  using ((select private.has_academic_partnerships_access(auth.uid())));

alter policy "ap_submissions_delete" on public.ap_submissions
  using ((select private.is_academic_partnerships_coordinator(auth.uid())));

alter policy "ap_submissions_select" on public.ap_submissions
  using ((select private.has_academic_partnerships_access(auth.uid())));

alter policy "ap_submissions_update" on public.ap_submissions
  using ((select private.has_academic_partnerships_access(auth.uid())))
  with check ((select private.has_academic_partnerships_access(auth.uid())));

alter policy "audit_events_insert_academic_partnerships" on public.audit_events
  with check (((select private.has_academic_partnerships_access(auth.uid())) AND (actor_id = (select auth.uid()))));

alter policy "audit_events_insert_admin_only" on public.audit_events
  with check (((select private.is_administrator(auth.uid())) AND (actor_id = (select auth.uid()))));

alter policy "audit_events_insert_audience_listening" on public.audit_events
  with check (((select private.has_audience_listening_access(auth.uid())) AND (actor_id = (select auth.uid()))));

alter policy "audit_events_insert_editorial_editor" on public.audit_events
  with check (((select private.ep_is_editor(auth.uid())) AND (actor_id = (select auth.uid()))));

alter policy "audit_events_insert_editorial_inquiry" on public.audit_events
  with check (((select private.has_editorial_inquiry_access(auth.uid())) AND (actor_id = (select auth.uid()))));

alter policy "audit_events_insert_log" on public.audit_events
  with check (((select private.has_log_access(auth.uid())) AND (actor_id = (select auth.uid()))));

alter policy "audit_events_insert_mcp" on public.audit_events
  with check (((select private.is_active_profile(auth.uid())) AND (actor_id = (select auth.uid())) AND (action ~~ 'mcp.%'::text)));

alter policy "audit_events_insert_roadmap_curator" on public.audit_events
  with check (((select private.is_roadmap_curator(auth.uid())) AND (actor_id = (select auth.uid()))));

alter policy "audit_events_insert_underwriting" on public.audit_events
  with check (((select private.has_underwriting_access(auth.uid())) AND (actor_id = (select auth.uid()))));

alter policy "audit_events_select_admin_only" on public.audit_events
  using ((select private.is_administrator(auth.uid())));

alter policy "ei_chat_messages_insert" on public.ei_chat_messages
  with check (((select private.has_editorial_inquiry_access(auth.uid())) AND ((role = 'assistant'::text) OR (created_by = (select auth.uid())))));

alter policy "ei_chat_messages_select" on public.ei_chat_messages
  using ((select private.has_editorial_inquiry_access(auth.uid())));

alter policy "ei_chat_messages_update" on public.ei_chat_messages
  using ((select private.has_editorial_inquiry_access(auth.uid())))
  with check ((select private.has_editorial_inquiry_access(auth.uid())));

alter policy "ei_context_notes_insert" on public.ei_context_notes
  with check (((select private.has_editorial_inquiry_access(auth.uid())) AND (created_by = (select auth.uid()))));

alter policy "ei_context_notes_select" on public.ei_context_notes
  using ((select private.has_editorial_inquiry_access(auth.uid())));

alter policy "ei_inquiries_select" on public.ei_inquiries
  using ((select private.has_editorial_inquiry_access(auth.uid())));

alter policy "ei_inquiries_update" on public.ei_inquiries
  using ((select private.has_editorial_inquiry_access(auth.uid())))
  with check ((select private.has_editorial_inquiry_access(auth.uid())));

alter policy "ei_questions_insert" on public.ei_questions
  with check ((select private.has_editorial_inquiry_access(auth.uid())));

alter policy "ei_questions_select" on public.ei_questions
  using ((select private.has_editorial_inquiry_access(auth.uid())));

alter policy "ei_questions_update" on public.ei_questions
  using ((select private.has_editorial_inquiry_access(auth.uid())))
  with check ((select private.has_editorial_inquiry_access(auth.uid())));

alter policy "ep_criteria_select_for_editorial_inquiry" on public.ep_criteria
  using ((select private.has_editorial_inquiry_access(auth.uid())));

alter policy "ep_criteria_select_members" on public.ep_criteria
  using ((select private.ep_has_access(auth.uid())));

alter policy "ep_criteria_write_editors" on public.ep_criteria
  using ((select private.ep_is_editor(auth.uid())))
  with check ((select private.ep_is_editor(auth.uid())));

alter policy "ep_form_fields_select_members" on public.ep_form_fields
  using ((select private.ep_has_access(auth.uid())));

alter policy "ep_form_fields_write_editors" on public.ep_form_fields
  using ((select private.ep_is_editor(auth.uid())))
  with check ((select private.ep_is_editor(auth.uid())));

alter policy "ep_meeting_pitches_select_members" on public.ep_meeting_pitches
  using ((select private.ep_has_access(auth.uid())));

alter policy "ep_meeting_pitches_write_editors" on public.ep_meeting_pitches
  using ((select private.ep_is_editor(auth.uid())))
  with check ((select private.ep_is_editor(auth.uid())));

alter policy "ep_meetings_select_members" on public.ep_meetings
  using ((select private.ep_has_access(auth.uid())));

alter policy "ep_meetings_write_editors" on public.ep_meetings
  using ((select private.ep_is_editor(auth.uid())))
  with check ((select private.ep_is_editor(auth.uid())));

alter policy "ep_pillars_select_for_editorial_inquiry" on public.ep_pillars
  using ((select private.has_editorial_inquiry_access(auth.uid())));

alter policy "ep_pillars_select_members" on public.ep_pillars
  using ((select private.ep_has_access(auth.uid())));

alter policy "ep_pillars_write_editors" on public.ep_pillars
  using ((select private.ep_is_editor(auth.uid())))
  with check ((select private.ep_is_editor(auth.uid())));

alter policy "ep_pitch_values_select_members" on public.ep_pitch_values
  using ((select private.ep_has_access(auth.uid())));

alter policy "ep_pitch_values_write_submitter_or_editor" on public.ep_pitch_values
  using (((select private.ep_is_editor(auth.uid())) OR (EXISTS ( SELECT 1
   FROM ep_pitches p
  WHERE ((p.id = ep_pitch_values.pitch_id) AND (p.submitted_by = (select auth.uid())) AND (p.status = 'open'::text) AND (NOT private.ep_pitch_under_review(p.id)))))))
  with check (((select private.ep_is_editor(auth.uid())) OR (EXISTS ( SELECT 1
   FROM ep_pitches p
  WHERE ((p.id = ep_pitch_values.pitch_id) AND (p.submitted_by = (select auth.uid())) AND (p.status = 'open'::text) AND (NOT private.ep_pitch_under_review(p.id)))))));

alter policy "ep_pitches_insert_members" on public.ep_pitches
  with check (((select private.ep_has_access(auth.uid())) AND (submitted_by = (select auth.uid()))));

alter policy "ep_pitches_select_members" on public.ep_pitches
  using ((select private.ep_has_access(auth.uid())));

alter policy "ep_pitches_update_submitter_or_editor" on public.ep_pitches
  using (((select private.ep_is_editor(auth.uid())) OR ((submitted_by = (select auth.uid())) AND (select private.ep_has_access(auth.uid())) AND (status = 'open'::text) AND (NOT private.ep_pitch_under_review(id)))))
  with check (((select private.ep_is_editor(auth.uid())) OR ((submitted_by = (select auth.uid())) AND (status = 'open'::text))));

alter policy "ep_review_scores_select_visible" on public.ep_review_scores
  using (((select private.ep_has_access(auth.uid())) AND private.ep_review_visible(review_id, (select auth.uid()))));

alter policy "ep_review_scores_write_own_while_open" on public.ep_review_scores
  using (private.ep_review_editable(review_id, (select auth.uid())))
  with check (private.ep_review_editable(review_id, (select auth.uid())));

alter policy "ep_reviews_delete_own_while_open" on public.ep_reviews
  using (((reviewer_id = (select auth.uid())) AND (private.ep_meeting_status_of(meeting_pitch_id) = 'open'::text)));

alter policy "ep_reviews_insert_own_while_open" on public.ep_reviews
  with check (((reviewer_id = (select auth.uid())) AND (select private.ep_is_reviewer(auth.uid())) AND (private.ep_meeting_status_of(meeting_pitch_id) = 'open'::text)));

alter policy "ep_reviews_select_own_or_revealed" on public.ep_reviews
  using (((select private.ep_has_access(auth.uid())) AND ((reviewer_id = (select auth.uid())) OR (private.ep_meeting_status_of(meeting_pitch_id) = ANY (ARRAY['agenda'::text, 'concluded'::text])))));

alter policy "ep_reviews_update_own_while_open" on public.ep_reviews
  using (((reviewer_id = (select auth.uid())) AND (select private.ep_is_reviewer(auth.uid())) AND (private.ep_meeting_status_of(meeting_pitch_id) = 'open'::text)))
  with check (((reviewer_id = (select auth.uid())) AND (private.ep_meeting_status_of(meeting_pitch_id) = 'open'::text)));

alter policy "ep_rubric_profiles_select_for_editorial_inquiry" on public.ep_rubric_profiles
  using ((select private.has_editorial_inquiry_access(auth.uid())));

alter policy "ep_rubric_profiles_select_members" on public.ep_rubric_profiles
  using ((select private.ep_has_access(auth.uid())));

alter policy "ep_rubric_profiles_write_editors" on public.ep_rubric_profiles
  using ((select private.ep_is_editor(auth.uid())))
  with check ((select private.ep_is_editor(auth.uid())));

alter policy "ep_settings_select_members" on public.ep_settings
  using ((select private.ep_has_access(auth.uid())));

alter policy "ep_settings_update_editors" on public.ep_settings
  using ((select private.ep_is_editor(auth.uid())))
  with check ((select private.ep_is_editor(auth.uid())));

alter policy "ep_story_plan_milestones_select_members" on public.ep_story_plan_milestones
  using ((select private.ep_has_access(auth.uid())));

alter policy "ep_story_plan_milestones_write" on public.ep_story_plan_milestones
  using (((select private.ep_is_editor(auth.uid())) OR (EXISTS ( SELECT 1
   FROM ep_story_plans sp
  WHERE ((sp.id = ep_story_plan_milestones.story_plan_id) AND (sp.reporter_id = (select auth.uid())) AND (sp.status <> 'approved'::text))))))
  with check (((select private.ep_is_editor(auth.uid())) OR (EXISTS ( SELECT 1
   FROM ep_story_plans sp
  WHERE ((sp.id = ep_story_plan_milestones.story_plan_id) AND (sp.reporter_id = (select auth.uid())) AND (sp.status <> 'approved'::text))))));

alter policy "ep_story_plans_insert" on public.ep_story_plans
  with check (((select private.ep_is_editor(auth.uid())) OR ((reporter_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM ep_pitches p
  WHERE ((p.id = ep_story_plans.pitch_id) AND (p.assigned_to = (select auth.uid())) AND (p.status = 'assigned'::text)))))));

alter policy "ep_story_plans_select_members" on public.ep_story_plans
  using ((select private.ep_has_access(auth.uid())));

alter policy "ep_story_plans_update" on public.ep_story_plans
  using (((select private.ep_is_editor(auth.uid())) OR ((reporter_id = (select auth.uid())) AND (status <> 'approved'::text))))
  with check (((select private.ep_is_editor(auth.uid())) OR ((reporter_id = (select auth.uid())) AND (status <> 'approved'::text))));

alter policy "log_broadcast_events_insert" on public.log_broadcast_events
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_broadcast_events_select" on public.log_broadcast_events
  using ((select private.has_log_access(auth.uid())));

alter policy "log_broadcast_events_select_for_underwriting" on public.log_broadcast_events
  using (((select private.has_underwriting_access(auth.uid())) AND (EXISTS ( SELECT 1
   FROM uw_exceptions ue
  WHERE (ue.log_broadcast_event_id = log_broadcast_events.id)))));

alter policy "log_broadcast_events_select_for_underwriting_placements" on public.log_broadcast_events
  using (((select private.has_underwriting_access(auth.uid())) AND (EXISTS ( SELECT 1
   FROM uw_scheduled_placements sp
  WHERE (sp.log_rundown_item_id = log_broadcast_events.rundown_item_id)))));

alter policy "log_clock_slots_insert" on public.log_clock_slots
  with check ((select private.is_log_producer(auth.uid())));

alter policy "log_clock_slots_select" on public.log_clock_slots
  using ((select private.has_log_access(auth.uid())));

alter policy "log_clock_templates_insert" on public.log_clock_templates
  with check ((select private.is_log_producer(auth.uid())));

alter policy "log_clock_templates_select" on public.log_clock_templates
  using ((select private.has_log_access(auth.uid())));

alter policy "log_clock_templates_update" on public.log_clock_templates
  using ((select private.is_log_producer(auth.uid())))
  with check ((select private.is_log_producer(auth.uid())));

alter policy "log_clock_versions_insert" on public.log_clock_versions
  with check ((select private.is_log_producer(auth.uid())));

alter policy "log_clock_versions_select" on public.log_clock_versions
  using ((select private.has_log_access(auth.uid())));

alter policy "log_content_components_insert" on public.log_content_components
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_content_components_select" on public.log_content_components
  using ((select private.has_log_access(auth.uid())));

alter policy "log_content_components_update" on public.log_content_components
  using ((select private.has_log_access(auth.uid())))
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_content_items_insert" on public.log_content_items
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_content_items_select" on public.log_content_items
  using ((select private.has_log_access(auth.uid())));

alter policy "log_content_items_update" on public.log_content_items
  using ((select private.has_log_access(auth.uid())))
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_local_opportunities_insert" on public.log_local_opportunities
  with check ((select private.is_log_producer(auth.uid())));

alter policy "log_local_opportunities_select" on public.log_local_opportunities
  using ((select private.has_log_access(auth.uid())));

alter policy "log_local_opportunities_update" on public.log_local_opportunities
  using ((select private.is_log_producer(auth.uid())))
  with check ((select private.is_log_producer(auth.uid())));

alter policy "log_npr_episode_items_insert" on public.log_npr_episode_items
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_npr_episode_items_select" on public.log_npr_episode_items
  using ((select private.has_log_access(auth.uid())));

alter policy "log_npr_episodes_delete" on public.log_npr_episodes
  using ((select private.has_log_access(auth.uid())));

alter policy "log_npr_episodes_insert" on public.log_npr_episodes
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_npr_episodes_select" on public.log_npr_episodes
  using ((select private.has_log_access(auth.uid())));

alter policy "log_opportunity_assignments_insert" on public.log_opportunity_assignments
  with check ((select private.is_log_producer(auth.uid())));

alter policy "log_opportunity_assignments_select" on public.log_opportunity_assignments
  using ((select private.has_log_access(auth.uid())));

alter policy "log_opportunity_assignments_update" on public.log_opportunity_assignments
  using ((select private.is_log_producer(auth.uid())))
  with check ((select private.is_log_producer(auth.uid())));

alter policy "log_programs_insert" on public.log_programs
  with check ((select private.is_log_producer(auth.uid())));

alter policy "log_programs_select" on public.log_programs
  using ((select private.has_log_access(auth.uid())));

alter policy "log_programs_update" on public.log_programs
  using ((select private.is_log_producer(auth.uid())))
  with check ((select private.is_log_producer(auth.uid())));

alter policy "log_rundown_breaks_insert" on public.log_rundown_breaks
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_rundown_breaks_select" on public.log_rundown_breaks
  using ((select private.has_log_access(auth.uid())));

alter policy "log_rundown_breaks_update" on public.log_rundown_breaks
  using ((select private.has_log_access(auth.uid())))
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_rundown_items_delete" on public.log_rundown_items
  using (((select private.has_log_access(auth.uid())) AND (item_kind <> 'underwriting_credit'::text)));

alter policy "log_rundown_items_insert" on public.log_rundown_items
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_rundown_items_select" on public.log_rundown_items
  using ((select private.has_log_access(auth.uid())));

alter policy "log_rundown_items_update" on public.log_rundown_items
  using ((select private.has_log_access(auth.uid())))
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_rundowns_insert" on public.log_rundowns
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_rundowns_select" on public.log_rundowns
  using ((select private.has_log_access(auth.uid())));

alter policy "log_rundowns_update" on public.log_rundowns
  using ((select private.has_log_access(auth.uid())))
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_schedule_insert" on public.log_schedule
  with check ((select private.is_log_producer(auth.uid())));

alter policy "log_schedule_select" on public.log_schedule
  using ((select private.has_log_access(auth.uid())));

alter policy "log_schedule_update" on public.log_schedule
  using ((select private.is_log_producer(auth.uid())))
  with check ((select private.is_log_producer(auth.uid())));

alter policy "log_weather_reading_insert" on public.log_weather_reading
  with check ((select private.has_log_access(auth.uid())));

alter policy "log_weather_reading_select" on public.log_weather_reading
  using ((select private.has_log_access(auth.uid())));

alter policy "log_weather_reading_update" on public.log_weather_reading
  using ((select private.has_log_access(auth.uid())))
  with check ((select private.has_log_access(auth.uid())));

alter policy "profiles_select_editorial_members" on public.profiles
  using ((select private.ep_has_access(auth.uid())));

alter policy "profiles_select_own_or_admin" on public.profiles
  using (((id = (select auth.uid())) OR (select private.is_administrator(auth.uid()))));

alter policy "profiles_update_admin_only" on public.profiles
  using ((select private.is_administrator(auth.uid())))
  with check ((select private.is_administrator(auth.uid())));

alter policy "rd_comments_delete" on public.rd_comments
  using (((select private.has_roadmap_access(auth.uid())) AND ((author_id = (select auth.uid())) OR (select private.is_roadmap_curator(auth.uid())))));

alter policy "rd_comments_insert" on public.rd_comments
  with check (((select private.has_roadmap_access(auth.uid())) AND (author_id = (select auth.uid()))));

alter policy "rd_comments_select" on public.rd_comments
  using ((select private.has_roadmap_access(auth.uid())));

alter policy "rd_comments_update" on public.rd_comments
  using (((select private.has_roadmap_access(auth.uid())) AND (author_id = (select auth.uid()))))
  with check (((select private.has_roadmap_access(auth.uid())) AND (author_id = (select auth.uid()))));

alter policy "rd_posts_delete" on public.rd_posts
  using (((select private.has_roadmap_access(auth.uid())) AND ((author_id = (select auth.uid())) OR (select private.is_roadmap_curator(auth.uid())))));

alter policy "rd_posts_insert" on public.rd_posts
  with check (((select private.has_roadmap_access(auth.uid())) AND (author_id = (select auth.uid()))));

alter policy "rd_posts_select" on public.rd_posts
  using ((select private.has_roadmap_access(auth.uid())));

alter policy "rd_posts_update" on public.rd_posts
  using (((select private.has_roadmap_access(auth.uid())) AND ((author_id = (select auth.uid())) OR (select private.is_roadmap_curator(auth.uid())) OR (select private.is_administrator(auth.uid())))))
  with check (((select private.has_roadmap_access(auth.uid())) AND ((author_id = (select auth.uid())) OR (select private.is_roadmap_curator(auth.uid())) OR (select private.is_administrator(auth.uid())))));

alter policy "rd_votes_delete" on public.rd_votes
  using ((user_id = (select auth.uid())));

alter policy "rd_votes_insert" on public.rd_votes
  with check (((select private.has_roadmap_access(auth.uid())) AND (user_id = (select auth.uid()))));

alter policy "rd_votes_select" on public.rd_votes
  using ((select private.has_roadmap_access(auth.uid())));

alter policy "ri_participants_insert" on public.ri_participants
  with check (((select private.has_remote_interview_access(auth.uid())) AND (EXISTS ( SELECT 1
   FROM ri_sessions s
  WHERE ((s.id = ri_participants.session_id) AND (s.created_by = (select auth.uid())))))));

alter policy "ri_participants_select" on public.ri_participants
  using (((select private.has_remote_interview_access(auth.uid())) OR (profile_id = (select auth.uid())) OR (guest_user_id = (select auth.uid()))));

alter policy "ri_participants_update" on public.ri_participants
  using (((select private.has_remote_interview_access(auth.uid())) AND (EXISTS ( SELECT 1
   FROM ri_sessions s
  WHERE ((s.id = ri_participants.session_id) AND (s.created_by = (select auth.uid())))))))
  with check (((select private.has_remote_interview_access(auth.uid())) AND (EXISTS ( SELECT 1
   FROM ri_sessions s
  WHERE ((s.id = ri_participants.session_id) AND (s.created_by = (select auth.uid())))))));

alter policy "ri_session_events_insert" on public.ri_session_events
  with check (((select private.has_remote_interview_access(auth.uid())) OR ((participant_id IS NOT NULL) AND private.ri_is_own_participant(participant_id, (select auth.uid())))));

alter policy "ri_session_events_select" on public.ri_session_events
  using ((select private.has_remote_interview_access(auth.uid())));

alter policy "ri_sessions_delete" on public.ri_sessions
  using (((select private.has_remote_interview_access(auth.uid())) AND (created_by = (select auth.uid()))));

alter policy "ri_sessions_insert" on public.ri_sessions
  with check (((select private.has_remote_interview_access(auth.uid())) AND (created_by = (select auth.uid()))));

alter policy "ri_sessions_select" on public.ri_sessions
  using ((select private.has_remote_interview_access(auth.uid())));

alter policy "ri_sessions_update" on public.ri_sessions
  using (((select private.has_remote_interview_access(auth.uid())) AND (created_by = (select auth.uid()))))
  with check (((select private.has_remote_interview_access(auth.uid())) AND (created_by = (select auth.uid()))));

alter policy "ri_track_parts_insert" on public.ri_track_parts
  with check (private.ri_is_own_track(track_id, (select auth.uid())));

alter policy "ri_track_parts_select" on public.ri_track_parts
  using (((select private.has_remote_interview_access(auth.uid())) OR private.ri_is_own_track(track_id, (select auth.uid()))));

alter policy "ri_tracks_insert" on public.ri_tracks
  with check ((private.ri_is_own_participant(participant_id, (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM (ri_participants p
     JOIN ri_sessions s ON ((s.id = p.session_id)))
  WHERE ((p.id = ri_tracks.participant_id) AND (s.created_by = (select auth.uid())))))));

alter policy "ri_tracks_select" on public.ri_tracks
  using (((select private.has_remote_interview_access(auth.uid())) OR private.ri_is_own_participant(participant_id, (select auth.uid()))));

alter policy "ri_tracks_update" on public.ri_tracks
  using ((private.ri_is_own_participant(participant_id, (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM (ri_participants p
     JOIN ri_sessions s ON ((s.id = p.session_id)))
  WHERE ((p.id = ri_tracks.participant_id) AND (s.created_by = (select auth.uid())))))))
  with check ((private.ri_is_own_participant(participant_id, (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM (ri_participants p
     JOIN ri_sessions s ON ((s.id = p.session_id)))
  WHERE ((p.id = ri_tracks.participant_id) AND (s.created_by = (select auth.uid())))))));

alter policy "sw_data_point_excerpts_member_all" on public.sw_data_point_excerpts
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "sw_data_points_member_all" on public.sw_data_points
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "sw_document_blocks_member_all" on public.sw_document_blocks
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "sw_document_pages_member_all" on public.sw_document_pages
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "sw_document_processing_runs_member_all" on public.sw_document_processing_runs
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "sw_excerpt_document_locations_member_all" on public.sw_excerpt_document_locations
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "sw_project_sources_member_all" on public.sw_project_sources
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "sw_representations_member_all" on public.sw_representations
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "sw_research_questions_insert" on public.sw_research_questions
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "sw_research_questions_select" on public.sw_research_questions
  using ((select private.has_transcription_access(auth.uid())));

alter policy "sw_research_questions_update" on public.sw_research_questions
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "sw_source_excerpts_member_all" on public.sw_source_excerpts
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "sw_sources_delete" on public.sw_sources
  using (((select private.has_transcription_access(auth.uid())) AND (created_by = (select auth.uid()))));

alter policy "sw_sources_insert" on public.sw_sources
  with check (((select private.has_transcription_access(auth.uid())) AND (created_by = (select auth.uid()))));

alter policy "sw_sources_select" on public.sw_sources
  using ((select private.has_transcription_access(auth.uid())));

alter policy "sw_sources_update" on public.sw_sources
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "sw_theme_data_points_member_all" on public.sw_theme_data_points
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "sw_themes_member_all" on public.sw_themes
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "tool_access_select_editorial_members" on public.tool_access
  using (((select private.ep_has_access(auth.uid())) AND (tool_id = (select private.ep_tool_id())) AND (revoked_at IS NULL)));

alter policy "tool_access_select_own_or_admin" on public.tool_access
  using (((user_id = (select auth.uid())) OR (select private.is_administrator(auth.uid()))));

alter policy "tool_access_write_admin_only" on public.tool_access
  using ((select private.is_administrator(auth.uid())))
  with check ((select private.is_administrator(auth.uid())));

alter policy "tools_select_enabled_or_admin" on public.tools
  using (((select private.is_administrator(auth.uid())) OR ((enabled = true) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.account_status = 'active'::account_status)))))));

alter policy "tools_select_proposed_for_roadmap" on public.tools
  using (((status = 'proposed'::tool_status) AND (select private.has_roadmap_access(auth.uid()))));

alter policy "tools_write_admin_only" on public.tools
  using ((select private.is_administrator(auth.uid())))
  with check ((select private.is_administrator(auth.uid())));

alter policy "tw_chunks_member_all" on public.tw_chunks
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "tw_projects_delete" on public.tw_projects
  using (((select private.has_transcription_access(auth.uid())) AND (created_by = (select auth.uid()))));

alter policy "tw_projects_insert" on public.tw_projects
  with check (((select private.has_transcription_access(auth.uid())) AND (created_by = (select auth.uid()))));

alter policy "tw_projects_select" on public.tw_projects
  using ((select private.has_transcription_access(auth.uid())));

alter policy "tw_projects_update" on public.tw_projects
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "tw_segments_member_all" on public.tw_segments
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "tw_speakers_member_all" on public.tw_speakers
  using ((select private.has_transcription_access(auth.uid())))
  with check ((select private.has_transcription_access(auth.uid())));

alter policy "uw_affidavit_line_items_insert" on public.uw_affidavit_line_items
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_affidavit_line_items_select" on public.uw_affidavit_line_items
  using ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_affidavits_insert" on public.uw_affidavits
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_affidavits_select" on public.uw_affidavits
  using ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_affidavits_update" on public.uw_affidavits
  using ((select private.has_underwriting_access(auth.uid())))
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_contract_copy_delete" on public.uw_contract_copy
  using ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_contract_copy_insert" on public.uw_contract_copy
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_contract_copy_select" on public.uw_contract_copy
  using ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_contract_schedule_lines_insert" on public.uw_contract_schedule_lines
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_contract_schedule_lines_select" on public.uw_contract_schedule_lines
  using ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_contract_schedule_lines_select_for_log" on public.uw_contract_schedule_lines
  using (((select private.has_log_access(auth.uid())) AND (EXISTS ( SELECT 1
   FROM uw_scheduled_placements sp
  WHERE ((sp.schedule_line_id = uw_contract_schedule_lines.id) AND (sp.status <> 'superseded'::uw_placement_status))))));

alter policy "uw_contract_schedule_lines_update" on public.uw_contract_schedule_lines
  using ((select private.has_underwriting_access(auth.uid())))
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_contracts_insert" on public.uw_contracts
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_contracts_select" on public.uw_contracts
  using ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_contracts_update" on public.uw_contracts
  using ((select private.has_underwriting_access(auth.uid())))
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_copy_insert" on public.uw_copy
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_copy_select" on public.uw_copy
  using ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_copy_select_for_log" on public.uw_copy
  using (((select private.has_log_access(auth.uid())) AND (EXISTS ( SELECT 1
   FROM log_rundown_items lri
  WHERE (lri.underwriting_copy_id = uw_copy.id)))));

alter policy "uw_copy_update" on public.uw_copy
  using ((select private.has_underwriting_access(auth.uid())))
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_exceptions_select" on public.uw_exceptions
  using ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_exceptions_update" on public.uw_exceptions
  using ((select private.has_underwriting_access(auth.uid())))
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_makegoods_insert" on public.uw_makegoods
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_makegoods_select" on public.uw_makegoods
  using ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_makegoods_update" on public.uw_makegoods
  using ((select private.has_underwriting_access(auth.uid())))
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_scheduled_placements_select" on public.uw_scheduled_placements
  using ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_underwriters_insert" on public.uw_underwriters
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_underwriters_select" on public.uw_underwriters
  using ((select private.has_underwriting_access(auth.uid())));

alter policy "uw_underwriters_update" on public.uw_underwriters
  using ((select private.has_underwriting_access(auth.uid())))
  with check ((select private.has_underwriting_access(auth.uid())));

alter policy "al_media_delete" on storage.objects
  using (((bucket_id = 'audience-listening-media'::text) AND (select private.has_audience_listening_access(auth.uid()))));

alter policy "al_media_insert" on storage.objects
  with check (((bucket_id = 'audience-listening-media'::text) AND private.al_owns_open_submission_object(name, (select auth.uid()))));

alter policy "al_media_select" on storage.objects
  using (((bucket_id = 'audience-listening-media'::text) AND (select private.has_audience_listening_access(auth.uid()))));

alter policy "al_media_select_own" on storage.objects
  using (((bucket_id = 'audience-listening-media'::text) AND private.al_owns_open_submission_object(name, (select auth.uid()))));

alter policy "al_media_update" on storage.objects
  using (((bucket_id = 'audience-listening-media'::text) AND private.al_owns_open_submission_object(name, (select auth.uid()))))
  with check (((bucket_id = 'audience-listening-media'::text) AND private.al_owns_open_submission_object(name, (select auth.uid()))));

alter policy "ri_media_delete" on storage.objects
  using (((bucket_id = 'remote-interview-media'::text) AND (select private.has_remote_interview_access(auth.uid()))));

alter policy "ri_media_insert" on storage.objects
  with check (((bucket_id = 'remote-interview-media'::text) AND (private.ri_owns_storage_object(name, (select auth.uid())) OR private.ri_host_owns_storage_object(name, (select auth.uid())))));

alter policy "ri_media_select" on storage.objects
  using (((bucket_id = 'remote-interview-media'::text) AND ((select private.has_remote_interview_access(auth.uid())) OR private.ri_owns_storage_object(name, (select auth.uid())))));

alter policy "ri_media_update" on storage.objects
  using (((bucket_id = 'remote-interview-media'::text) AND (private.ri_owns_storage_object(name, (select auth.uid())) OR private.ri_host_owns_storage_object(name, (select auth.uid())))))
  with check (((bucket_id = 'remote-interview-media'::text) AND (private.ri_owns_storage_object(name, (select auth.uid())) OR private.ri_host_owns_storage_object(name, (select auth.uid())))));

alter policy "tw_media_delete" on storage.objects
  using (((bucket_id = 'transcription-media'::text) AND (select private.has_transcription_access(auth.uid()))));

alter policy "tw_media_insert" on storage.objects
  with check (((bucket_id = 'transcription-media'::text) AND (select private.has_transcription_access(auth.uid()))));

alter policy "tw_media_select" on storage.objects
  using (((bucket_id = 'transcription-media'::text) AND (select private.has_transcription_access(auth.uid()))));

alter policy "tw_media_update" on storage.objects
  using (((bucket_id = 'transcription-media'::text) AND (select private.has_transcription_access(auth.uid()))))
  with check (((bucket_id = 'transcription-media'::text) AND (select private.has_transcription_access(auth.uid()))));

alter policy "underwriting_documents_insert" on storage.objects
  with check (((bucket_id = 'underwriting-documents'::text) AND (select private.has_underwriting_access(auth.uid()))));

alter policy "underwriting_documents_select" on storage.objects
  using (((bucket_id = 'underwriting-documents'::text) AND (select private.has_underwriting_access(auth.uid()))));

alter policy "underwriting_documents_update" on storage.objects
  using (((bucket_id = 'underwriting-documents'::text) AND (select private.has_underwriting_access(auth.uid()))))
  with check (((bucket_id = 'underwriting-documents'::text) AND (select private.has_underwriting_access(auth.uid()))));

