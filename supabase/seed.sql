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
     '/editorial', 'in_development', true, 'invite_only', 1),
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
  -- Transcription Workspace's registry row is inserted by its own schema
  -- migration (20260722130000_transcription_workspace_schema.sql), not
  -- here — this just looks it up to seed local tool_access grants.
  select id into tool_transcription from public.tools where key = 'transcription';

  insert into public.tool_access (user_id, tool_id, tool_role, granted_by)
  values
    (dana_id, tool_editorial, 'Editor', dana_id),
    (marcus_id, tool_editorial, 'Contributor', dana_id),
    (marcus_id, tool_remote, 'Contributor', dana_id),
    (leo_id, tool_clips, null, dana_id),
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
     jsonb_build_object('user_id', marcus_id, 'tool_role', 'Contributor'));
end $$;
