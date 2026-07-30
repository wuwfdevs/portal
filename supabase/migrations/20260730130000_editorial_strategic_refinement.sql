-- Editorial Planning: strategic/magazine refinement. Design rationale:
-- docs/editorial-planning-design.md §4 (form/rubric), §4A (modifier), §4B
-- (reviewer recommendation/concerns), §5A (story planning), §4C (profiles).
--
-- This migration replaces the starter pitch form and rubric with a fuller,
-- pillar-aware set; adds a true core/modifier distinction to the rubric so
-- UWF institutional alignment can be tracked without touching the core
-- editorial-merit score; adds rubric profiles so a future immediate-news
-- scoring profile doesn't require a rules engine; adds reviewer
-- recommendations and structured concern flags; and adds a narrowly-scoped
-- post-selection story-planning phase. Every existing row is preserved:
-- obsolete form fields and criteria are deactivated, never deleted, and new
-- columns on ep_reviews/ep_review_scores are additive so historical reviews
-- and scores keep their original meaning (see design §4.2's deactivate/new
-- row rule, which this migration follows throughout).

-- ep_form_fields: allow a retired key to be reused ------------------------
-- The original schema made `key` globally unique, which blocks the
-- deactivate-then-recreate-with-the-same-slug pattern the design doc
-- describes (e.g. retiring 'summary' and seeding a fuller 'summary' field).
-- Scope uniqueness to active rows instead — retired rows keep their key for
-- historical FK integrity, but free the slug up for reuse.

do $$
declare
  key_constraint text;
begin
  select conname into key_constraint
  from pg_constraint
  where conrelid = 'public.ep_form_fields'::regclass
    and contype = 'u'
    and conkey = (
      select array_agg(attnum order by attnum)
      from pg_attribute
      where attrelid = 'public.ep_form_fields'::regclass and attname = 'key'
    );
  if key_constraint is not null then
    execute format('alter table public.ep_form_fields drop constraint %I', key_constraint);
  end if;
end $$;

-- Deactivate the starter fields before the new rows below reuse their keys.
update public.ep_form_fields
set active = false
where key in ('summary', 'why_now', 'sources', 'format');

create unique index ep_form_fields_key_active_idx on public.ep_form_fields (key) where active;

comment on index public.ep_form_fields_key_active_idx is
  'Key is unique only among active fields, so a retired field''s slug can be reused by its replacement (deactivate + new row, per design §4.2).';

-- New default pitch form ---------------------------------------------------
-- Ten required fields drive the story toward planned, wide-angle, pillar-
-- aware journalism (summary through urgency); five optional fields capture
-- supporting detail without turning the form into a survey. Coverage-pillar
-- names are seeded as clearly-labeled placeholders, not adopted names — see
-- primary_pillar's help text and design §4C.

