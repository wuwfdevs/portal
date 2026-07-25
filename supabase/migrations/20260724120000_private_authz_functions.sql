-- Move the authorization helper functions out of the API-exposed schema.
--
-- is_administrator() and the ep_* helpers are SECURITY DEFINER: they read
-- profiles/tool_access with elevated privilege so RLS policies can ask "is this
-- person an administrator / an editor / allowed to see this review?".
--
-- They have to stay EXECUTE-able by `authenticated`, because a policy expression
-- is evaluated as the querying user — revoking EXECUTE makes every policy that
-- calls one fail with "permission denied for function", locking the app out.
-- But while they live in `public` they are also reachable as PostgREST RPC
-- endpoints (/rest/v1/rpc/is_administrator?uid=...), which lets any signed-in
-- user probe other people's roles. That is what the database linter flags.
--
-- The fix is placement, not permission: `private` is not in PostgREST's exposed
-- schema list, so the functions keep working inside policies and stop being an
-- API surface. Policies are repointed with ALTER POLICY rather than dropped and
-- recreated, so no table is ever momentarily without its rules.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Helper functions, unchanged in behaviour ------------------------------------
-- Cross-calls between them are schema-qualified: search_path is pinned to
-- public (for the tables they read), so `private.ep_role` will not resolve
-- unqualified.

create function private.is_administrator(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid
      and platform_role = 'administrator'
      and account_status = 'active'
  );
$$;

create function private.ep_tool_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.tools where key = 'editorial-planning';
$$;

