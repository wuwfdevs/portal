-- Editorial Planning: one rubric, not profiles.
--
-- The 2026-07-30 refinement added ep_rubric_profiles so a meeting could be scored
-- against one of two rubrics (Strategic / Enterprise, the default, and Immediate /
-- Emerging News). One active rubric is simpler to run and to explain, and the second
-- profile was never used for a meeting in either environment (checked 2026-10-28: zero
-- meetings, zero scores). Its concern — urgent coverage must not be gated on pillar fit
-- — is already carried by the pitch form's urgency field, the "Immediate public need"
-- pillar option and the Coverage-pillar criterion's own guidance. See
-- docs/editorial-planning-design.md §10.6. Depends on 20261104120000; the version
-- prefix continues the sequence (APPLIED.md has the real dates).
--
-- Order matters: the unused profile's criteria go first (they have no scores in
-- either environment; a criterion that somehow did would be retired, not deleted,
-- since ep_review_scores references it), then the two foreign-key columns, then the
-- table — its policies (including the Editorial Inquiry read policy and the ones the
-- two rls_initplan migrations alter, which still run cleanly on a fresh database
-- because they sort before this file) go with it.

delete from public.ep_criteria c
using public.ep_rubric_profiles p
where c.profile_id = p.id
  and not p.is_default
  and not exists (select 1 from public.ep_review_scores s where s.criterion_id = c.id);

update public.ep_criteria c
set active = false
from public.ep_rubric_profiles p
where c.profile_id = p.id and not p.is_default and c.active;

alter table public.ep_criteria drop column profile_id;
alter table public.ep_meetings drop column rubric_profile_id;
drop table public.ep_rubric_profiles;

-- Resources ---------------------------------------------------------------------

select private.rc_release_guide(
  p_slug => 'editorial-run-a-planning-meeting',
  p_tool_key => 'editorial-planning',
  p_title => 'Run a planning meeting',
  p_summary => 'Build a slate, score it independently, then decide from the ranked agenda.',
  p_screen_keys => array['editorial.meeting'],
  p_sort_order => 20,
  p_version_note => 'One rubric: creating a meeting no longer asks for a profile',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"text":"A ","type":"text"},{"text":"planning meeting","type":"text","marks":[{"type":"link","attrs":{"href":"/editorial/meetings"}}]},{"text":" moves through three stages: ","type":"text"},{"text":"Scoring open","type":"text","marks":[{"type":"bold"}]},{"text":", ","type":"text"},{"text":"Agenda","type":"text","marks":[{"type":"bold"}]},{"text":", and ","type":"text"},{"text":"Concluded","type":"text","marks":[{"type":"bold"}]},{"text":". Editors run it; reviewers and editors score; contributors can follow along.","type":"text"}]},{"type":"heading","attrs":{"level":2},"content":[{"text":"Set it up (editors)","type":"text"}]},{"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"On the Meetings tab, choose the meeting date, then select ","type":"text"},{"text":"Create meeting","type":"text","marks":[{"type":"bold"}]},{"text":".","type":"text"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"Open the meeting. Under ","type":"text"},{"text":"+ Add pitch","type":"text","marks":[{"type":"bold"}]},{"text":", choose a pitch from the backlog and select ","type":"text"},{"text":"Add to slate","type":"text","marks":[{"type":"bold"}]},{"text":". Repeat for each pitch.","type":"text"}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"text":"Score the slate (reviewers and editors)","type":"text"}]},{"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"Open each pitch on the slate. ","type":"text"},{"text":"Show pitch details","type":"text","marks":[{"type":"bold"}]},{"text":" expands the full pitch.","type":"text"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"Choose a score for each criterion. Hover a number to read what it means. Institutional modifiers are optional.","type":"text"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"Choose a recommendation, flag any concerns, and add a comment if it helps the room. Select ","type":"text"},{"text":"Save review","type":"text","marks":[{"type":"bold"}]},{"text":".","type":"text"}]}]}]},{"type":"paragraph","content":[{"text":"Scoring is independent: nobody sees anyone else's scores or comments until the editor closes scoring.","type":"text"}]},{"type":"heading","attrs":{"level":2},"content":[{"text":"Decide (editors)","type":"text"}]},{"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"Select ","type":"text"},{"text":"Close scoring & build agenda","type":"text","marks":[{"type":"bold"}]},{"text":". The slate is ranked by score.","type":"text"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"A red ","type":"text"},{"text":"Split","type":"text","marks":[{"type":"bold"}]},{"text":" badge means reviewers disagree — worth discussing. Open ","type":"text"},{"text":"Scores, recommendations & comments","type":"text","marks":[{"type":"bold"}]},{"text":" to see why.","type":"text"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"For each pitch, choose ","type":"text"},{"text":"Assign","type":"text","marks":[{"type":"bold"}]},{"text":" (pick the reporter first), ","type":"text"},{"text":"Defer","type":"text","marks":[{"type":"bold"}]},{"text":" to keep it in the backlog, or ","type":"text"},{"text":"Archive","type":"text","marks":[{"type":"bold"}]},{"text":". Select ","type":"text"},{"text":"Change","type":"text","marks":[{"type":"bold"}]},{"text":" to revise a decision.","type":"text"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"Select ","type":"text"},{"text":"Conclude meeting","type":"text","marks":[{"type":"bold"}]},{"text":". Any pitch still undecided is deferred. A concluded meeting is a permanent record.","type":"text"}]}]}]}]}$body$
);

