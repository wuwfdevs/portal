-- Switching a module off has to stop its public doors, not just its staff pages.
--
-- The public forms and the participant flow are `security definer` functions that anyone (or any
-- anonymous session) can call. None of them looked at `public.tools.enabled`: each had its own
-- "is this open?" setting (`bk_settings.is_open`, `ap_settings.is_open`, a query's status), so an
-- administrator who switched Bookings, Academic Partnerships or Audience Listening off at
-- /admin/tools still had a live form that accepted submissions into the disabled tool. This adds
-- `private.tool_is_enabled(key)` and makes every public entry point treat a disabled tool as closed,
-- using the "closed" answers the pages already handle:
--
--   * bk_submit_request, ap_submit_inquiry   -> error 'closed'
--   * bk_public_form_config, ap_public_form_config -> is_open false
--   * al_public_query                        -> state 'closed'
--   * private.al_is_accepting                -> false, which refuses al_start_submission and
--                                               al_finalize_submission (the participant flow)
--   * private.al_owns_open_submission_object -> false, which stops a participant uploading audio
--                                               into a disabled tool's bucket
--
-- It also closes a cross-module leak. Two Bookings functions are security definer and checked only
-- Bookings access, yet read Traffic and On Air tables, including underwriter names:
--
--   * bk_institutional_airtime_honored: a Traffic or On Air commitment is reported as not found when
--     that module is switched off, and its label (the underwriter's name, the pinned content's title)
--     is replaced by a generic one for a reader who has no access to that module. The counts stay.
--   * bk_university_avails_per_week: returns 'on_air_unavailable' when On Air is switched off. Program
--     names are left as they are: they are the station's public schedule, and the envelope is the point
--     of the Calendar for people who have no On Air access.
--
-- The function bodies below are the latest definitions from earlier migrations with the guards added
-- (the hosted copies are the same minus SQL comments, checked before this was applied). `create or
-- replace` keeps each function's grants and revokes, so none are repeated.

create function private.tool_is_enabled(p_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select t.enabled from public.tools t where t.key = p_key), false);
$$;

revoke execute on function private.tool_is_enabled(text) from public, anon;
grant execute on function private.tool_is_enabled(text) to authenticated;

create or replace function private.al_is_accepting(q_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.al_queries q
    where q.id = q_id
      and private.tool_is_enabled('audience-listening')
      and q.status = 'open'
      and (q.opens_at is null or q.opens_at <= now())
      and (q.closes_at is null or q.closes_at > now())
  );
$$;

create or replace function private.al_owns_open_submission_object(object_name text, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.al_submissions s
    where private.tool_is_enabled('audience-listening')
      and s.participant_user_id = uid
      and s.status = 'in_progress'
      and object_name like s.query_id::text || '/' || s.id::text || '/%'
  );
$$;

create or replace function public.al_public_query(p_public_id text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'public_id', q.public_id,
    'public_title', q.public_title,
    'public_intro', q.public_intro,
    'state', case
      when not private.tool_is_enabled('audience-listening') then 'closed'
      when q.status <> 'open' then 'closed'
      when q.opens_at is not null and q.opens_at > now() then 'not_yet_open'
      when q.closes_at is not null and q.closes_at <= now() then 'closed'
      else 'open'
    end,
    'opens_at', q.opens_at,
    'closes_at', q.closes_at,
    'consent_text', q.consent_text,
    'ask_contact_permission', q.ask_contact_permission,
    'ask_attribution_permission', q.ask_attribution_permission,
    'allow_anonymous_request', q.allow_anonymous_request,
    'fields', jsonb_build_object(
      'name', q.field_name,
      'email', q.field_email,
      'phone', q.field_phone,
      'city', q.field_city,
      'note', q.field_note
    ),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'position', x.position,
          'prompt', x.prompt,
          'guidance', x.guidance,
          'required', x.required,
          'max_duration_seconds', x.max_duration_seconds
        )
        order by x.position, x.created_at
      )
      from public.al_questions x
      where x.query_id = q.id
    ), '[]'::jsonb)
  )
  from public.al_queries q
  where q.public_id = p_public_id
    and q.status <> 'draft';
