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
  tool_audience uuid;
  tool_roadmap uuid;
  tool_log uuid;
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
    -- Audience Listening's registry row, like the Transcription Workspace's,
    -- is now maintained by its own schema migration
    -- (20260730170000_audience_listening.sql) rather than here. This row is
    -- left in place for a database seeded before that migration existed; the
    -- `on conflict do nothing` means the migration's values win either way.
    ('audience-listening', 'Audience Listening',
     'Collect recorded answers from the public to a short set of questions, and review them here.',
     '/audience-listening', 'available', true, 'invite_only', 4)
  on conflict (key) do nothing;

  select id into tool_editorial from public.tools where key = 'editorial-planning';
  select id into tool_remote from public.tools where key = 'remote-interview';
  -- Transcription Workspace's registry row is inserted by its own schema
  -- migration (20260722130000_transcription_workspace_schema.sql), not
  -- here — this just looks it up to seed local tool_access grants.
  select id into tool_transcription from public.tools where key = 'transcription';
  select id into tool_audience from public.tools where key = 'audience-listening';
  -- Roadmap's registry row comes from 20260801121000_roadmap.sql. There is no
  -- seed row for it at all: unlike the others it is default_access =
  -- 'approved_staff', and a seed row inserted with different values would win
  -- over the migration's via `on conflict do nothing` and quietly close the
  -- tool to everyone without a grant.
  select id into tool_roadmap from public.tools where key = 'roadmap';
  -- Log's registry row comes from 20260806130000_log_foundation.sql — this
  -- just looks it up to seed local tool_access grants, same as transcription
  -- and remote-interview above.
  select id into tool_log from public.tools where key = 'log';

  -- Editorial tool roles use the canonical lowercase set the tool interprets:
  -- 'contributor' < 'reviewer' < 'editor' (anything else falls back to contributor).
  insert into public.tool_access (user_id, tool_id, tool_role, granted_by)
  values
    (dana_id, tool_editorial, 'editor', dana_id),
    (marcus_id, tool_editorial, 'contributor', dana_id),
    (leo_id, tool_editorial, 'reviewer', dana_id),
    (marcus_id, tool_remote, 'contributor', dana_id),
    (dana_id, tool_transcription, null, dana_id),
    (marcus_id, tool_transcription, null, dana_id),
    -- Audience Listening has no tool roles: a grant is the whole permission,
    -- and any member can do everything. Dana holds transcription access too,
    -- which is what the per-answer handoff needs.
    (dana_id, tool_audience, null, dana_id),
    (marcus_id, tool_audience, null, dana_id),
    -- Roadmap inverts the usual meaning of a grant: everyone already has
    -- access, so this row exists only to make Dana a curator. Nobody else
    -- needs one to post, vote, or comment.
    (dana_id, tool_roadmap, 'curator', dana_id),
    -- Log is invite_only like Academic Partnerships, not open like Roadmap
    -- (see CLAUDE.md) — a grant is the ticket in. Dana is a producer (clocks,
    -- programs, schedule); Grace and Marcus are plain members, matching the
    -- design's "content authorship is open to any tool member" framing for
    -- the content library (Workflow C).
    (dana_id, tool_log, 'producer', dana_id),
    (grace_id, tool_log, null, dana_id),
    (marcus_id, tool_log, null, dana_id)
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
-- refinement migration itself (20260730130000).

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
    (p_beach, f_primary_pillar, to_jsonb('Growth and Resilience'::text)),
    (p_beach, f_pillar_contribution, to_jsonb('Establishes the funding-mechanism throughline we''ll need for future resilience coverage as storms intensify.'::text)),
    (p_beach, f_format, to_jsonb('Standard story'::text)),
    (p_beach, f_urgency, to_jsonb('Time-bound / known date'::text)),
    (p_shrimp, f_summary, to_jsonb('Gulf shrimpers say this season could be the worst in a decade; imports and fuel costs are squeezing the fleet.'::text)),
    (p_shrimp, f_why_now, to_jsonb('Season opens in six weeks; boats are deciding now whether to go out at all.'::text)),
    (p_shrimp, f_primary_pillar, to_jsonb('Affordability and Opportunity'::text)),
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
    (p_bridge, f_primary_pillar, to_jsonb('Power and Politics'::text)),
    (p_bridge, f_pillar_contribution, to_jsonb('Tests whether public-notice requirements are being met — a pattern worth tracking across other authorities.'::text)),
    (p_bridge, f_urgency, to_jsonb('Time-bound / known date'::text)),
    (p_housing, f_summary, to_jsonb('UWF enrollment growth is outpacing dorm capacity and off-campus rents are climbing.'::text)),
    (p_housing, f_primary_pillar, to_jsonb('Affordability and Opportunity'::text))
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

