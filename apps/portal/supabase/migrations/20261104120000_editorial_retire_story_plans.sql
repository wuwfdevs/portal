-- Editorial Planning: retire post-selection story plans.
--
-- The 2026-07-30 strategic refinement added a story-planning phase one step past
-- assignment (ep_story_plans, ep_story_plan_milestones, the /editorial/pitches/[id]/
-- story-plan screen). It contradicted the tool's own scope — docs/editorial-planning-
-- design.md §1: "the pipeline ends the moment a pitch is assigned or archived", with
-- production tracking, calendars and deadlines explicitly out — and no plan was ever
-- created in either environment (both tables held zero rows on 2026-10-28). See the
-- design doc's §10.5 for the record. The version prefix continues the sequence of the
-- already-applied files, which ran ahead of the calendar; APPLIED.md has the real dates.
--
-- Three parts: drop the two tables (their policies, grants, trigger and index go with
-- them; the two rls_initplan migrations that `alter policy` on them still run cleanly
-- on a fresh database because they sort before this file); trim the one rubric
-- guidance sentence that pointed reviewers at the retired phase (wording only — the
-- criterion's meaning and anchors are unchanged, so this is the design doc's
-- "fixing a typo" case, not a retire-and-add); and update the two Resources guides
-- that mentioned the plan, with a release note.

drop table if exists public.ep_story_plan_milestones;
drop table if exists public.ep_story_plans;

update public.ep_criteria
set guidance = 'This is a pitch-stage check, not a full viewpoint-diversity review. Ask whether the proposed sourcing is already narrow or predictable.'
where guidance = 'This is a pitch-stage check, not the full viewpoint-diversity review — that rigor belongs in story planning after selection. Here, ask whether the proposed sourcing is already narrow or predictable.';

-- Resources ---------------------------------------------------------------------

select private.rc_release_guide(
  p_slug => 'editorial-submit-a-pitch',
  p_tool_key => 'editorial-planning',
  p_title => 'Submit a pitch',
  p_summary => 'Put a story idea in the backlog and follow how it''s decided.',
  p_screen_keys => array['editorial.backlog', 'editorial.pitch'],
  p_sort_order => 10,
  p_version_note => 'Story plans retired: the pitch page ends at the assignment',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Every story idea starts as a pitch in the "},{"type":"text","text":"backlog","marks":[{"type":"link","attrs":{"href":"/editorial"}}]},{"type":"text","text":". An editor picks pitches from the backlog for a weekly planning meeting, where reviewers score them and the editor records a decision."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Submit one"}]},{"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"On the Backlog tab, select "},{"type":"text","text":"New pitch","marks":[{"type":"bold"}]},{"type":"text","text":"."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Give it a title — one line that says what the story is — and fill in the fields below it. Fields marked with an asterisk are required."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Choose a "},{"type":"text","text":"Primary coverage pillar","marks":[{"type":"bold"}]},{"type":"text","text":". If you choose one of the station's pillars, say how the story contributes to sustained coverage of it."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Select "},{"type":"text","text":"Submit pitch","marks":[{"type":"bold"}]},{"type":"text","text":". You land on the pitch's own page."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Edit it"}]},{"type":"paragraph","content":[{"type":"text","text":"You can keep editing your pitch with "},{"type":"text","text":"Edit","marks":[{"type":"bold"}]},{"type":"text","text":" until an editor adds it to a meeting's slate. While that meeting is scoring, edits are locked; they reopen if the pitch comes back to the backlog."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Follow it"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"The Backlog has four views: "},{"type":"text","text":"Open","marks":[{"type":"bold"}]},{"type":"text","text":", "},{"type":"text","text":"Stale","marks":[{"type":"bold"}]},{"type":"text","text":", "},{"type":"text","text":"Assigned","marks":[{"type":"bold"}]},{"type":"text","text":", and "},{"type":"text","text":"Archived","marks":[{"type":"bold"}]},{"type":"text","text":"."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"A pitch is stale when it has gone 90 days without a review, or has been deferred three times. Editors can archive stale pitches in bulk from the Stale view."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"The pitch page's "},{"type":"text","text":"Review history","marks":[{"type":"bold"}]},{"type":"text","text":" lists each meeting that discussed it, with its scores, reviewers' comments, and the decision."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Once a pitch is assigned, the pitch page shows who is reporting it. The pipeline ends there; reporting itself is not tracked in this tool."}]}]}]}]}$body$
);

