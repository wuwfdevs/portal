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
  tool_clips uuid;
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
    ('clip-library', 'Shared Clip Library',
     'Search and reuse approved interview excerpts and actualities.',
     '/tools/clip-library', 'in_development', true, 'approved_staff', 3),
    ('audience-listening', 'Audience Listening',
     'Organize and analyze structured audience input.',
     '/tools/audience-listening', 'planned', true, 'invite_only', 4)
  on conflict (key) do nothing;

  select id into tool_editorial from public.tools where key = 'editorial-planning';
  select id into tool_remote from public.tools where key = 'remote-interview';
  select id into tool_clips from public.tools where key = 'clip-library';

  -- Editorial tool roles use the canonical lowercase set the tool interprets:
  -- 'contributor' < 'reviewer' < 'editor' (anything else falls back to contributor).
  insert into public.tool_access (user_id, tool_id, tool_role, granted_by)
  values
    (dana_id, tool_editorial, 'editor', dana_id),
    (marcus_id, tool_editorial, 'contributor', dana_id),
    (leo_id, tool_editorial, 'reviewer', dana_id),
    (marcus_id, tool_remote, 'contributor', dana_id),
    (leo_id, tool_clips, null, dana_id)
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
-- One concluded meeting (with revealed reviews and decisions), one open meeting
-- mid-scoring (reviews still hidden from other reviewers), and a backlog that
-- exercises every pitch state. Default form fields and rubric criteria come
-- from the editorial planning migration itself.

do $$
declare
  dana_id uuid := '10000000-0000-0000-0000-000000000001';
  marcus_id uuid := '10000000-0000-0000-0000-000000000002';
  leo_id uuid := '10000000-0000-0000-0000-000000000006';
  f_summary uuid;
  f_why_now uuid;
  f_sources uuid;
  f_format uuid;
  c_news uuid;
  c_local uuid;
  c_feasibility uuid;
  c_impact uuid;
  p_beach uuid := '20000000-0000-0000-0000-000000000001';
  p_shrimp uuid := '20000000-0000-0000-0000-000000000002';
  p_hurricane uuid := '20000000-0000-0000-0000-000000000003';
  p_bridge uuid := '20000000-0000-0000-0000-000000000004';
  p_housing uuid := '20000000-0000-0000-0000-000000000005';
  m_last uuid := '30000000-0000-0000-0000-000000000001';
  m_next uuid := '30000000-0000-0000-0000-000000000002';
  mp_id uuid;
  review_id uuid;
