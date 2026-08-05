-- Academic Partnerships: trim four public-form fields that turned out to
-- duplicate another field once the wizard put every step in front of a
-- reviewer at once:
--
--   - research_dates duplicated relevant_dates ("relevant dates or
--     deadlines" vs "relevant dates or embargoes") for anyone who picked
--     Faculty Research alongside another track. relevant_dates now covers
--     both; research_dates is dropped.
--   - learning_objectives duplicated student_experience (both asked what
--     students get out of it, just worded differently). student_experience
--     is kept; learning_objectives is dropped.
--   - research_summary duplicated description ("plain-language summary" vs
--     "briefly describe the proposed partnership") for the research track.
--     description is kept (and stays the one required, always-shown
--     narrative field); research_summary is dropped, so research_topic
--     alone is now what's required for the faculty_research track.
--   - research_links (citations/materials) is lower-priority triage detail,
--     better collected during the Reviewing conversation than asked of
--     every research inquiry up front — dropped rather than deferred to
--     keep the research step at four fields, matching every other step's
--     "fits the viewport" limit.
--
-- Safe as a direct drop: this tool has not been opened to the public yet
-- (zero ap_submissions rows in either project), so there is nothing to
-- preserve.

alter table public.ap_submissions
  drop column research_dates,
  drop column learning_objectives,
  drop column research_summary,
  drop column research_links;

-- The public inquiry form ------------------------------------------------------
-- Same signature, same shape — the insert list drops the four columns above,
-- and the faculty_research required-field check now only requires
-- research_topic (research_summary is gone; description already covers the
-- plain-language narrative for every track, including this one).

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
  if v_settings.is_open is not true then
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

comment on function public.ap_submit_inquiry(jsonb, text) is
  'The only way a row is ever written to ap_submissions from outside the portal. p_payload.partnership_types is a JSON array of strings; validates every element against the enabled-type list, requires at least one, requires research_topic only when faculty_research is among them, and checks email shape and per-submitter rate limits — all inside this one transaction. Every internal field is left at its default; the client cannot set stage, owner, or any assessment field.';