-- Log content library sample data -----------------------------------------
-- Adapted from a real WUWF-FM Friday program log: the network programs, air
-- times, and short local features it shows already match what
-- 20260806150000_log_seed_npr_clocks.sql and its follow-up corrections
-- seeded for log_programs/log_schedule/log_clock_*, so there's nothing to
-- add there. log_content_items was still empty. This is not a transcription
-- of that log's underwriting credits — docs/log-design.md is explicit that
-- "Underwriting credits are deliberately not a Log content type" (see
-- "Deferred: the Underwriting boundary"), and log_content_type has no
-- underwriting_credit value. Instead this exercises all nine real content
-- types with items a station like the one in that log would actually keep
-- in its library: a legal ID, a university announcement (WUWF is licensed
-- to UWF, echoing the log's constant "UW Credit" breaks), station and
-- program promos, a membership message, a community PSA, a news brief, and
-- the short local/produced features the log shows airing inside Morning
-- Edition/1A/All Things Considered (Unearthing Florida, Climate
-- Connections, BirdNote Daily, Sound Beat, Eco Minute) — none of which have
-- their own log_programs row, matching how the log itself treats them as
-- inserts within an hour rather than scheduled programs.
do $$
declare
  dana_id uuid := '10000000-0000-0000-0000-000000000001';
  marcus_id uuid := '10000000-0000-0000-0000-000000000002';
  grace_id uuid := '10000000-0000-0000-0000-000000000005';
  prog_morning_edition uuid;
  prog_1a uuid;
  prog_atc uuid;
  i_legal_id uuid := '70000000-0000-0000-0000-000000000001';
  i_uwf_announcement uuid := '70000000-0000-0000-0000-000000000002';
  i_book_club_promo uuid := '70000000-0000-0000-0000-000000000003';
  i_sci_friday_promo uuid := '70000000-0000-0000-0000-000000000004';
  i_1a_promo uuid := '70000000-0000-0000-0000-000000000005';
  i_membership uuid := '70000000-0000-0000-0000-000000000006';
  i_hurricane_psa uuid := '70000000-0000-0000-0000-000000000007';
  i_budget_news uuid := '70000000-0000-0000-0000-000000000008';
  i_unearthing_fl uuid := '70000000-0000-0000-0000-000000000009';
  i_climate_connections uuid := '70000000-0000-0000-0000-00000000000a';
  i_birdnote uuid := '70000000-0000-0000-0000-00000000000b';
  i_sound_beat uuid := '70000000-0000-0000-0000-00000000000c';
  i_eco_minute uuid := '70000000-0000-0000-0000-00000000000d';
begin
  select id into prog_morning_edition from public.log_programs where name = 'Morning Edition';
  select id into prog_1a from public.log_programs where name = '1A';
  select id into prog_atc from public.log_programs where name = 'All Things Considered';

  insert into public.log_content_items (
    id, content_type, title, script, summary, expected_duration_seconds,
    effective_from, effective_to, owner_id, approval_status, eligible_program_ids,
    priority, frequency_guidance, reusable, geography_tags, subject_tags,
    community_issue_tags, reporter_or_editor, created_by
  ) values
    (i_legal_id, 'legal_id', 'WUWF-FM Station Legal ID',
     'WUWF-FM Pensacola, a public service of the University of West Florida.',
     'Top-of-hour legal station identification.', 10,
     current_date, null, dana_id, 'approved', '{}'::uuid[],
     1, 'Read live at the top of every hour, immediately after the network billboard.', true,
     '{"Pensacola, FL"}', '{}', '{}', null, dana_id),
    (i_uwf_announcement, 'university_announcement', 'UWF Fall Move-In Weekend',
     null, 'Announcement of fall move-in weekend dates for University of West Florida students.', null,
     current_date, (current_date + interval '30 days')::date, dana_id, 'approved',
     array[prog_morning_edition, prog_atc], 2,
     'Air twice daily on Morning Edition and All Things Considered through move-in weekend.', false,
     '{"Pensacola, FL"}', '{"education","University of West Florida"}', '{"higher education"}',
     null, dana_id),
    (i_book_club_promo, 'station_promo', 'WUWF Book Club Promo',
     'The WUWF Book Club invites you to join fellow readers for our next discussion. Visit WUWF dot org and click the Book Club logo for details, and follow us on Facebook for upcoming salon announcements.',
     'Promotes the WUWF Book Club reading and discussion series.', null,
     current_date, null, grace_id, 'approved', '{}'::uuid[],
     3, 'Rotate during weekday breaks, roughly twice a day.', true,
     '{"Pensacola, FL"}', '{"books","community"}', '{}', null, grace_id),
    (i_sci_friday_promo, 'program_promo', 'Science Friday Tune-In Promo',
     'Every Friday afternoon at one o''clock, join Science Friday on WUWF for conversations about the science shaping our world.',
     'Promotes the Friday 1pm Science Friday broadcast.', 20,
     current_date, null, dana_id, 'approved', array[prog_morning_edition, prog_atc],
     4, 'Air Thursday and Friday mornings ahead of the 1pm broadcast.', true,
     '{}', '{"science"}', '{}', null, dana_id),
    (i_1a_promo, 'program_promo', '1A Weekday Promo',
     'Join 1A weekdays at nine for the conversations shaping the day.',
     'Promotes the weekday 9am 1A broadcast.', 15,
     (current_date - interval '90 days')::date, (current_date - interval '10 days')::date, dana_id, 'retired',
     array[prog_morning_edition], 5, 'Air weekday mornings ahead of the 9am broadcast.', true,
     '{}', '{}', '{}', null, dana_id),
    (i_membership, 'membership_message', 'Become a WUWF Member',
     'WUWF is listener-supported public media. If you value what you hear, become a member today at WUWF dot org slash donate. Thank you for keeping this station strong.',
     'General membership appeal, outside pledge drives.', null,
     current_date, null, grace_id, 'approved', '{}'::uuid[],
     2, 'Rotate during pledge periods and as a general membership reminder otherwise.', true,
     '{}', '{}', '{}', null, grace_id),
    (i_hurricane_psa, 'psa', 'Hurricane Season Preparedness',
     'Hurricane season runs June through November. Escambia County Emergency Management urges residents to have a family plan, a seven-day supply kit, and to know their evacuation zone before a storm approaches. More information is available at myescambia dot com slash emergency.',
     'Community PSA on hurricane preparedness.', 30,
     current_date, null, grace_id, 'approved', '{}'::uuid[],
     1, 'Air daily June through November, more frequently as storms approach.', true,
     '{"Escambia County, FL","Santa Rosa County, FL"}', '{"severe weather","public safety"}',
     '{"hurricane preparedness"}', null, grace_id),
    (i_budget_news, 'news', 'County Budget Vote Preview',
     'The Escambia County Commission is set to vote Tuesday on next year''s budget, including funding for beach renourishment and shelter capacity upgrades. WUWF will have details as the vote approaches.',
     'Local news brief previewing the upcoming county budget vote.', 30,
     current_date, null, grace_id, 'draft', array[prog_morning_edition, prog_atc],
     null, null, false, '{"Escambia County, FL"}', '{"local government","budget"}', '{}',
     'Grace Whitfield', grace_id),
    (i_unearthing_fl, 'interview_feature', 'Unearthing Florida',
     null, 'Weekly feature on Florida history and archaeology.', 90,
     current_date, null, dana_id, 'approved', array[prog_morning_edition],
     6, 'Airs Fridays during the second Morning Edition hour.', true,
     '{"Florida"}', '{"history","archaeology"}', '{}', null, dana_id),
    (i_climate_connections, 'interview_feature', 'Climate Connections',
     null, 'Weekly feature on climate science and its local impact.', 90,
     current_date, null, dana_id, 'approved', array[prog_1a],
     6, 'Airs Fridays during 1A.', true,
     '{}', '{"climate","environment"}', '{}', null, dana_id),
    (i_birdnote, 'interview_feature', 'BirdNote Daily',
     null, 'Daily short feature on birds and wildlife.', 105,
     current_date, null, dana_id, 'approved', array[prog_morning_edition],
     7, 'Airs daily during the second Morning Edition hour.', true,
     '{}', '{"wildlife","nature"}', '{}', null, dana_id),
    (i_sound_beat, 'host_created', 'Sound Beat',
     null, 'Short daily science feature produced with University of West Florida.', 90,
     current_date, null, marcus_id, 'approved', array[prog_1a],
     7, 'Airs weekdays during 1A.', true,
     '{}', '{"science"}', '{}', 'Marcus Bell', marcus_id),
    (i_eco_minute, 'host_created', 'Eco Minute',
     null, 'Short daily feature on local environmental topics.', 60,
     current_date, null, grace_id, 'approved', array[prog_atc],
     8, 'Airs weekdays during the All Things Considered afternoon break.', true,
     '{}', '{"environment"}', '{"environment"}', null, grace_id)
  on conflict (id) do nothing;

  -- Components for the three items built from a live intro/recorded
  -- audio/live outro or tag breakdown, per docs/log-design.md §2 — total
  -- occupied time is the sum of required components, never the item's own
  -- expected_duration_seconds (left null above for exactly these three).
  -- The Book Club promo's 30s + 8s split deliberately mirrors that design
  -- doc's own "30-second promo with a required 8-second outro" example.
  insert into public.log_content_components (
    id, content_item_id, component_type, sequence, duration_seconds, required, script
  ) values
    ('71000000-0000-0000-0000-000000000001', i_uwf_announcement, 'live_intro', 1, 5, true,
     'A note from the University of West Florida:'),
    ('71000000-0000-0000-0000-000000000002', i_uwf_announcement, 'recorded_audio', 2, 25, true, null),
    ('71000000-0000-0000-0000-000000000003', i_book_club_promo, 'recorded_audio', 1, 30, true, null),
    ('71000000-0000-0000-0000-000000000004', i_book_club_promo, 'live_outro', 2, 8, true,
     'For details, visit WUWF dot org slash book club.'),
    ('71000000-0000-0000-0000-000000000005', i_membership, 'recorded_audio', 1, 25, true, null),
    ('71000000-0000-0000-0000-000000000006', i_membership, 'optional_tag', 2, 10, false,
     'Text WUWF to 51555 to give.')
  on conflict (id) do nothing;
end $$;
