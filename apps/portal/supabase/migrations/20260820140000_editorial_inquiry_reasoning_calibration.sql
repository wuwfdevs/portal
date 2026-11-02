-- Editorial Inquiry: reasoning calibration (2026-08-20).
--
-- Two vocabulary widenings, both found by auditing a real production
-- inquiry's turns against what the tool could express:
--
-- 1. ei_chat_messages.action_kind gains 'promote'. The model could judge a
--    question story-ready (a real Evaluate turn said "structurally strong
--    enough to report" in prose) but had no action to nominate it — the
--    word "promote" appeared nowhere in its vocabulary, so it never
--    promoted anything "on its own" by construction. Promotion itself stays
--    the reporter's explicit click: a promote message's applied_at stays
--    null until they confirm, the same pending shape as reframe.
--
-- 2. ei_questions.diagnosis_kind gains 'too_narrow_process_step'. The
--    existing ten reasons all describe a question that hasn't narrowed
--    ENOUGH; nothing could name the opposite failure — a question drilled
--    past story level into a reporting task (a records request, a yes/no
--    verification step), which real drill-down chains reliably produced
--    ("can the department produce the last 12 months of audit logs" is a
--    FOIA step, not a story). The fix direction for this one is up, not
--    down — see lib/editorial-inquiry/ai.ts's DIAGNOSIS_GUIDE.

alter table public.ei_chat_messages
  drop constraint ei_chat_messages_action_kind_check;

alter table public.ei_chat_messages
  add constraint ei_chat_messages_action_kind_check check (action_kind is null or action_kind in (
    'branch', 'drilldown', 'context', 'reframe', 'diagnosis', 'assessment', 'promote'
  ));

comment on column public.ei_chat_messages.action_kind is
  'branch/drilldown/context execute immediately (applied_at set at insert). reframe and promote wait for an explicit reporter click (applied_at null until then). diagnosis/assessment are purely informational (never mutate the tree beyond diagnosis writing onto the acted-on question''s own diagnosis_kind/diagnosis_note) and also get applied_at set immediately, since neither has a pending step. See design doc §7, §9.';

alter table public.ei_questions
  drop constraint ei_questions_diagnosis_kind_check;

alter table public.ei_questions
  add constraint ei_questions_diagnosis_kind_check check (diagnosis_kind is null or diagnosis_kind in (
    'still_thematic', 'too_broad', 'compound_question', 'unverified_premise', 'already_known',
    'unclear_stakes', 'no_uncertainty', 'implausible_reporting_path', 'trivial',
    'descriptive_not_investigative', 'too_narrow_process_step'
  ));

comment on column public.ei_questions.diagnosis_kind is
  'Why this question is not a strong story question, in the model''s own diagnosis (design doc §5) — null means undiagnosed, not "fine." unverified_premise is the direct successor of the old has_assumption flag. too_narrow_process_step is the one over-narrowing reason: drilled past story level into a reporting task.';