$$;

create or replace function public.bk_public_form_config()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'is_open', s.is_open and private.tool_is_enabled('bookings'),
    'intro_copy', s.intro_copy,
    'closed_copy', s.closed_copy,
    'offered_packages', to_jsonb(s.offered_packages)
  )
  from public.bk_settings s
  where s.id = true;
$$;

create or replace function public.ap_public_form_config()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'is_open', s.is_open and private.tool_is_enabled('academic-partnerships'),
    'intro_copy', s.intro_copy,
    'enabled_partnership_types', s.enabled_partnership_types
  )
  from public.ap_settings s
  where s.id = true;
$$;

create or replace function public.bk_submit_request(p_payload jsonb, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.bk_settings;
  v_email text;
  v_requested public.bk_requested;
  v_partner_kind public.bk_partner_kind;
  v_partner_name text;
  v_partner_id uuid;
  v_packages text[];
  v_package text;
  v_event_starts date;
  v_event_ends date;
  v_due date;
  v_airings integer;
  v_seconds integer;
  v_air_starts date;
  v_air_ends date;
  v_recent integer;
  v_project_id uuid;
begin
  select * into v_settings from public.bk_settings where id = true;
  if v_settings.is_open is not true or not private.tool_is_enabled('bookings') then
    return jsonb_build_object('error', 'closed');
  end if;

  -- Who is asking.
  v_email := lower(trim(p_payload->>'contact_email'));
  if v_email is null or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('error', 'invalid_email');
  end if;
  v_partner_name := trim(p_payload->>'partner_name');
  if coalesce(trim(p_payload->>'contact_name'), '') = ''
     or coalesce(v_partner_name, '') = ''
     or coalesce(trim(p_payload->>'title'), '') = ''
     or coalesce(trim(p_payload->>'description'), '') = ''
  then
    return jsonb_build_object('error', 'missing_required_field');
  end if;
  if length(trim(p_payload->>'title')) > 160 or length(v_partner_name) > 160 then
    return jsonb_build_object('error', 'too_long');
  end if;
  begin
    v_partner_kind := coalesce(nullif(trim(p_payload->>'partner_kind'), ''), 'uwf_unit')::public.bk_partner_kind;
  exception when invalid_text_representation then
    return jsonb_build_object('error', 'invalid_partner_kind');
  end;

  -- What is asked for.
  begin
    v_requested := (p_payload->>'requested')::public.bk_requested;
  exception when invalid_text_representation then
    return jsonb_build_object('error', 'invalid_requested');
  end;
  if v_requested is null then
    return jsonb_build_object('error', 'invalid_requested');
  end if;

  v_packages := '{}'::text[];
  if v_requested <> 'airtime' and jsonb_typeof(p_payload->'packages') = 'array' then
    for v_package in select trim(value #>> '{}') from jsonb_array_elements(p_payload->'packages') loop
      if v_package is null or v_package = '' then continue; end if;
      if not (v_package = any (v_settings.offered_packages)) then
        return jsonb_build_object('error', 'invalid_package');
      end if;
      if not (v_package = any (v_packages)) then
        v_packages := v_packages || v_package;
      end if;
    end loop;
  end if;

  -- When.
  begin
    v_event_starts := nullif(trim(p_payload->>'event_starts_on'), '')::date;
    v_event_ends := nullif(trim(p_payload->>'event_ends_on'), '')::date;
    v_due := nullif(trim(p_payload->>'deliverables_due_on'), '')::date;
    v_air_starts := nullif(trim(p_payload->>'airtime_starts_on'), '')::date;
    v_air_ends := nullif(trim(p_payload->>'airtime_ends_on'), '')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('error', 'invalid_date');
  end;
  if v_event_starts is not null and v_event_ends is not null and v_event_ends < v_event_starts then
    return jsonb_build_object('error', 'invalid_date');
  end if;
  if v_air_starts is not null and v_air_ends is not null and v_air_ends < v_air_starts then
    return jsonb_build_object('error', 'invalid_date');
  end if;

  -- The airtime numbers, when the request asks for airtime.
  if v_requested <> 'production' then
    begin
      v_airings := nullif(trim(p_payload->>'airings_per_week'), '')::integer;
      v_seconds := nullif(trim(p_payload->>'seconds'), '')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      return jsonb_build_object('error', 'invalid_airtime');
    end;
    if (v_airings is not null and (v_airings < 1 or v_airings > 99))
       or (v_seconds is not null and (v_seconds < 1 or v_seconds > 3600)) then
      return jsonb_build_object('error', 'invalid_airtime');
    end if;
  end if;

  -- Bounded per submitter, in the same transaction as the write — the shape
  -- ap_submit_inquiry() uses: an email and a salted address hash are the two
  -- things available with no participant identity.
  select count(*) into v_recent
  from public.bk_projects
  where source = 'public' and lower(contact_email) = v_email
    and created_at > now() - interval '24 hours';
  if v_recent >= 3 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  if p_ip_hash is not null then
    select count(*) into v_recent
    from public.bk_projects
    where submitted_ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
    if v_recent >= 5 then
      return jsonb_build_object('error', 'rate_limited');
    end if;
  end if;

  -- The partner: the unit or organization on file by name, or a new row. An
  -- existing row is never changed by a public submission — its kind, contact
  -- and index are staff's to keep; the submitter's details go on the project.
  select id into v_partner_id
  from public.bk_partners
  where lower(name) = lower(v_partner_name);
  if v_partner_id is null then
    insert into public.bk_partners (name, kind, contact_name, contact_email, contact_phone)
    values (
      v_partner_name, v_partner_kind,
      trim(p_payload->>'contact_name'), v_email, nullif(trim(p_payload->>'contact_phone'), '')
    )
    returning id into v_partner_id;
  end if;

  insert into public.bk_projects (
    partner_id, title, description, requested, requested_packages,
    event_starts_on, event_ends_on, deliverables_due_on, location,
    contact_name, contact_email, contact_phone,
    source, submitted_ip_hash
  ) values (
    v_partner_id, trim(p_payload->>'title'), trim(p_payload->>'description'), v_requested, v_packages,
    v_event_starts, v_event_ends, v_due, nullif(left(trim(p_payload->>'location'), 200), ''),
    trim(p_payload->>'contact_name'), v_email, nullif(trim(p_payload->>'contact_phone'), ''),
    'public', p_ip_hash
  )
  returning id into v_project_id;

  -- A commitment only when the form gave enough to record one; the rest of
  -- what was said about airtime is in the description for staff to read.
  if v_requested <> 'production' and v_airings is not null and v_seconds is not null
     and coalesce(v_air_starts, v_event_starts) is not null then
    insert into public.bk_airtime_commitments (project_id, airings_per_week, seconds, starts_on, ends_on, notes)
    values (
      v_project_id, v_airings, v_seconds,
      coalesce(v_air_starts, v_event_starts), coalesce(v_air_ends, v_event_ends),
      'Asked for on the public request form.'
    );
  end if;

  insert into public.bk_project_events (project_id, actor_id, kind, note)
  values (v_project_id, null, 'received', 'Submitted through the public request form.');

  return jsonb_build_object('ok', true, 'confirmation_copy', v_settings.confirmation_copy);
end;
$$;

create or replace function public.ap_submit_inquiry(p_payload jsonb, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.ap_settings;
  v_types public.ap_partnership_type[];
  v_type public.ap_partnership_type;
  v_raw_type text;
  v_email text;
  v_students integer;
  v_recent_by_email integer;
  v_recent_by_ip integer;
  v_new_id uuid;
begin
  select * into v_settings from public.ap_settings where id = true;
  if v_settings.is_open is not true or not private.tool_is_enabled('academic-partnerships') then
    return jsonb_build_object('error', 'closed');
  end if;

  v_types := array[]::public.ap_partnership_type[];
  begin
    for v_raw_type in select jsonb_array_elements_text(coalesce(p_payload->'partnership_types', '[]'::jsonb))
    loop
      v_type := v_raw_type::public.ap_partnership_type;
      if not (v_type = any (v_settings.enabled_partnership_types)) then
        return jsonb_build_object('error', 'invalid_partnership_type');
      end if;
      if not (v_type = any (v_types)) then
        v_types := v_types || v_type;
      end if;
    end loop;
  exception when invalid_text_representation then
    return jsonb_build_object('error', 'invalid_partnership_type');
  end;

  if cardinality(v_types) = 0 then
    return jsonb_build_object('error', 'invalid_partnership_type');
  end if;

  v_email := trim(p_payload->>'email');
  if v_email is null or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('error', 'invalid_email');
  end if;

  if coalesce(trim(p_payload->>'faculty_name'), '') = ''
     or coalesce(trim(p_payload->>'department'), '') = ''
     or coalesce(trim(p_payload->>'description'), '') = ''
  then
    return jsonb_build_object('error', 'missing_required_field');
  end if;

  if 'faculty_research' = any (v_types)
     and coalesce(trim(p_payload->>'research_topic'), '') = ''
  then
    return jsonb_build_object('error', 'missing_required_field');
  end if;

  begin
    v_students := nullif(trim(p_payload->>'estimated_students_reached'), '')::integer;
  exception when invalid_text_representation then
    return jsonb_build_object('error', 'invalid_estimated_students_reached');
  end;

  -- Bounded per submitter, in the same transaction as the write — the same
  -- shape as al_start_submission's "one participant, one query, three tries",
  -- adapted to having no participant identity: email and a salted IP hash
  -- (computed by the caller, from x-forwarded-for, never the raw IP) are the
  -- two things available. See design doc §3 "Abuse protection".
  select count(*) into v_recent_by_email
  from public.ap_submissions
  where email = v_email and created_at > now() - interval '24 hours';
  if v_recent_by_email >= 3 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  if p_ip_hash is not null then
    select count(*) into v_recent_by_ip
    from public.ap_submissions
    where submitted_ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
    if v_recent_by_ip >= 5 then
      return jsonb_build_object('error', 'rate_limited');
    end if;
  end if;

  insert into public.ap_submissions (
    faculty_name, email, department, phone, partnership_types,
    course_title, course_number, timeframe, estimated_students_reached,
    description, student_experience, support_requested,
    deliverables, relevant_dates, may_publish, additional_context,
    research_topic, research_relevance, research_status,
    research_availability,
    submitted_ip_hash
  ) values (
    trim(p_payload->>'faculty_name'), v_email, trim(p_payload->>'department'),
    nullif(trim(p_payload->>'phone'), ''), v_types,
    nullif(trim(p_payload->>'course_title'), ''), nullif(trim(p_payload->>'course_number'), ''),
    nullif(trim(p_payload->>'timeframe'), ''),
    v_students,
    trim(p_payload->>'description'),
    nullif(trim(p_payload->>'student_experience'), ''), nullif(trim(p_payload->>'support_requested'), ''),
    nullif(trim(p_payload->>'deliverables'), ''), nullif(trim(p_payload->>'relevant_dates'), ''),
    coalesce((p_payload->>'may_publish')::boolean, false), nullif(trim(p_payload->>'additional_context'), ''),
    nullif(trim(p_payload->>'research_topic'), ''),
    nullif(trim(p_payload->>'research_relevance'), ''), nullif(trim(p_payload->>'research_status'), ''),
    nullif(trim(p_payload->>'research_availability'), ''),
    p_ip_hash
  )
  returning id into v_new_id;

  insert into public.ap_submission_events (submission_id, actor_id, event_type, note)
  values (v_new_id, null, 'received', 'Submitted through the public inquiry form.');

  return jsonb_build_object('ok', true, 'confirmation_copy', v_settings.confirmation_copy);
end;
$$;

create or replace function public.bk_university_avails_per_week(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_plan public.bk_term_plans;
  v_as_of date;
  v_programs jsonb;
begin
  if auth.uid() is null or not private.has_bookings_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  -- The airtime envelope is read from On Air's schedule; with On Air switched off there is nothing
  -- to read, and the Calendar reports it unavailable rather than serving a stale schedule.
  if not private.tool_is_enabled('log') then
    return jsonb_build_object('error', 'on_air_unavailable');
  end if;
  select * into v_plan from public.bk_term_plans where id = p_plan_id;
  if v_plan.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  v_as_of := least(greatest(v_plan.starts_on, current_date), v_plan.ends_on);

  with entries as (
    select s.id, s.program_id, s.clock_template_id, s.duration_minutes,
           case when cardinality(s.days_of_week) = 0 then 7 else cardinality(s.days_of_week) end as days,
           case when cardinality(s.days_of_week) = 0 then array[0, 1, 2, 3, 4, 5, 6] else s.days_of_week end as day_set,
           ceil(s.duration_minutes / 60.0)::integer as hours
    from public.log_schedule s
    where s.entry_type = 'recurring'
      and s.start_date <= v_as_of
      and (s.end_date is null or s.end_date >= v_as_of)
  ),
  versions as (
    select distinct on (e.id) e.id as entry_id, v.id as version_id
    from entries e
    join public.log_clock_versions v on v.clock_template_id = e.clock_template_id
    where v.effective_from <= v_as_of and (v.effective_to is null or v.effective_to >= v_as_of)
    order by e.id, v.effective_from desc
  ),
  opportunities as (
    select e.id as entry_id, e.program_id, e.days, e.day_set, e.hours, o.id as opportunity_id, cs.duration_seconds
    from entries e
    join versions v on v.entry_id = e.id
    join public.log_local_opportunities o on o.clock_version_id = v.version_id and o.active
    join public.log_clock_slots cs on cs.id = o.slot_id
    where 'university_announcement' = any (o.permitted_content_types)
  ),
  pins as (
    select op.entry_id, a.id as assignment_id,
           (case when a.hour_index is null then op.hours else 1 end)
             * (case when cardinality(a.days_of_week) = 0 then op.days
                     else (select count(*) from unnest(a.days_of_week) d where d = any (op.day_set)) end) as occurrences,
           coalesce(
             nullif((select sum(c.duration_seconds) from public.log_content_components c where c.content_item_id = ci.id and c.required), 0),
             ci.expected_duration_seconds, 0) as seconds
    from opportunities op
    join public.log_opportunity_assignments a on a.local_opportunity_id = op.opportunity_id and a.active
    join public.log_content_items ci on ci.id = a.content_item_id
  ),
  per_entry as (
    select e.id as entry_id, e.program_id,
           coalesce(count(op.opportunity_id) * max(e.hours) * max(e.days), 0) as avails,
           coalesce(sum(op.duration_seconds) * max(e.hours) * max(e.days), 0) as seconds,
           coalesce((select sum(p.occurrences * p.seconds) from pins p where p.entry_id = e.id), 0) as pinned_seconds
    from entries e
    left join opportunities op on op.entry_id = e.id
    group by e.id, e.program_id
  ),
  per_program as (
    select pe.program_id, pr.name, sum(pe.avails)::integer as avails,
           round(sum(pe.seconds) / 60.0, 1) as minutes, round(sum(pe.pinned_seconds) / 60.0, 1) as pinned_minutes
    from per_entry pe
    join public.log_programs pr on pr.id = pe.program_id
    group by pe.program_id, pr.name
    having sum(pe.avails) > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'program_id', program_id, 'name', name, 'avails_per_week', avails,
    'minutes_per_week', minutes, 'pinned_minutes_per_week', pinned_minutes) order by name), '[]'::jsonb)
  into v_programs from per_program;

  return jsonb_build_object('ok', true, 'as_of', v_as_of, 'programs', v_programs);
end;
$$;

create or replace function public.bk_institutional_airtime_honored(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_plan public.bk_term_plans;
  v_as_of date;
  v_rows jsonb;
begin
  if auth.uid() is null or not private.has_bookings_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select * into v_plan from public.bk_term_plans where id = p_plan_id;
  if v_plan.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  v_as_of := least(greatest(v_plan.starts_on, current_date), v_plan.ends_on);

  with commitments as (
    select c.*
    from public.bk_airtime_commitments c
    where c.honored_in <> 'pending'
      and c.starts_on <= v_plan.ends_on
      and (c.ends_on is null or c.ends_on >= v_plan.starts_on)
  ),
  traffic as (
    select c.id as commitment_id,
           ct.id as contract_id,
           ct.status::text as contract_status,
           u.name as underwriter_name,
           (select count(*) from public.uw_scheduled_placements sp
             join public.uw_contract_schedule_lines sl on sl.id = sp.schedule_line_id
            where sl.contract_id = ct.id
              and sp.status::text <> 'superseded'
              and sp.placement_date between v_plan.starts_on and v_plan.ends_on) as placements,
           (select coalesce(sum(sl.duration_seconds), 0) from public.uw_scheduled_placements sp
             join public.uw_contract_schedule_lines sl on sl.id = sp.schedule_line_id
            where sl.contract_id = ct.id
              and sp.status::text <> 'superseded'
              and sp.placement_date between v_plan.starts_on and v_plan.ends_on) as seconds
    from commitments c
    join public.uw_contracts ct on ct.id = c.external_ref
    join public.uw_underwriters u on u.id = ct.underwriter_id
    where c.honored_in = 'traffic'
      and private.tool_is_enabled('underwriting')
  ),
  pins as (
    select c.id as commitment_id,
           a.id as assignment_id,
           a.active,
           ci.title as content_title,
           coalesce(
             nullif((select sum(cc.duration_seconds) from public.log_content_components cc
                      where cc.content_item_id = ci.id and cc.required), 0),
             ci.expected_duration_seconds, 0) as seconds,
           (select coalesce(sum(
               (case when a.hour_index is null then ceil(s.duration_minutes / 60.0)::integer else 1 end)
               * (case when cardinality(a.days_of_week) = 0
                       then (case when cardinality(s.days_of_week) = 0 then 7 else cardinality(s.days_of_week) end)
                       else (select count(*) from unnest(a.days_of_week) d
                              where cardinality(s.days_of_week) = 0 or d = any (s.days_of_week)) end)), 0)
              from public.log_schedule s
              join public.log_clock_versions v on v.clock_template_id = s.clock_template_id
             where v.id = o.clock_version_id
               and s.entry_type = 'recurring'
               and s.start_date <= v_as_of and (s.end_date is null or s.end_date >= v_as_of)
               and v.effective_from <= v_as_of and (v.effective_to is null or v.effective_to >= v_as_of)
           ) as airings_per_week
    from commitments c
    join public.log_opportunity_assignments a on a.id = c.external_ref
    join public.log_local_opportunities o on o.id = a.local_opportunity_id
    join public.log_content_items ci on ci.id = a.content_item_id
    where c.honored_in = 'on_air'
      and private.tool_is_enabled('log')
  )
  select coalesce(jsonb_agg(row_json order by commitment_id), '[]'::jsonb) into v_rows
  from (
    select t.commitment_id, jsonb_build_object(
      'commitment_id', t.commitment_id, 'honored_in', 'traffic', 'found', true,
      'label', case when private.has_underwriting_access(auth.uid()) then t.underwriter_name else 'Traffic contract' end, 'status', t.contract_status,
      'placements_in_term', t.placements, 'seconds_in_term', t.seconds) as row_json
    from traffic t
    union all
    select p.commitment_id, jsonb_build_object(
      'commitment_id', p.commitment_id, 'honored_in', 'on_air', 'found', true,
      'label', case when private.has_log_access(auth.uid()) then p.content_title else 'On Air placement' end, 'status', case when p.active then 'active' else 'inactive' end,
      'airings_per_week', p.airings_per_week, 'seconds', p.seconds) as row_json
    from pins p
    union all
    select c.id, jsonb_build_object(
      'commitment_id', c.id, 'honored_in', c.honored_in::text, 'found', false) as row_json
    from commitments c
    where not exists (select 1 from traffic t where t.commitment_id = c.id)
      and not exists (select 1 from pins p where p.commitment_id = c.id)
  ) rows;

  return jsonb_build_object('ok', true, 'as_of', v_as_of, 'commitments', v_rows);
end;
$$;