insert into public.ep_form_fields (key, label, help_text, field_type, options, required, sort_order)
values
  ('summary', 'Pitch summary',
   'In two or three sentences, what is the story? Identify what is happening, who or what is affected, and why it matters.',
   'long_text', null, true, 1),
  ('central_question', 'Central reporting question',
   'What specific question will the reporting try to answer?',
   'long_text', null, true, 2),
  ('why_now', 'Why now?',
   'What development, decision, trend, deadline, discovery, or strategic moment makes this timely?',
   'long_text', null, true, 3),
  ('public_stakes', 'Public stakes',
   'What is at stake, and for whom? Consider effects on lives, rights, safety, finances, opportunity, public resources, or community life.',
   'long_text', null, true, 4),
  ('reporting_approach', 'Proposed reporting approach',
   'Briefly describe likely evidence, source categories, records or data, locations or scenes, and what WUWF could contribute beyond existing coverage.',
   'long_text', null, true, 5),
  ('perspectives', 'Relevant people and perspectives',
   'Who is directly affected, who holds power or responsibility, and whose experience or perspective should the reporting include?',
   'long_text', null, true, 6),
  ('primary_pillar', 'Primary coverage pillar',
   'Proposed pillars pending formal newsroom adoption — edit freely in Settings → Submission form. If this doesn''t map to a current pillar, say so instead of forcing a fit.',
   'select',
   '["Coastal & environmental resilience", "Regional economy & workforce", "Health & public services", "Education & youth opportunity", "Government & public accountability", "Outside current pillars", "Emerging issue / possible future priority", "Immediate public need"]'::jsonb,
   true, 7),
  ('pillar_contribution', 'Contribution to sustained coverage',
   'How would this reporting advance WUWF''s understanding or coverage of the selected priority? Required when a defined pillar is selected above — not when the pitch is outside current pillars, emerging, or an immediate need.',
   'long_text', null, false, 8),
  ('format', 'Suggested format', null,
   'select',
   '["Brief / spot item", "Standard story", "Interview / two-way", "Explainer / service", "Enterprise feature", "Accountability / investigative", "Audio feature", "Series / continuing coverage", "Undetermined"]'::jsonb,
   true, 9),
  ('urgency', 'Urgency or publication window', null,
   'select',
   '["Immediate / same day", "Near term / several days", "Time-bound / known date", "Planned / several weeks", "Long-range / enterprise", "No firm deadline"]'::jsonb,
   true, 10),
  ('sources_materials', 'Known sources, documents, data, records, or links', null,
   'long_text', null, false, 11),
  ('prior_coverage', 'Related WUWF coverage or existing reporting', null,
   'long_text', null, false, 12),
  ('audio_visual', 'Audio, scene, visual, archive, map, or graphic opportunities', null,
   'long_text', null, false, 13),
  ('support_needs', 'Collaboration or specialized support needed', null,
   'long_text', null, false, 14),
  ('resource_estimate', 'Resource estimate', null,
   'select', '["Small", "Moderate", "Significant", "Unknown"]'::jsonb, false, 15);

-- Rubric profiles -----------------------------------------------------------
-- The smallest sound extension for §4C: criteria are tagged with a profile,
-- and a meeting picks the profile it scores against. This is data, not a
-- rules engine — the aggregation math in scoring.ts is unchanged either way.

create table public.ep_rubric_profiles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text,
  is_default  boolean not null default false,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.ep_rubric_profiles is
  'Named rubric profiles (e.g. Strategic/Enterprise, Immediate/Emerging News). Each ep_criteria row belongs to exactly one profile; a meeting scores against one profile at a time. At most one profile should be is_default — the app does not enforce this at the database level, matching the small-newsroom-trust posture of the rest of this schema.';

create trigger set_ep_rubric_profiles_updated_at
  before update on public.ep_rubric_profiles
  for each row execute function public.set_updated_at();

insert into public.ep_rubric_profiles (id, key, name, description, is_default, sort_order)
values
  ('a1000000-0000-4000-8000-000000000001', 'strategic', 'Strategic / Enterprise',
   'Planned, wide-angle, pillar-aware journalism — the default profile for weekly editorial meetings.',
   true, 1),
  ('a1000000-0000-4000-8000-000000000002', 'immediate', 'Immediate / Emerging News',
   'Urgent public-need coverage, where readiness and timeliness carry more weight and pillar fit is not a gate.',
   false, 2);

-- Rubric: core vs. modifier, anchors, per-criterion scale override, profile -

update public.ep_criteria set active = false
where name in ('News value', 'Local relevance', 'Feasibility', 'Audience impact');

alter table public.ep_criteria
  add column criterion_type text not null default 'core' check (criterion_type in ('core', 'modifier')),
  add column scale_min integer,
  add column scale_max integer,
  add column anchors jsonb,
  add column profile_id uuid references public.ep_rubric_profiles (id),
  add constraint ep_criteria_scale_check check (
    scale_min is null or scale_max is null or scale_max > scale_min
  );

comment on column public.ep_criteria.criterion_type is
  'core: part of the weighted editorial-merit average (ep_settings.scale_*). modifier: scored 0..N separately, never part of the core average — see docs/editorial-planning-design.md §4A. Institutional alignment is seeded as the only modifier; core criteria must never be used to smuggle in institutional favor.';