select private.rc_release_guide(
  p_slug => 'editorial-planning-workflow-overview',
  p_tool_key => 'editorial-planning',
  p_title => 'Editorial Planning: pitch to assignment',
  p_summary => 'Prepare pitches, score and document decisions.',
  p_screen_keys => array['editorial.backlog', 'editorial.meeting', 'editorial.pitch'],
  p_sort_order => 5,
  p_version_note => 'Story plans retired: the "Move from pitch to story plan" section is gone',
  p_body => $body${"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Submit a useful pitch"}]},{"type":"paragraph","content":[{"type":"text","text":"A pitch should make a potential story legible to a colleague without requiring a separate conversation. State what is happening; whom it affects; why it matters now; what remains unknown; what evidence or sources might answer the question; and what reporting effort is likely required. Choose the coverage pillar that best describes the underlying public question, not merely the institution involved."}]},{"type":"paragraph","content":[{"type":"text","text":"Example:","marks":[{"type":"bold"}]},{"type":"text","text":" Rather than \"UWF hosts military program,\" frame the public question: whether a university's expansion of military-to-civilian training is changing access to civilian employment and for whom. The institutional activity is a lead to investigate, not necessarily the story's conclusion."}]},{"type":"paragraph","content":[{"type":"text","text":"The existing workflow permits a "},{"type":"text","text":"submitted pitch","marks":[{"type":"link","attrs":{"href":"/editorial"}}]},{"type":"text","text":" to be edited until it enters "},{"type":"text","text":"meeting scoring","marks":[{"type":"link","attrs":{"href":"/editorial/meetings"}}]},{"type":"text","text":"; use review history to understand whether it was assigned, deferred or archived."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Run a planning meeting"}]},{"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Editors create the meeting and select a rubric appropriate to the mix of coverage. Add eligible pitches to the slate."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Reviewers score independently against the published anchored criteria and record substantive concerns. An institutional alignment modifier must not substitute for the story's civic value, evidence or feasibility."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"After scoring closes, consider the ranked agenda, disagreements and written comments. Scores inform editorial judgment; they do not make the assignment decision themselves."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Record the disposition and assignment clearly. A deferred pitch should have an understandable next step where possible; an assigned pitch should identify the responsible reporter."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Conclude the meeting only after decisions are recorded. The concluded meeting is a permanent historical record."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"After assignment"}]},{"type":"paragraph","content":[{"type":"text","text":"The pipeline ends at the assignment. The pitch page records who is reporting the story and keeps every round's scores, comments and decision as the newsroom's record; the reporting itself is not tracked here."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Administration"}]},{"type":"paragraph","content":[{"type":"text","text":"Configuration guides should explain the difference between weighted core criteria and separate modifiers, how archived rubric elements preserve historical scores, and when changing criteria is justified. Any numerical example must match the live rubric."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Direct portal screen links"}]},{"type":"paragraph","content":[{"type":"text","text":"Open these routes in the portal. Individual records must be opened from their list; no record ID is assumed."}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Pitch backlog","marks":[{"type":"link","attrs":{"href":"/editorial"}}]}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Meetings","marks":[{"type":"link","attrs":{"href":"/editorial/meetings"}}]}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Settings","marks":[{"type":"link","attrs":{"href":"/editorial/settings"}}]}]}]}]}]}$body$
);

select private.rc_release_note(
  p_slug => 'release-2026-10-28-editorial-story-plans-retired',
  p_tool_key => 'editorial-planning',
  p_released_on => '2026-10-28',
  p_title => 'Story plans are retired',
  p_guide_slugs => array['editorial-submit-a-pitch', 'editorial-planning-workflow-overview'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The story plan that could be started from an assigned pitch is gone, along with its milestones. Editorial Planning ends at the assignment: the pitch page shows who is reporting the story and keeps each meeting's scores, comments and decision. No plan had been created, so nothing was lost."}]}]}$body$
);