create function private.ep_role(uid uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when lower(coalesce(ta.tool_role, '')) in ('editor', 'reviewer') then lower(ta.tool_role)
    else 'contributor'
  end
  from public.tool_access ta
  join public.tools t on t.id = ta.tool_id
  join public.profiles p on p.id = ta.user_id
  where ta.user_id = uid
    and t.key = 'editorial-planning'
    and t.enabled
    and ta.revoked_at is null
    and p.account_status = 'active';
$$;

create function private.ep_has_access(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select private.ep_role(uid) is not null;
$$;

create function private.ep_is_reviewer(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select private.ep_role(uid) in ('reviewer', 'editor');
$$;

create function private.ep_is_editor(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select private.ep_role(uid) = 'editor';
$$;

create function private.ep_meeting_status_of(mp_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select m.status
  from public.ep_meeting_pitches mp
  join public.ep_meetings m on m.id = mp.meeting_id
  where mp.id = mp_id;
$$;

create function private.ep_pitch_under_review(pid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.ep_meeting_pitches mp
    join public.ep_meetings m on m.id = mp.meeting_id
    where mp.pitch_id = pid and m.status in ('open', 'agenda')
  );
$$;

create function private.ep_review_visible(rid uuid, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.ep_reviews r
    join public.ep_meeting_pitches mp on mp.id = r.meeting_pitch_id
    join public.ep_meetings m on m.id = mp.meeting_id
    where r.id = rid
      and (r.reviewer_id = uid or m.status in ('agenda', 'concluded'))
  );
$$;

create function private.ep_review_editable(rid uuid, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.ep_reviews r
    join public.ep_meeting_pitches mp on mp.id = r.meeting_pitch_id
    join public.ep_meetings m on m.id = mp.meeting_id
    where r.id = rid
      and r.reviewer_id = uid
      and m.status = 'open'
  );
$$;

revoke execute on function private.is_administrator(uuid) from public, anon;
revoke execute on function private.ep_tool_id() from public, anon;
revoke execute on function private.ep_role(uuid) from public, anon;
revoke execute on function private.ep_has_access(uuid) from public, anon;
revoke execute on function private.ep_is_reviewer(uuid) from public, anon;
revoke execute on function private.ep_is_editor(uuid) from public, anon;
revoke execute on function private.ep_meeting_status_of(uuid) from public, anon;
revoke execute on function private.ep_pitch_under_review(uuid) from public, anon;
revoke execute on function private.ep_review_visible(uuid, uuid) from public, anon;
revoke execute on function private.ep_review_editable(uuid, uuid) from public, anon;

grant execute on function private.is_administrator(uuid) to authenticated;
grant execute on function private.ep_tool_id() to authenticated;
grant execute on function private.ep_role(uuid) to authenticated;
grant execute on function private.ep_has_access(uuid) to authenticated;
grant execute on function private.ep_is_reviewer(uuid) to authenticated;
grant execute on function private.ep_is_editor(uuid) to authenticated;
grant execute on function private.ep_meeting_status_of(uuid) to authenticated;
grant execute on function private.ep_pitch_under_review(uuid) to authenticated;
grant execute on function private.ep_review_visible(uuid, uuid) to authenticated;
grant execute on function private.ep_review_editable(uuid, uuid) to authenticated;

-- Repoint every policy ---------------------------------------------------------
-- Same predicates, qualified with private. Nothing about who can do what changes.

-- profiles
alter policy profiles_select_own_or_admin on public.profiles
  using (id = auth.uid() or private.is_administrator(auth.uid()));

alter policy profiles_update_admin_only on public.profiles
  using (private.is_administrator(auth.uid()))
  with check (private.is_administrator(auth.uid()));

alter policy profiles_select_editorial_members on public.profiles
  using (private.ep_has_access(auth.uid()));

-- tools
alter policy tools_select_enabled_or_admin on public.tools
  using (
    private.is_administrator(auth.uid())
    or (
      enabled = true
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and account_status = 'active'
      )
    )
  );

alter policy tools_write_admin_only on public.tools
  using (private.is_administrator(auth.uid()))
  with check (private.is_administrator(auth.uid()));

-- tool_access
alter policy tool_access_select_own_or_admin on public.tool_access
  using (user_id = auth.uid() or private.is_administrator(auth.uid()));

alter policy tool_access_write_admin_only on public.tool_access
  using (private.is_administrator(auth.uid()))
  with check (private.is_administrator(auth.uid()));

alter policy tool_access_select_editorial_members on public.tool_access
  using (
    private.ep_has_access(auth.uid())
    and tool_id = private.ep_tool_id()
    and revoked_at is null
  );

-- access_requests
alter policy access_requests_select_admin_only on public.access_requests
  using (private.is_administrator(auth.uid()));

alter policy access_requests_update_admin_only on public.access_requests
  using (private.is_administrator(auth.uid()))
  with check (private.is_administrator(auth.uid()));

-- audit_events
alter policy audit_events_select_admin_only on public.audit_events
  using (private.is_administrator(auth.uid()));

alter policy audit_events_insert_admin_only on public.audit_events
  with check (private.is_administrator(auth.uid()) and actor_id = auth.uid());

alter policy audit_events_insert_editorial_editor on public.audit_events
  with check (private.ep_is_editor(auth.uid()) and actor_id = auth.uid());

-- ep_form_fields
alter policy ep_form_fields_select_members on public.ep_form_fields
  using (private.ep_has_access(auth.uid()));

alter policy ep_form_fields_write_editors on public.ep_form_fields
  using (private.ep_is_editor(auth.uid()))
  with check (private.ep_is_editor(auth.uid()));

-- ep_criteria
alter policy ep_criteria_select_members on public.ep_criteria
  using (private.ep_has_access(auth.uid()));

alter policy ep_criteria_write_editors on public.ep_criteria
  using (private.ep_is_editor(auth.uid()))
  with check (private.ep_is_editor(auth.uid()));

-- ep_settings
alter policy ep_settings_select_members on public.ep_settings
  using (private.ep_has_access(auth.uid()));

alter policy ep_settings_update_editors on public.ep_settings
  using (private.ep_is_editor(auth.uid()))
  with check (private.ep_is_editor(auth.uid()));

-- ep_pitches
alter policy ep_pitches_select_members on public.ep_pitches
  using (private.ep_has_access(auth.uid()));

alter policy ep_pitches_insert_members on public.ep_pitches
  with check (private.ep_has_access(auth.uid()) and submitted_by = auth.uid());

alter policy ep_pitches_update_submitter_or_editor on public.ep_pitches
  using (
    private.ep_is_editor(auth.uid())
    or (
      submitted_by = auth.uid()
      and private.ep_has_access(auth.uid())
      and status = 'open'
      and not private.ep_pitch_under_review(id)
    )
  )
  with check (
    private.ep_is_editor(auth.uid())
    or (submitted_by = auth.uid() and status = 'open')
  );

-- ep_pitch_values
alter policy ep_pitch_values_select_members on public.ep_pitch_values
  using (private.ep_has_access(auth.uid()));

alter policy ep_pitch_values_write_submitter_or_editor on public.ep_pitch_values
  using (
    private.ep_is_editor(auth.uid())
    or exists (
      select 1 from public.ep_pitches p
      where p.id = pitch_id
        and p.submitted_by = auth.uid()
        and p.status = 'open'
        and not private.ep_pitch_under_review(p.id)
    )
  )
  with check (
    private.ep_is_editor(auth.uid())
    or exists (
      select 1 from public.ep_pitches p
      where p.id = pitch_id
        and p.submitted_by = auth.uid()
        and p.status = 'open'
        and not private.ep_pitch_under_review(p.id)
    )
  );

-- ep_meetings
alter policy ep_meetings_select_members on public.ep_meetings
  using (private.ep_has_access(auth.uid()));

alter policy ep_meetings_write_editors on public.ep_meetings
  using (private.ep_is_editor(auth.uid()))
  with check (private.ep_is_editor(auth.uid()));

-- ep_meeting_pitches
alter policy ep_meeting_pitches_select_members on public.ep_meeting_pitches
  using (private.ep_has_access(auth.uid()));

alter policy ep_meeting_pitches_write_editors on public.ep_meeting_pitches
  using (private.ep_is_editor(auth.uid()))
  with check (private.ep_is_editor(auth.uid()));

-- ep_reviews
alter policy ep_reviews_select_own_or_revealed on public.ep_reviews
  using (
    private.ep_has_access(auth.uid())
    and (
      reviewer_id = auth.uid()
      or private.ep_meeting_status_of(meeting_pitch_id) in ('agenda', 'concluded')
    )
  );

alter policy ep_reviews_insert_own_while_open on public.ep_reviews
  with check (
    reviewer_id = auth.uid()
    and private.ep_is_reviewer(auth.uid())
    and private.ep_meeting_status_of(meeting_pitch_id) = 'open'
  );

alter policy ep_reviews_update_own_while_open on public.ep_reviews
  using (
    reviewer_id = auth.uid()
    and private.ep_is_reviewer(auth.uid())
    and private.ep_meeting_status_of(meeting_pitch_id) = 'open'
  )
  with check (
    reviewer_id = auth.uid()
    and private.ep_meeting_status_of(meeting_pitch_id) = 'open'
  );

alter policy ep_reviews_delete_own_while_open on public.ep_reviews
  using (
    reviewer_id = auth.uid()
    and private.ep_meeting_status_of(meeting_pitch_id) = 'open'
  );

-- ep_review_scores
alter policy ep_review_scores_select_visible on public.ep_review_scores
  using (
    private.ep_has_access(auth.uid())
    and private.ep_review_visible(review_id, auth.uid())
  );

alter policy ep_review_scores_write_own_while_open on public.ep_review_scores
  using (private.ep_review_editable(review_id, auth.uid()))
  with check (private.ep_review_editable(review_id, auth.uid()));

-- Retire the exposed copies -----------------------------------------------------
-- Safe now that nothing references them; `restrict` (the default) makes Postgres
-- refuse rather than cascade if a policy was missed above.

drop function public.is_administrator(uuid);
drop function public.ep_tool_id();
drop function public.ep_has_access(uuid);
drop function public.ep_is_reviewer(uuid);
drop function public.ep_is_editor(uuid);
drop function public.ep_meeting_status_of(uuid);
drop function public.ep_pitch_under_review(uuid);
drop function public.ep_review_visible(uuid, uuid);
drop function public.ep_review_editable(uuid, uuid);
drop function public.ep_role(uuid);