comment on column public.ep_criteria.scale_min is
  'Null uses the tool-wide scale (ep_settings). Set for criteria whose scale differs from the core rubric — the modifier''s 0..+5 range, for instance.';
comment on column public.ep_criteria.anchors is
  'jsonb object keyed by score ("0".."4", etc.) to a short anchor description shown to reviewers at that score point. Optional but expected for a well-specified criterion.';

-- Backfill existing (now-retired) criteria onto the strategic profile so the
-- FK can become required for all new rows without orphaning old ones.
update public.ep_criteria set profile_id = 'a1000000-0000-4000-8000-000000000001' where profile_id is null;
alter table public.ep_criteria alter column profile_id set not null;

-- Strategic / Enterprise profile: 10 core criteria (weights sum to 100) plus
-- the institutional-alignment modifier. Definitions avoid collapsing distinct
-- concepts into a generic "news value" score, and deliberately do not score
-- prominence, conflict, magnitude, celebrity, or shareability on their own —
-- those are evidence within the criteria below, not separate scores.

insert into public.ep_criteria
  (name, description, guidance, weight, criterion_type, profile_id, sort_order, anchors)
values
  ('Public impact',
   'The scale and seriousness of effect on the public — lives, rights, safety, finances, opportunity, public resources, or community life.',
   'Weigh breadth (how many are affected) and depth (how much it matters to those affected). A story can score high with a smaller but seriously affected group.',
   16, 'core', 'a1000000-0000-4000-8000-000000000001', 1,
   '{"0": "No discernible public effect; interest is personal or novelty only.", "1": "Minor or narrow effect on a small group; low stakes.", "2": "Moderate effect on an identifiable community, or meaningful stakes for a smaller group.", "3": "Substantial effect on a broad segment of the audience, or serious stakes for an affected group.", "4": "Major effect on public life, safety, rights, or resources across the listening area."}'::jsonb),

  ('Audience and community relevance',
   'How directly this connects to WUWF''s audience and the communities in its listening area.',
   'A story can be nationally sourced and still score high here if the local angle is real and specific; a technically "local" story with no real audience connection should not.',
   12, 'core', 'a1000000-0000-4000-8000-000000000001', 2,
   '{"0": "No identifiable connection to WUWF''s audience or listening area.", "1": "Tenuous or generic local connection.", "2": "Clear relevance to a specific community or audience segment.", "3": "Strong relevance across a substantial part of the listening area.", "4": "Central, immediate relevance to the WUWF audience as a whole."}'::jsonb),

  ('Timeliness and strategic moment',
   'Whether there is a real reason this runs now — a decision, deadline, anniversary, trend inflection, or newly available information.',
   'Distinguish genuine timeliness from an arbitrary news peg. "Why now" should hold up under a skeptical read.',
   8, 'core', 'a1000000-0000-4000-8000-000000000001', 3,
   '{"0": "No timing rationale; could run any time with no loss of relevance.", "1": "Weak or manufactured news peg.", "2": "A reasonable, if soft, timing rationale.", "3": "A clear and specific timing rationale — a decision, event, or deadline.", "4": "A hard, consequential timing rationale — reporting now materially matters more than reporting later."}'::jsonb),

  ('Accountability and civic significance',
   'Whether the reporting examines the use of power, public money, or public trust, and holds an institution or decision-maker to account.',
   'Score on the reporting''s accountability function, not on conflict or controversy for their own sake.',
   13, 'core', 'a1000000-0000-4000-8000-000000000001', 4,
   '{"0": "No accountability dimension.", "1": "Touches on institutions or public decisions without examining them critically.", "2": "Some accountability value — surfaces a decision or practice worth public scrutiny.", "3": "Substantial accountability value — examines how power or public resources are being used.", "4": "High accountability value — original scrutiny of an institution, official, or system with real public consequence."}'::jsonb),

  ('Originality and discovery',
   'Whether this tells the audience something new, or reframes something familiar with genuinely new reporting.',
   'A follow-up on a known story can still score well if it adds real new reporting; being first to cover something with no depth should not automatically score high.',
   10, 'core', 'a1000000-0000-4000-8000-000000000001', 5,
   '{"0": "Restates what is already widely known or reported elsewhere.", "1": "Minor addition to existing coverage.", "2": "A meaningfully new angle or previously unreported detail.", "3": "Substantial original reporting or a genuinely new understanding of the subject.", "4": "A story only WUWF is positioned to tell, or a significant original finding."}'::jsonb),

  ('Explanatory and service value',
   'How much the reporting helps the audience understand something complex or act on practical information.',
   'Consider both explanatory value (understanding) and service value (what to do).',
   9, 'core', 'a1000000-0000-4000-8000-000000000001', 6,
   '{"0": "No explanatory or service value.", "1": "Minor clarification of a narrow point.", "2": "Helps the audience understand or navigate a moderately complex issue.", "3": "Substantially clarifies a complex issue or provides genuinely useful service information.", "4": "Makes a complex, consequential subject clearly understandable, or delivers service information listeners will act on."}'::jsonb),

  ('Human and narrative potential',
   'Whether the story has the human specificity, scene, and voice to be compelling audio journalism, not just an informative brief.',
   'Score the reporting''s potential, not production polish. A strong narrative should still serve the public-interest criteria above — this is not a shareability score.',
   7, 'core', 'a1000000-0000-4000-8000-000000000001', 7,
   '{"0": "No narrative or human element identified.", "1": "Thin — mostly abstract or institutional voices.", "2": "At least one accessible human perspective or scene.", "3": "Strong access to people and scenes that would make this vivid audio.", "4": "Rich, specific human access and narrative material well suited to WUWF''s storytelling."}'::jsonb),

  ('Breadth of perspective and community representation',
   'Whether the pitch''s source plan reflects the range of people affected and holding relevant knowledge, rather than a single or predictable set of voices.',
   'This is a pitch-stage check, not the full viewpoint-diversity review — that rigor belongs in story planning after selection. Here, ask whether the proposed sourcing is already narrow or predictable.',
   7, 'core', 'a1000000-0000-4000-8000-000000000001', 8,
   '{"0": "Sourcing plan is one-sided or relies on a single predictable voice.", "1": "Narrow sourcing with little indication of broader perspectives.", "2": "Reasonable initial spread of likely sources.", "3": "Deliberate plan to include multiple affected communities or viewpoints.", "4": "Sourcing plan already reflects meaningful breadth across those affected, responsible, and knowledgeable."}'::jsonb),

  ('Coverage-pillar contribution',
   'How this reporting advances WUWF''s own defined coverage priorities — planned, sustained attention to the issues the newsroom has chosen to own.',
   'Score against the selected pillar''s stated aims. A pitch outside current pillars or addressing an immediate public need is not penalized here — score it on its own editorial merit using the other criteria, and let the pillar field flag it for the newsroom''s attention.',
   13, 'core', 'a1000000-0000-4000-8000-000000000001', 9,
   '{"0": "No connection to a defined coverage pillar, and not flagged as emerging or immediate.", "1": "Loose or incidental connection to a pillar.", "2": "Contributes to a pillar without advancing its depth or throughline.", "3": "Meaningfully advances sustained coverage of a defined pillar.", "4": "Central, planned contribution to a pillar''s sustained coverage arc."}'::jsonb),

  ('Reporting opportunity and readiness',
   'Whether WUWF can actually report this well with realistic access, time, and resources.',
   'This is feasibility, not ambition. A great idea nobody can currently report should score low here even if it scores high elsewhere.',
   5, 'core', 'a1000000-0000-4000-8000-000000000001', 10,
   '{"0": "No realistic access or path to reporting this.", "1": "Significant open questions about access or feasibility.", "2": "Feasible with real but manageable effort.", "3": "Good access and a clear reporting path.", "4": "Ready to report now with strong access and a clear plan."}'::jsonb),

  ('Institutional public-value alignment',
   'Does the pitch create additional public value through a legitimate connection to UWF''s educational, research, cultural, workforce, or regional-service mission?',
   'Score only when a real connection exists — leave this unscored otherwise. This modifier can never rescue a pitch that is promotional, weak on independent merit, or primarily about UWF''s reputation. It rewards genuine public value that happens to connect to UWF, never favorable coverage of UWF itself.',
   1, 'modifier', 'a1000000-0000-4000-8000-000000000001', 11,
   '{"0": "No legitimate connection, or the only connection is promotional/reputational — do not score above 0 for publicity value.", "1": "Incidental connection; negligible additional public value.", "2": "A minor, genuine public-value connection (e.g. a UWF expert as one source among several).", "3": "A clear public-value connection — UWF research, programs, or expertise meaningfully serve the story''s public-service purpose.", "4": "A strong public-value connection central to the story''s usefulness to the public.", "5": "Exceptional public-service value delivered through UWF''s mission — e.g. original UWF research or expertise that is itself the public-interest core of the story."}'::jsonb);