begin
  select id into f_summary from public.ep_form_fields where key = 'summary';
  select id into f_why_now from public.ep_form_fields where key = 'why_now';
  select id into f_sources from public.ep_form_fields where key = 'sources';
  select id into f_format from public.ep_form_fields where key = 'format';
  select id into c_news from public.ep_criteria where name = 'News value';
  select id into c_local from public.ep_criteria where name = 'Local relevance';
  select id into c_feasibility from public.ep_criteria where name = 'Feasibility';
  select id into c_impact from public.ep_criteria where name = 'Audience impact';

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
    (p_beach, f_why_now, to_jsonb('The vote is scheduled and the comment docket closes in three weeks.'::text)),
    (p_beach, f_format, to_jsonb('Spot news'::text)),
    (p_shrimp, f_summary, to_jsonb('Gulf shrimpers say this season could be the worst in a decade; imports and fuel costs are squeezing the fleet.'::text)),
    (p_shrimp, f_why_now, to_jsonb('Season opens in six weeks; boats are deciding now whether to go out at all.'::text)),
    (p_shrimp, f_sources, to_jsonb('Harbor master at Joe Patti''s, two boat captains from previous reporting.'::text)),
    (p_shrimp, f_format, to_jsonb('Feature'::text)),
    (p_hurricane, f_summary, to_jsonb('County shelter capacity has not kept pace with new development east of Nine Mile Road.'::text)),
    (p_hurricane, f_why_now, to_jsonb('Season starts June 1; emergency management presents its plan to the commission in May.'::text)),
    (p_hurricane, f_format, to_jsonb('Series'::text)),
    (p_bridge, f_summary, to_jsonb('The bridge authority opened a public comment period on toll changes with almost no publicity.'::text)),
    (p_bridge, f_why_now, to_jsonb('Comment period closes at the end of the month.'::text)),
    (p_housing, f_summary, to_jsonb('UWF enrollment growth is outpacing dorm capacity and off-campus rents are climbing.'::text))
  on conflict do nothing;

  -- Last week's meeting: concluded, with a full review record.
  insert into public.ep_meetings (id, meeting_date, status, notes, created_by, agenda_at, concluded_at, created_at)
  values (m_last, (now() - interval '7 days')::date, 'concluded',
          'Short meeting; pushed shrimping to revisit once the season opens.',
          dana_id, now() - interval '8 days', now() - interval '7 days', now() - interval '10 days')
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

  -- Reviews for last week's slate, from both reviewers.
  insert into public.ep_reviews (id, meeting_pitch_id, reviewer_id, comment, submitted_at)
  values
    ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', dana_id,
     'This is the one — shelter capacity numbers alone are a story.', now() - interval '9 days'),
    ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', leo_id,
     'Strong, though the series format may be ambitious for one reporter.', now() - interval '9 days'),
    ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', dana_id,
     null, now() - interval '9 days'),
    ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', leo_id,
     'Would land harder with early-season catch numbers in hand.', now() - interval '9 days'),
    ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003', dana_id,
     null, now() - interval '9 days')
  on conflict (id) do nothing;

  insert into public.ep_review_scores (review_id, criterion_id, score, weight_snapshot, scale_snapshot)
  values
    ('50000000-0000-0000-0000-000000000001', c_news, 5, 1.0, 5),
    ('50000000-0000-0000-0000-000000000001', c_local, 5, 1.0, 5),
    ('50000000-0000-0000-0000-000000000001', c_feasibility, 4, 1.0, 5),
    ('50000000-0000-0000-0000-000000000001', c_impact, 5, 1.0, 5),
    ('50000000-0000-0000-0000-000000000002', c_news, 4, 1.0, 5),
    ('50000000-0000-0000-0000-000000000002', c_local, 5, 1.0, 5),
    ('50000000-0000-0000-0000-000000000002', c_feasibility, 3, 1.0, 5),
    ('50000000-0000-0000-0000-000000000002', c_impact, 4, 1.0, 5),
    ('50000000-0000-0000-0000-000000000003', c_news, 3, 1.0, 5),
    ('50000000-0000-0000-0000-000000000003', c_local, 4, 1.0, 5),
    ('50000000-0000-0000-0000-000000000003', c_feasibility, 4, 1.0, 5),
    ('50000000-0000-0000-0000-000000000003', c_impact, 3, 1.0, 5),
    ('50000000-0000-0000-0000-000000000004', c_news, 3, 1.0, 5),
    ('50000000-0000-0000-0000-000000000004', c_local, 5, 1.0, 5),
    ('50000000-0000-0000-0000-000000000004', c_feasibility, 3, 1.0, 5),
    ('50000000-0000-0000-0000-000000000004', c_impact, 4, 1.0, 5),
    ('50000000-0000-0000-0000-000000000005', c_news, 4, 1.0, 5),
    ('50000000-0000-0000-0000-000000000005', c_local, 3, 1.0, 5),
    ('50000000-0000-0000-0000-000000000005', c_feasibility, 5, 1.0, 5),
    ('50000000-0000-0000-0000-000000000005', c_impact, 2, 1.0, 5)
  on conflict do nothing;

  -- This week's meeting: open, slate picked, one review already in (hidden
  -- from the other reviewer until scoring closes).
  insert into public.ep_meetings (id, meeting_date, status, created_by, created_at)
  values (m_next, (now() + interval '2 days')::date, 'open', dana_id, now() - interval '1 day')
  on conflict (id) do nothing;

  insert into public.ep_meeting_pitches (id, meeting_id, pitch_id, added_by)
  values
    ('40000000-0000-0000-0000-000000000004', m_next, p_beach, dana_id),
    ('40000000-0000-0000-0000-000000000005', m_next, p_shrimp, dana_id)
  on conflict (id) do nothing;

  insert into public.ep_reviews (id, meeting_pitch_id, reviewer_id, comment, submitted_at)
  values
    ('50000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004', leo_id,
     'Commission votes are our bread and butter; easy to turn around.', now() - interval '2 hours')
  on conflict (id) do nothing;

  insert into public.ep_review_scores (review_id, criterion_id, score, weight_snapshot, scale_snapshot)
  values
    ('50000000-0000-0000-0000-000000000006', c_news, 4, 1.0, 5),
    ('50000000-0000-0000-0000-000000000006', c_local, 5, 1.0, 5),
    ('50000000-0000-0000-0000-000000000006', c_feasibility, 5, 1.0, 5),
    ('50000000-0000-0000-0000-000000000006', c_impact, 3, 1.0, 5)
  on conflict do nothing;
end $$;