select private.rc_release_guide(
  p_slug => 'editorial-configure-form-and-rubric',
  p_tool_key => 'editorial-planning',
  p_title => 'Configure the pitch form and rubric',
  p_summary => 'Editors choose what writers are asked and what reviewers score.',
  p_screen_keys => array['editorial.settings'],
  p_sort_order => 30,
  p_version_note => 'One rubric: criteria no longer belong to a profile',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"text":"Settings","type":"text","marks":[{"type":"link","attrs":{"href":"/editorial/settings"}}]},{"text":" is for editors. It has three parts: ","type":"text"},{"text":"Submission form","type":"text","marks":[{"type":"bold"}]},{"text":", ","type":"text"},{"text":"Pillars","type":"text","marks":[{"type":"bold"}]},{"text":", and ","type":"text"},{"text":"Rubric","type":"text","marks":[{"type":"bold"}]},{"text":". Retired entries stay on the pitches and scores that used them, so nothing changed here rewrites history.","type":"text"}]},{"type":"heading","attrs":{"level":2},"content":[{"text":"Submission form","type":"text"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"Select ","type":"text"},{"text":"+ Add field","type":"text","marks":[{"type":"bold"}]},{"text":" to add a question to the pitch form. A field's type is fixed once it exists; its label, help text, options, and whether it's required can change later.","type":"text"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"Reorder fields with the arrows. Retire a field you no longer need; restore it any time.","type":"text"}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"text":"Pillars","type":"text"}]},{"type":"paragraph","content":[{"text":"Pillars are the station's coverage priorities. Each has a guiding question, shown to writers on the pitch form. Retire a pillar to take it off the form; a retired pillar can be deleted.","type":"text"}]},{"type":"heading","attrs":{"level":2},"content":[{"text":"Rubric","type":"text"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"Core criteria are weighted and averaged; the active weights should add up to 100. Modifiers are scored separately and never count toward the core average.","type":"text"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"Each criterion can carry anchored descriptions — what each score means — which reviewers see when they hover a score.","type":"text"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"text":"A weight change applies to future scoring only. The scoring scale and the modifier threshold are set at the bottom of the page.","type":"text"}]}]}]}]}$body$
);

select private.rc_release_guide(
  p_slug => 'editorial-planning-workflow-overview',
  p_tool_key => 'editorial-planning',
  p_title => 'Editorial Planning: pitch to assignment',
  p_summary => 'Prepare pitches, score and document decisions.',
  p_screen_keys => array['editorial.backlog', 'editorial.meeting', 'editorial.pitch'],
  p_sort_order => 5,
  p_version_note => 'One rubric: no profile to choose when creating a meeting',
  p_body => $body${"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Submit a useful pitch"}]},{"type":"paragraph","content":[{"type":"text","text":"A pitch should make a potential story legible to a colleague without requiring a separate conversation. State what is happening; whom it affects; why it matters now; what remains unknown; what evidence or sources might answer the question; and what reporting effort is likely required. Choose the coverage pillar that best describes the underlying public question, not merely the institution involved."}]},{"type":"paragraph","content":[{"type":"text","text":"Example:","marks":[{"type":"bold"}]},{"type":"text","text":" Rather than \"UWF hosts military program,\" frame the public question: whether a university's expansion of military-to-civilian training is changing access to civilian employment and for whom. The institutional activity is a lead to investigate, not necessarily the story's conclusion."}]},{"type":"paragraph","content":[{"type":"text","text":"The existing workflow permits a "},{"type":"text","text":"submitted pitch","marks":[{"type":"link","attrs":{"href":"/editorial"}}]},{"type":"text","text":" to be edited until it enters "},{"type":"text","text":"meeting scoring","marks":[{"type":"link","attrs":{"href":"/editorial/meetings"}}]},{"type":"text","text":"; use review history to understand whether it was assigned, deferred or archived."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Run a planning meeting"}]},{"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Editors create the meeting and add eligible pitches to the slate."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Reviewers score independently against the published anchored criteria and record substantive concerns. An institutional alignment modifier must not substitute for the story's civic value, evidence or feasibility."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"After scoring closes, consider the ranked agenda, disagreements and written comments. Scores inform editorial judgment; they do not make the assignment decision themselves."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Record the disposition and assignment clearly. A deferred pitch should have an understandable next step where possible; an assigned pitch should identify the responsible reporter."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Conclude the meeting only after decisions are recorded. The concluded meeting is a permanent historical record."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"After assignment"}]},{"type":"paragraph","content":[{"type":"text","text":"The pipeline ends at the assignment. The pitch page records who is reporting the story and keeps every round's scores, comments and decision as the newsroom's record; the reporting itself is not tracked here."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Administration"}]},{"type":"paragraph","content":[{"type":"text","text":"Configuration guides should explain the difference between weighted core criteria and separate modifiers, how archived rubric elements preserve historical scores, and when changing criteria is justified. Any numerical example must match the live rubric."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Direct portal screen links"}]},{"type":"paragraph","content":[{"type":"text","text":"Open these routes in the portal. Individual records must be opened from their list; no record ID is assumed."}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Pitch backlog","marks":[{"type":"link","attrs":{"href":"/editorial"}}]}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Meetings","marks":[{"type":"link","attrs":{"href":"/editorial/meetings"}}]}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Settings","marks":[{"type":"link","attrs":{"href":"/editorial/settings"}}]}]}]}]}]}$body$
);

select private.rc_release_note(
  p_slug => 'release-2026-10-28-editorial-one-rubric',
  p_tool_key => 'editorial-planning',
  p_released_on => '2026-10-28',
  p_title => 'One rubric for every meeting',
  p_guide_slugs => array['editorial-run-a-planning-meeting', 'editorial-configure-form-and-rubric', 'editorial-planning-workflow-overview'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Meetings no longer choose between two rubrics. Every meeting scores against the one set of active criteria in Settings, and the Immediate / Emerging News profile, which had never been used, is gone. A pitch's urgency still comes through the pitch form, and a pitch outside the coverage pillars is not penalized on the pillar criterion."}]}]}$body$
);