update public.ep_criteria
set scale_min = 0, scale_max = 5
where criterion_type = 'modifier' and profile_id = 'a1000000-0000-4000-8000-000000000001';

-- Immediate / Emerging News profile: urgency, readiness, impact, and service
-- carry more weight; pillar fit is a signal, never a gate (weights sum to 100).

insert into public.ep_criteria
  (name, description, guidance, weight, criterion_type, profile_id, sort_order, anchors)
values
  ('Urgency and public safety impact',
   'How immediate the need to inform the public is — safety, health, access, or a fast-moving public situation.',
   'This is the lead criterion for breaking and urgent coverage: score the cost of not reporting this promptly.',
   22, 'core', 'a1000000-0000-4000-8000-000000000002', 1,
   '{"0": "No urgency; nothing is lost by waiting.", "1": "Mild time sensitivity.", "2": "A real but not safety-critical timing need.", "3": "Meaningful public need to know soon — access, disruption, or a developing situation.", "4": "Immediate public safety, health, or welfare need — the public needs this information now."}'::jsonb),

  ('Public impact',
   'The scale and seriousness of effect on the public — lives, rights, safety, finances, opportunity, public resources, or community life.',
   'Weigh breadth (how many are affected) and depth (how much it matters to those affected).',
   15, 'core', 'a1000000-0000-4000-8000-000000000002', 2,
   '{"0": "No discernible public effect; interest is personal or novelty only.", "1": "Minor or narrow effect on a small group; low stakes.", "2": "Moderate effect on an identifiable community, or meaningful stakes for a smaller group.", "3": "Substantial effect on a broad segment of the audience, or serious stakes for an affected group.", "4": "Major effect on public life, safety, rights, or resources across the listening area."}'::jsonb),

  ('Accountability and civic significance',
   'Whether the reporting examines the use of power, public money, or public trust, and holds an institution or decision-maker to account.',
   'Score on the reporting''s accountability function, not on conflict or controversy for their own sake.',
   12, 'core', 'a1000000-0000-4000-8000-000000000002', 3,
   '{"0": "No accountability dimension.", "1": "Touches on institutions or public decisions without examining them critically.", "2": "Some accountability value — surfaces a decision or practice worth public scrutiny.", "3": "Substantial accountability value — examines how power or public resources are being used.", "4": "High accountability value — original scrutiny of an institution, official, or system with real public consequence."}'::jsonb),

  ('Reporting readiness and source access right now',
   'Whether WUWF can get reliable information and sourcing fast enough to report this responsibly on the needed timeline.',
   'Weigh both access and verification speed — urgent stories still need to be gotten right.',
   15, 'core', 'a1000000-0000-4000-8000-000000000002', 4,
   '{"0": "No credible path to verified information on the needed timeline.", "1": "Access is uncertain or slow relative to the need.", "2": "Workable access with some effort.", "3": "Good access to reliable sources on the needed timeline.", "4": "Strong, ready access to verified information right now."}'::jsonb),

  ('Explanatory and service value',
   'How much the reporting helps the audience understand something complex or act on practical information.',
   'Consider both explanatory value (understanding) and service value (what to do).',
   10, 'core', 'a1000000-0000-4000-8000-000000000002', 5,
   '{"0": "No explanatory or service value.", "1": "Minor clarification of a narrow point.", "2": "Helps the audience understand or navigate a moderately complex issue.", "3": "Substantially clarifies a complex issue or provides genuinely useful service information.", "4": "Makes a complex, consequential subject clearly understandable, or delivers service information listeners will act on now."}'::jsonb),

  ('Audience and community relevance',
   'How directly this connects to WUWF''s audience and the communities in its listening area.',
   'A story can be nationally sourced and still score high here if the local angle is real and specific.',
   10, 'core', 'a1000000-0000-4000-8000-000000000002', 6,
   '{"0": "No identifiable connection to WUWF''s audience or listening area.", "1": "Tenuous or generic local connection.", "2": "Clear relevance to a specific community or audience segment.", "3": "Strong relevance across a substantial part of the listening area.", "4": "Central, immediate relevance to the WUWF audience as a whole."}'::jsonb),

  ('Breadth of perspective and fairness under deadline',
   'Whether the sourcing plan avoids relying on a single official or predictable source despite time pressure.',
   'Speed is not an excuse for one-sided sourcing. Ask what it would take to get at least one more perspective before publication.',
   8, 'core', 'a1000000-0000-4000-8000-000000000002', 7,
   '{"0": "Single source or one-sided by default.", "1": "Minimal additional sourcing planned.", "2": "A workable plan for more than one perspective.", "3": "Clear plan to include affected and responsible parties despite the deadline.", "4": "Strong plan for balanced, verified sourcing on a fast timeline."}'::jsonb),

  ('Coverage-pillar contribution or emerging-issue signal',
   'Whether this connects to a defined coverage pillar, or signals an emerging issue worth tracking as a possible future pillar.',
   'Immediate need is never penalized for falling outside current pillars — use this criterion to flag pattern and priority signal, not to gate urgent coverage.',
   8, 'core', 'a1000000-0000-4000-8000-000000000002', 8,
   '{"0": "No pillar connection and no emerging-issue signal.", "1": "Weak or one-off connection.", "2": "Plausible emerging-issue signal or loose pillar connection.", "3": "Clear connection to a pillar, or a recognizable repeating emerging issue.", "4": "Strong pillar contribution, or a clearly significant emerging issue the newsroom should track."}'::jsonb),

  ('Institutional public-value alignment',
   'Does the pitch create additional public value through a legitimate connection to UWF''s educational, research, cultural, workforce, or regional-service mission?',
   'Score only when a real connection exists — leave this unscored otherwise. This modifier can never rescue a pitch that is promotional, weak on independent merit, or primarily about UWF''s reputation.',
   1, 'modifier', 'a1000000-0000-4000-8000-000000000002', 9,
   '{"0": "No legitimate connection, or the only connection is promotional/reputational — do not score above 0 for publicity value.", "1": "Incidental connection; negligible additional public value.", "2": "A minor, genuine public-value connection.", "3": "A clear public-value connection meaningfully serving the story''s public-service purpose.", "4": "A strong public-value connection central to the story''s usefulness to the public.", "5": "Exceptional public-service value delivered through UWF''s mission."}'::jsonb);

