-- Local development seed data only. Never run against a production project.
-- Sample names/emails are illustrative placeholders, not real WUWF staff.
--
-- Auth users are inserted directly into auth.users, which is the standard way
-- to seed Supabase Auth locally. handle_new_auth_user() (see
-- 20260722120000_platform_schema.sql) then creates the matching profiles row
-- automatically; this script adjusts account_status afterward for demo variety.

do $$
declare
  dana_id uuid := '10000000-0000-0000-0000-000000000001';
  marcus_id uuid := '10000000-0000-0000-0000-000000000002';
  priya_id uuid := '10000000-0000-0000-0000-000000000003';
  sam_id uuid := '10000000-0000-0000-0000-000000000004';
  grace_id uuid := '10000000-0000-0000-0000-000000000005';
  leo_id uuid := '10000000-0000-0000-0000-000000000006';
  tool_editorial uuid;
  tool_remote uuid;
  tool_transcription uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values
    ('00000000-0000-0000-0000-000000000000', dana_id, 'authenticated', 'authenticated',
     'dana.ruiz@wuwf.org', extensions.crypt('wuwf-local-dev', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     jsonb_build_object('display_name', 'Dana Ruiz', 'platform_role', 'administrator'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', marcus_id, 'authenticated', 'authenticated',
     'm.bell@students.uwf.edu', extensions.crypt('wuwf-local-dev', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     jsonb_build_object('display_name', 'Marcus Bell', 'platform_role', 'student'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', priya_id, 'authenticated', 'authenticated',
     'p.anand@uwf.edu', extensions.crypt('wuwf-local-dev', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     jsonb_build_object('display_name', 'Priya Anand', 'platform_role', 'faculty_partner'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', sam_id, 'authenticated', 'authenticated',
     'sam.okafor@wuwf.org', extensions.crypt('wuwf-local-dev', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     jsonb_build_object('display_name', 'Sam Okafor', 'platform_role', 'student'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', grace_id, 'authenticated', 'authenticated',
     'grace.whitfield@wuwf.org', extensions.crypt('wuwf-local-dev', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     jsonb_build_object('display_name', 'Grace Whitfield', 'platform_role', 'staff'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', leo_id, 'authenticated', 'authenticated',
     'leo.fischer@uwf.edu', extensions.crypt('wuwf-local-dev', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     jsonb_build_object('display_name', 'Leo Fischer', 'platform_role', 'faculty_partner'),
     now(), now(), '', '', '', '')
  on conflict (id) do nothing;

  -- Vary account_status beyond the trigger's default 'invited' so every state
  -- in the design (active, invited, pending, disabled) has a real example.
  update public.profiles set account_status = 'active', last_active_at = now() - interval '1 day'
    where id = dana_id;
  update public.profiles set account_status = 'active', last_active_at = now() - interval '2 days'
    where id = marcus_id;
  update public.profiles set account_status = 'invited'
    where id = priya_id;
  update public.profiles set account_status = 'pending'
    where id = sam_id;
  update public.profiles set account_status = 'disabled', last_active_at = now() - interval '50 days'
    where id = grace_id;
  update public.profiles set account_status = 'active', last_active_at = now() - interval '4 days'
    where id = leo_id;

  insert into public.tools (key, name, description, route, status, enabled, default_access, sort_order)
  values
    ('editorial-planning', 'Editorial Planning',
     'Submit, review, and evaluate story pitches for editorial meetings.',
     '/editorial', 'available', true, 'invite_only', 1),
    ('remote-interview', 'Remote Interview',
     'Record, transcribe, and edit remote audio and video interviews.',
     '/tools/remote-interview', 'in_development', true, 'invite_only', 2),
    -- No Shared Clip Library row: the Transcription Workspace absorbed it
    -- (see docs/transcription-workspace-design.md §3F — the cross-project
    -- clip and search views are the clip library), so it was retired from
    -- the registry rather than left as a placeholder nobody will build.
    ('audience-listening', 'Audience Listening',
     'Organize and analyze structured audience input.',
     '/tools/audience-listening', 'planned', true, 'invite_only', 4)
  on conflict (key) do nothing;

  select id into tool_editorial from public.tools where key = 'editorial-planning';
  select id into tool_remote from public.tools where key = 'remote-interview';
  -- Transcription Workspace's registry row is inserted by its own schema
  -- migration (20260722130000_transcription_workspace_schema.sql), not
  -- here — this just looks it up to seed local tool_access grants.
  select id into tool_transcription from public.tools where key = 'transcription';

  -- Editorial tool roles use the canonical lowercase set the tool interprets:
  -- 'contributor' < 'reviewer' < 'editor' (anything else falls back to contributor).
  insert into public.tool_access (user_id, tool_id, tool_role, granted_by)
  values
    (dana_id, tool_editorial, 'editor', dana_id),
    (marcus_id, tool_editorial, 'contributor', dana_id),
    (leo_id, tool_editorial, 'reviewer', dana_id),
    (marcus_id, tool_remote, 'contributor', dana_id),
    (dana_id, tool_transcription, null, dana_id),
    (marcus_id, tool_transcription, null, dana_id)
  on conflict do nothing;

  insert into public.access_requests (email, display_name, note, status)
  values (
    'jordan.mays@wuwf.org', 'Jordan Mays',
    'Newsroom intern starting this semester — requesting Editorial Planning access.',
    'pending'
  );

  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values
    (dana_id, 'user.invited', 'profile', marcus_id::text,
     jsonb_build_object('email', 'm.bell@students.uwf.edu')),
    (dana_id, 'tool_access.granted', 'tool_access', tool_editorial::text,
     jsonb_build_object('user_id', marcus_id, 'tool_role', 'contributor'));
end $$;

-- Editorial Planning sample data ----------------------------------------------
-- One concluded meeting (with revealed reviews, recommendations, an
-- institutional-modifier score, and decisions), one open meeting mid-scoring
-- (reviews still hidden from other reviewers), a backlog that exercises every
-- pitch state and pillar option (including the "immediate public need"
-- status option), and a story plan for the assigned pitch. Default form
-- fields, rubric criteria, and rubric profiles come from the strategic
-- refinement migration itself (20260730120000).

do $$
declare
  strategic_profile uuid := 'a1000000-0000-4000-8000-000000000001';
  dana_id uuid := '10000000-0000-0000-0000-000000000001';
  marcus_id uuid := '10000000-0000-0000-0000-000000000002';
  leo_id uuid := '10000000-0000-0000-0000-000000000006';
  f_summary uuid;
  f_central_question uuid;
  f_why_now uuid;
  f_public_stakes uuid;
  f_reporting_approach uuid;
  f_perspectives uuid;
  f_primary_pillar uuid;
  f_pillar_contribution uuid;
  f_format uuid;
  f_urgency uuid;
  f_sources_materials uuid;
  c_impact uuid;
  c_audience uuid;
  c_timeliness uuid;
  c_accountability uuid;
  c_originality uuid;
  c_explanatory uuid;
  c_narrative uuid;
  c_breadth uuid;
  c_pillar uuid;
  c_readiness uuid;
  c_modifier uuid;
  p_beach uuid := '20000000-0000-0000-0000-000000000001';
  p_shrimp uuid := '20000000-0000-0000-0000-000000000002';
  p_hurricane uuid := '20000000-0000-0000-0000-000000000003';
  p_bridge uuid := '20000000-0000-0000-0000-000000000004';
  p_housing uuid := '20000000-0000-0000-0000-000000000005';
  m_last uuid := '30000000-0000-0000-0000-000000000001';
  m_next uuid := '30000000-0000-0000-0000-000000000002';
  sp_hurricane uuid := '60000000-0000-0000-0000-000000000001';
begin
  select id into f_summary from public.ep_form_fields where key = 'summary' and active;
  select id into f_central_question from public.ep_form_fields where key = 'central_question' and active;
  select id into f_why_now from public.ep_form_fields where key = 'why_now' and active;
  select id into f_public_stakes from public.ep_form_fields where key = 'public_stakes' and active;
  select id into f_reporting_approach from public.ep_form_fields where key = 'reporting_approach' and active;
  select id into f_perspectives from public.ep_form_fields where key = 'perspectives' and active;
  select id into f_primary_pillar from public.ep_form_fields where key = 'primary_pillar' and active;
  select id into f_pillar_contribution from public.ep_form_fields where key = 'pillar_contribution' and active;
  select id into f_format from public.ep_form_fields where key = 'format' and active;
  select id into f_urgency from public.ep_form_fields where key = 'urgency' and active;
  select id into f_sources_materials from public.ep_form_fields where key = 'sources_materials' and active;

  select id into c_impact from public.ep_criteria where name = 'Public impact' and profile_id = strategic_profile;
  select id into c_audience from public.ep_criteria where name = 'Audience and community relevance' and profile_id = strategic_profile;
  select id into c_timeliness from public.ep_criteria where name = 'Timeliness and strategic moment' and profile_id = strategic_profile;
  select id into c_accountability from public.ep_criteria where name = 'Accountability and civic significance' and profile_id = strategic_profile;
  select id into c_originality from public.ep_criteria where name = 'Originality and discovery' and profile_id = strategic_profile;
  select id into c_explanatory from public.ep_criteria where name = 'Explanatory and service value' and profile_id = strategic_profile;
  select id into c_narrative from public.ep_criteria where name = 'Human and narrative potential' and profile_id = strategic_profile;
  select id into c_breadth from public.ep_criteria where name = 'Breadth of perspective and community representation' and profile_id = strategic_profile;
  select id into c_pillar from public.ep_criteria where name = 'Coverage-pillar contribution' and profile_id = strategic_profile;
  select id into c_readiness from public.ep_criteria where name = 'Reporting opportunity and readiness' and profile_id = strategic_profile;
  select id into c_modifier from public.ep_criteria where name = 'Institutional public-value alignment' and profile_id = strategic_profile;

  insert into public.ep_pitches (id, title, status, submitted_by, assigned_to, archived_reason, archived_by, archived_at, created_at)
  values
    (p_beach, 'Beach renourishment funding decision', 'open', marcus_id, null, null, null, null, now() - interval '3 days'),
    (p_shrimp, 'Shrimping season outlook', 'open', marcus_id, null, null, null, null, now() - interval '12 days'),
    (p_hurricane, 'Hurricane season preparedness gaps', 'assigned', dana_id, marcus_id, null, null, null, now() - interval '10 days'),
    (p_bridge, 'Bridge toll public comment period', 'open', dana_id, null, null, null, null, now() - interval '34 days'),
    (p_housing, 'Campus housing crunch', 'archived', leo_id, null, 'Covered in depth by regional partners this spring.', dana_id, now() - interval '7 days', now() - interval '40 days')
  on conflict (id) do nothing;

  insert into public.ep_pitch_values (pitch_id, field_id, value)
  values
    (p_beach, f_summary, to_jsonb('The county commission votes next month on renourishment funding after two years of erosion complaints from Pensacola Beach businesses.'::text)),
    (p_beach, f_central_question, to_jsonb('Who actually pays for renourishment as storms make it a more frequent expense — and is the funding formula keeping up?'::text)),
    (p_beach, f_why_now, to_jsonb('The vote is scheduled and the comment docket closes in three weeks.'::text)),
    (p_beach, f_public_stakes, to_jsonb('Beachfront property values, tourism revenue, and the county''s long-term storm budget all ride on this formula.'::text)),
    (p_beach, f_reporting_approach, to_jsonb('County budget records, commission meeting minutes, interviews with the erosion-control engineer and two beachfront business owners.'::text)),
    (p_beach, f_perspectives, to_jsonb('Beachfront businesses, county budget staff, residents who oppose the tax increase.'::text)),
    (p_beach, f_primary_pillar, to_jsonb('Coastal & environmental resilience'::text)),
    (p_beach, f_pillar_contribution, to_jsonb('Establishes the funding-mechanism throughline we''ll need for future resilience coverage as storms intensify.'::text)),
    (p_beach, f_format, to_jsonb('Standard story'::text)),
    (p_beach, f_urgency, to_jsonb('Time-bound / known date'::text)),
    (p_shrimp, f_summary, to_jsonb('Gulf shrimpers say this season could be the worst in a decade; imports and fuel costs are squeezing the fleet.'::text)),
    (p_shrimp, f_why_now, to_jsonb('Season opens in six weeks; boats are deciding now whether to go out at all.'::text)),
    (p_shrimp, f_primary_pillar, to_jsonb('Regional economy & workforce'::text)),
    (p_shrimp, f_sources_materials, to_jsonb('Harbor master at Joe Patti''s, two boat captains from previous reporting.'::text)),
    (p_shrimp, f_format, to_jsonb('Audio feature'::text)),
    (p_shrimp, f_urgency, to_jsonb('Planned / several weeks'::text)),
    (p_hurricane, f_summary, to_jsonb('County shelter capacity has not kept pace with new development east of Nine Mile Road.'::text)),
    (p_hurricane, f_central_question, to_jsonb('If a major storm hit this year, would the county actually have room to shelter everyone who needs it?'::text)),
    (p_hurricane, f_why_now, to_jsonb('Season starts June 1; emergency management presents its plan to the commission in May.'::text)),
    (p_hurricane, f_public_stakes, to_jsonb('Public safety for tens of thousands of residents in newly developed flood-prone areas.'::text)),
    (p_hurricane, f_reporting_approach, to_jsonb('Shelter capacity records, county emergency management plan, interviews with planners and residents in the new developments; UWF''s Haas Center has relevant regional hazard-modeling data.'::text)),
    (p_hurricane, f_perspectives, to_jsonb('New-development residents, emergency management staff, county commissioners who approved the developments.'::text)),
    (p_hurricane, f_primary_pillar, to_jsonb('Immediate public need'::text)),
    (p_hurricane, f_format, to_jsonb('Series / continuing coverage'::text)),
    (p_hurricane, f_urgency, to_jsonb('Planned / several weeks'::text)),
    (p_bridge, f_summary, to_jsonb('The bridge authority opened a public comment period on toll changes with almost no publicity.'::text)),
    (p_bridge, f_why_now, to_jsonb('Comment period closes at the end of the month.'::text)),
    (p_bridge, f_primary_pillar, to_jsonb('Government & public accountability'::text)),
    (p_bridge, f_pillar_contribution, to_jsonb('Tests whether public-notice requirements are being met — a pattern worth tracking across other authorities.'::text)),
    (p_bridge, f_urgency, to_jsonb('Time-bound / known date'::text)),
    (p_housing, f_summary, to_jsonb('UWF enrollment growth is outpacing dorm capacity and off-campus rents are climbing.'::text)),
    (p_housing, f_primary_pillar, to_jsonb('Education & youth opportunity'::text))
  on conflict do nothing;

  -- Last week's meeting: concluded, with a full review record.
  insert into public.ep_meetings (id, meeting_date, status, notes, created_by, agenda_at, concluded_at, created_at, rubric_profile_id)
  values (m_last, (now() - interval '7 days')::date, 'concluded',
          'Short meeting; pushed shrimping to revisit once the season opens.',
          dana_id, now() - interval '8 days', now() - interval '7 days', now() - interval '10 days', strategic_profile)
  on conflict (id) do nothing;

  insert into public.ep_meeting_pitches (id, meeting_id, pitch_id, added_by, outcome, assigned_to, rationale, decided_by, decided_at)
  values
    ('40000000-0000-0000-0000-000000000001', m_last, p_hurricane, dana_id, 'assigned', marcus_id,
     'Strongest scores and a hard deadline; Marcus has the emergency-management contacts.', dana_id, now() - interval '7 days'),
    ('40000000-0000-0000-0000-000000000002', m_last, p_shrimp, dana_id, 'deferred', null,
     'Good story, better once the season actually opens.', dana_id, now() - interval '7 days'),
    ('40000000-0000-0000-0000-000000000003', m_last, p_bridge, dana_id, 'deferred', null,
     null, dana_id, now() - interval '7 days')
  on conflict (id) do nothing;

  -- Reviews for last week's slate, from both reviewers. Dana's hurricane
  -- review also scores the institutional modifier (the Haas Center hazard
  -- data is a genuine public-value connection to UWF, not a promotional one)
  -- — Leo leaves it unscored on the same pitch, showing the modifier is
  -- optional per reviewer, not something everyone must weigh in on.
  insert into public.ep_reviews (id, meeting_pitch_id, reviewer_id, comment, recommendation, concern_flags, submitted_at)
  values
    ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', dana_id,
     'This is the one — shelter capacity numbers alone are a story.', 'advance', '{}', now() - interval '9 days'),
    ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', leo_id,
     'Strong, though the series commitment may be ambitious for one reporter.', 'advance_with_revisions',
     '{resource_conflict}', now() - interval '9 days'),
    ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', dana_id,
     null, 'hold_for_development', '{}', now() - interval '9 days'),
    ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', leo_id,
     'Would land harder with early-season catch numbers in hand.', 'needs_more_reporting', '{}', now() - interval '9 days'),
    ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003', dana_id,
     'Worth a look, but the notice-failure angle needs more reporting before we know if it holds up.',
     'defer', '{verification}', now() - interval '9 days')
  on conflict (id) do nothing;

  insert into public.ep_review_scores (review_id, criterion_id, score, weight_snapshot, scale_snapshot, scale_min_snapshot)
  values
    ('50000000-0000-0000-0000-000000000001', c_impact, 4, 16, 4, 0),
    ('50000000-0000-0000-0000-000000000001', c_audience, 4, 12, 4, 0),
    ('50000000-0000-0000-0000-000000000001', c_timeliness, 3, 8, 4, 0),
    ('50000000-0000-0000-0000-000000000001', c_accountability, 3, 13, 4, 0),
    ('50000000-0000-0000-0000-000000000001', c_originality, 3, 10, 4, 0),
    ('50000000-0000-0000-0000-000000000001', c_explanatory, 4, 9, 4, 0),
    ('50000000-0000-0000-0000-000000000001', c_narrative, 3, 7, 4, 0),
    ('50000000-0000-0000-0000-000000000001', c_breadth, 3, 7, 4, 0),
    ('50000000-0000-0000-0000-000000000001', c_pillar, 2, 13, 4, 0),
    ('50000000-0000-0000-0000-000000000001', c_readiness, 4, 5, 4, 0),
    ('50000000-0000-0000-0000-000000000001', c_modifier, 3, 1, 5, 0),
    ('50000000-0000-0000-0000-000000000002', c_impact, 4, 16, 4, 0),
    ('50000000-0000-0000-0000-000000000002', c_audience, 3, 12, 4, 0),
    ('50000000-0000-0000-0000-000000000002', c_timeliness, 3, 8, 4, 0),
    ('50000000-0000-0000-0000-000000000002', c_accountability, 3, 13, 4, 0),
    ('50000000-0000-0000-0000-000000000002', c_originality, 2, 10, 4, 0),
    ('50000000-0000-0000-0000-000000000002', c_explanatory, 3, 9, 4, 0),
    ('50000000-0000-0000-0000-000000000002', c_narrative, 3, 7, 4, 0),
    ('50000000-0000-0000-0000-000000000002', c_breadth, 2, 7, 4, 0),
    ('50000000-0000-0000-0000-000000000002', c_pillar, 2, 13, 4, 0),
    ('50000000-0000-0000-0000-000000000002', c_readiness, 3, 5, 4, 0),
    ('50000000-0000-0000-0000-000000000003', c_impact, 2, 16, 4, 0),
    ('50000000-0000-0000-0000-000000000003', c_audience, 3, 12, 4, 0),
    ('50000000-0000-0000-0000-000000000003', c_timeliness, 3, 8, 4, 0),
    ('50000000-0000-0000-0000-000000000003', c_accountability, 1, 13, 4, 0),
    ('50000000-0000-0000-0000-000000000003', c_originality, 2, 10, 4, 0),
    ('50000000-0000-0000-0000-000000000003', c_explanatory, 2, 9, 4, 0),
    ('50000000-0000-0000-0000-000000000003', c_narrative, 3, 7, 4, 0),
    ('50000000-0000-0000-0000-000000000003', c_breadth, 2, 7, 4, 0),
    ('50000000-0000-0000-0000-000000000003', c_pillar, 3, 13, 4, 0),
    ('50000000-0000-0000-0000-000000000003', c_readiness, 3, 5, 4, 0),
    ('50000000-0000-0000-0000-000000000004', c_impact, 2, 16, 4, 0),
    ('50000000-0000-0000-0000-000000000004', c_audience, 4, 12, 4, 0),
    ('50000000-0000-0000-0000-000000000004', c_timeliness, 2, 8, 4, 0),
    ('50000000-0000-0000-0000-000000000004', c_accountability, 1, 13, 4, 0),
    ('50000000-0000-0000-0000-000000000004', c_originality, 2, 10, 4, 0),
    ('50000000-0000-0000-0000-000000000004', c_explanatory, 2, 9, 4, 0),
    ('50000000-0000-0000-0000-000000000004', c_narrative, 3, 7, 4, 0),
    ('50000000-0000-0000-0000-000000000004', c_breadth, 2, 7, 4, 0),
    ('50000000-0000-0000-0000-000000000004', c_pillar, 3, 13, 4, 0),
    ('50000000-0000-0000-0000-000000000004', c_readiness, 2, 5, 4, 0),
    ('50000000-0000-0000-0000-000000000005', c_impact, 3, 16, 4, 0),
    ('50000000-0000-0000-0000-000000000005', c_audience, 2, 12, 4, 0),
    ('50000000-0000-0000-0000-000000000005', c_timeliness, 3, 8, 4, 0),
    ('50000000-0000-0000-0000-000000000005', c_accountability, 3, 13, 4, 0),
    ('50000000-0000-0000-0000-000000000005', c_originality, 1, 10, 4, 0),
    ('50000000-0000-0000-0000-000000000005', c_explanatory, 1, 9, 4, 0),
    ('50000000-0000-0000-0000-000000000005', c_narrative, 2, 7, 4, 0),
    ('50000000-0000-0000-0000-000000000005', c_breadth, 1, 7, 4, 0),
    ('50000000-0000-0000-0000-000000000005', c_pillar, 2, 13, 4, 0),
    ('50000000-0000-0000-0000-000000000005', c_readiness, 2, 5, 4, 0)
  on conflict do nothing;

  -- A story plan for the assigned pitch, with viewpoint-diversity fields
  -- filled in and one milestone — the post-selection planning phase.
  insert into public.ep_story_plans (
    id, pitch_id, status, central_question, public_service_value, frame_scope, deliverables,
    reporting_evidence_map, people_affected, decision_makers, expert_experiential_sources,
    main_interpretations, missing_perspective_assessment, source_concentration_risks, framing_risks,
    key_claims_to_verify, records_data_needed, otr_requirements, otr_status, standards_flags,
    reporter_id, editor_id, target_window, created_by
  )
  values (
    sp_hurricane, p_hurricane, 'ready_for_editor',
    'If a major storm hit this year, would the county actually have room to shelter everyone who needs it?',
    'Lets residents in newly developed flood-prone areas find out, before hurricane season starts, whether they have a real evacuation plan.',
    'A three-part series: the capacity gap, who''s affected, and what the county says it will do about it.',
    'Three-part audio series plus a digital capacity map.',
    'County shelter registry, emergency management''s May commission presentation, FEMA flood-zone overlays against recent development permits.',
    'Residents of the Nine Mile Road-area developments, especially renters without their own transportation.',
    'County emergency management director, the commissioners who approved the developments.',
    'UWF Haas Center regional hazard-modeling researchers; a shelter operations volunteer from the last major storm.',
    'County says capacity is adequate under current models; resident groups and some planners dispute the underlying assumptions.',
    'Missing so far: a developer or building-industry perspective on why permitting outpaced shelter planning — being sought for part two.',
    'Emergency management staff are currently the source for most capacity numbers; independent verification against FEMA data is planned before publication.',
    'Risk of implying the county is negligent without also reporting the budget and land-use constraints it is working within — part three should carry that context.',
    'Current shelter capacity figures; whether the May commission presentation reflects post-2024 development.',
    'County shelter registry (public records request filed), FEMA flood-zone GIS layers.',
    'County emergency management given advance notice of part one''s findings; developer perspective still being sought for part two.',
    'in_progress', '{}',
    marcus_id, dana_id, 'Airs ahead of June 1 hurricane season start', dana_id
  )
  on conflict (id) do nothing;

  insert into public.ep_story_plan_milestones (story_plan_id, label, target_date, completed, sort_order)
  values
    (sp_hurricane, 'Public records request filed for shelter registry', (now() - interval '3 days')::date, true, 1),
    (sp_hurricane, 'Emergency management interview', (now() + interval '5 days')::date, false, 2),
    (sp_hurricane, 'Part one airs', (now() + interval '18 days')::date, false, 3)
  on conflict do nothing;

  -- This week's meeting: open, slate picked, one review already in (hidden
  -- from the other reviewer until scoring closes).
  insert into public.ep_meetings (id, meeting_date, status, created_by, created_at, rubric_profile_id)
  values (m_next, (now() + interval '2 days')::date, 'open', dana_id, now() - interval '1 day', strategic_profile)
  on conflict (id) do nothing;

  insert into public.ep_meeting_pitches (id, meeting_id, pitch_id, added_by)
  values
    ('40000000-0000-0000-0000-000000000004', m_next, p_beach, dana_id),
    ('40000000-0000-0000-0000-000000000005', m_next, p_shrimp, dana_id)
  on conflict (id) do nothing;

  insert into public.ep_reviews (id, meeting_pitch_id, reviewer_id, comment, recommendation, concern_flags, submitted_at)
  values
    ('50000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004', leo_id,
     'Commission votes are our bread and butter; easy to turn around.', 'advance', '{}', now() - interval '2 hours')
  on conflict (id) do nothing;

  insert into public.ep_review_scores (review_id, criterion_id, score, weight_snapshot, scale_snapshot, scale_min_snapshot)
  values
    ('50000000-0000-0000-0000-000000000006', c_impact, 3, 16, 4, 0),
    ('50000000-0000-0000-0000-000000000006', c_audience, 4, 12, 4, 0),
    ('50000000-0000-0000-0000-000000000006', c_timeliness, 4, 8, 4, 0),
    ('50000000-0000-0000-0000-000000000006', c_accountability, 2, 13, 4, 0),
    ('50000000-0000-0000-0000-000000000006', c_originality, 2, 10, 4, 0),
    ('50000000-0000-0000-0000-000000000006', c_explanatory, 3, 9, 4, 0),
    ('50000000-0000-0000-0000-000000000006', c_narrative, 2, 7, 4, 0),
    ('50000000-0000-0000-0000-000000000006', c_breadth, 2, 7, 4, 0),
    ('50000000-0000-0000-0000-000000000006', c_pillar, 3, 13, 4, 0),
    ('50000000-0000-0000-0000-000000000006', c_readiness, 4, 5, 4, 0)
  on conflict do nothing;
end $$;