update public.ep_criteria
set scale_min = 0, scale_max = 5
where criterion_type = 'modifier' and profile_id = 'a1000000-0000-4000-8000-000000000002';

-- Scoring scale and modifier threshold --------------------------------------
-- Move the tool-wide (core) scale to 0-4, the requested common scale. Past
-- scores are unaffected: each ep_review_scores row snapshots the scale it
-- was given under (scale_snapshot, and now scale_min_snapshot below).

update public.ep_settings set scale_min = 0, scale_max = 4 where id = true;

alter table public.ep_settings
  add column modifier_min_core_score numeric(4,2) not null default 2.5
    check (modifier_min_core_score >= 0);

comment on column public.ep_settings.modifier_min_core_score is
  'The core weighted score (on the tool-wide scale) a pitch must reach before any modifier value is added to its adjusted priority score. Default 2.5 of 0-4 is "solidly above the midpoint" — configurable by editors in Settings → Rubric. See docs/editorial-planning-design.md §4A for the full formula.';

-- ep_review_scores: track scale_min alongside the existing scale_snapshot so
-- a criterion with a non-default scale (the modifier) has its full scale
-- preserved historically, not just its max.

alter table public.ep_review_scores add column scale_min_snapshot integer not null default 1;
alter table public.ep_review_scores alter column scale_min_snapshot drop default;

comment on column public.ep_review_scores.scale_min_snapshot is
  'Backfilled to 1 for scores given before this column existed (the tool-wide scale was 1-5 at the time). New rows always set this explicitly.';

-- ep_reviews: reviewer recommendation + structured concern flags -----------
-- Nullable at the database level so historical reviews stay valid; the
-- submitReview action requires a recommendation for new submissions.

alter table public.ep_reviews
  add column recommendation text check (recommendation in (
    'advance', 'advance_with_revisions', 'hold_for_development', 'needs_more_reporting',
    'defer', 'decline', 'route_to_immediate_news'
  )),
  add column concern_flags text[] not null default '{}' check (
    concern_flags <@ array[
      'focus_scope', 'reporting_path', 'duplication', 'resource_conflict',
      'viewpoint_breadth', 'framing', 'verification', 'ethics_harm', 'editorial_independence'
    ]::text[]
  );

comment on column public.ep_reviews.recommendation is
  'A reviewer''s structured recommendation, distinct from numeric scores — see docs/editorial-planning-design.md §4B. Null on reviews given before this column existed.';
comment on column public.ep_reviews.concern_flags is
  'Zero or more structured concern flags a reviewer raises alongside their scores. Kept lightweight and optional, same as the free-text comment.';

-- ep_meetings: which rubric profile the slate scores against ---------------

alter table public.ep_meetings
  add column rubric_profile_id uuid references public.ep_rubric_profiles (id)
    default 'a1000000-0000-4000-8000-000000000001';

update public.ep_meetings set rubric_profile_id = 'a1000000-0000-4000-8000-000000000001'
where rubric_profile_id is null;

alter table public.ep_meetings alter column rubric_profile_id set not null;

comment on column public.ep_meetings.rubric_profile_id is
  'The rubric profile this meeting''s slate is scored against (defaults to Strategic/Enterprise). Reviewers only score the active criteria belonging to this profile.';

-- Post-selection story planning ----------------------------------------------
-- A narrowly-scoped phase after a pitch is assigned: one story plan per
-- pitch, a small draft -> ready_for_editor -> approved lifecycle, and fields
-- that foreground viewpoint diversity (missing-perspective assessment,
-- source-concentration risk, framing risk) per design §5A. This is not a
-- production-tracking suite — no Kanban, no time tracking, no calendar.

create table public.ep_story_plans (
  id                              uuid primary key default gen_random_uuid(),
  pitch_id                        uuid not null references public.ep_pitches (id) on delete cascade,
  status                          text not null default 'draft'
                                    check (status in ('draft', 'ready_for_editor', 'approved')),
  central_question                text,
  public_service_value            text,
  frame_scope                     text,
  deliverables                    text,
  reporting_evidence_map          text,
  people_affected                 text,
  decision_makers                 text,
  expert_experiential_sources     text,
  main_interpretations            text,
  missing_perspective_assessment  text,
  source_concentration_risks      text,
  framing_risks                   text,
  key_claims_to_verify            text,
  records_data_needed             text,
  otr_requirements                text,
  otr_status                      text not null default 'not_yet_sought'
                                    check (otr_status in
                                      ('not_applicable', 'not_yet_sought', 'in_progress', 'declined', 'obtained')),
  standards_flags                 text[] not null default '{}' check (
                                     standards_flags <@ array[
                                       'ethics_harm', 'editorial_independence', 'verification', 'framing'
                                     ]::text[]
                                   ),
  reporter_id                     uuid references public.profiles (id) on delete set null,
  editor_id                       uuid references public.profiles (id) on delete set null,
  target_window                   text,
  created_by                      uuid references public.profiles (id) on delete set null,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique (pitch_id)
);

comment on table public.ep_story_plans is
  'Post-selection story planning: one row per pitch, created once a pitch is assigned. Deliberately narrow — confirmed question, evidence/source map, and viewpoint-diversity fields (missing_perspective_assessment, source_concentration_risks, framing_risks). Not a production-tracking system: no Kanban, time tracking, or calendar.';
comment on column public.ep_story_plans.otr_status is
  'Opportunity-to-respond status. not_applicable covers stories with no subject who owes a right of reply.';
comment on column public.ep_story_plans.missing_perspective_assessment is
  'What perspective is still missing from the sourcing plan and how it will be sought — the interface should make clear that breadth does not mean artificial partisan symmetry or equal treatment of unequal evidence (see docs/editorial-planning-design.md §5A).';

create trigger set_ep_story_plans_updated_at
  before update on public.ep_story_plans
  for each row execute function public.set_updated_at();

create table public.ep_story_plan_milestones (
  id             uuid primary key default gen_random_uuid(),
  story_plan_id  uuid not null references public.ep_story_plans (id) on delete cascade,
  label          text not null,
  target_date    date,
  completed      boolean not null default false,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index ep_story_plan_milestones_story_plan_id_idx
  on public.ep_story_plan_milestones (story_plan_id);

-- RLS -------------------------------------------------------------------------

alter table public.ep_rubric_profiles enable row level security;
alter table public.ep_story_plans enable row level security;
alter table public.ep_story_plan_milestones enable row level security;

grant select, insert, update, delete on public.ep_rubric_profiles to authenticated;
grant select, insert, update on public.ep_story_plans to authenticated;
grant select, insert, update, delete on public.ep_story_plan_milestones to authenticated;

create policy ep_rubric_profiles_select_members on public.ep_rubric_profiles
  for select to authenticated
  using (private.ep_has_access(auth.uid()));

create policy ep_rubric_profiles_write_editors on public.ep_rubric_profiles
  for all to authenticated
  using (private.ep_is_editor(auth.uid()))
  with check (private.ep_is_editor(auth.uid()));

-- Story plans: visible to every tool member (same as pitches/meetings).
-- Writable by editors always; writable by the assigned reporter while the
-- pitch is assigned and the plan isn't yet approved — approval is an
-- editor-only action by construction (the reporter policy's check clause
-- never allows status = 'approved').

create policy ep_story_plans_select_members on public.ep_story_plans
  for select to authenticated
  using (private.ep_has_access(auth.uid()));

create policy ep_story_plans_insert on public.ep_story_plans
  for insert to authenticated
  with check (
    private.ep_is_editor(auth.uid())
    or (
      reporter_id = auth.uid()
      and exists (
        select 1 from public.ep_pitches p
        where p.id = pitch_id and p.assigned_to = auth.uid() and p.status = 'assigned'
      )
    )
  );

create policy ep_story_plans_update on public.ep_story_plans
  for update to authenticated
  using (
    private.ep_is_editor(auth.uid())
    or (reporter_id = auth.uid() and status <> 'approved')
  )
  with check (
    private.ep_is_editor(auth.uid())
    or (reporter_id = auth.uid() and status <> 'approved')
  );

create policy ep_story_plan_milestones_select_members on public.ep_story_plan_milestones
  for select to authenticated
  using (private.ep_has_access(auth.uid()));

create policy ep_story_plan_milestones_write on public.ep_story_plan_milestones
  for all to authenticated
  using (
    private.ep_is_editor(auth.uid())
    or exists (
      select 1 from public.ep_story_plans sp
      where sp.id = story_plan_id and sp.reporter_id = auth.uid() and sp.status <> 'approved'
    )
  )
  with check (
    private.ep_is_editor(auth.uid())
    or exists (
      select 1 from public.ep_story_plans sp
      where sp.id = story_plan_id and sp.reporter_id = auth.uid() and sp.status <> 'approved'
    )
  );
