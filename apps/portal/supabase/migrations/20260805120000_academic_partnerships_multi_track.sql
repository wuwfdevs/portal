-- Academic Partnerships: a faculty member may propose more than one
-- collaboration track in a single inquiry (e.g. a classroom visit AND an
-- applied project), so partnership_type becomes partnership_types, a
-- non-empty array rather than a single enum value. Also renames
-- enrollment_estimate to estimated_students_reached: gathered once, up
-- front, regardless of which track(s) are chosen, for impact reporting —
-- not tied to one course's roster the way "approximate enrollment" was.
--
-- Safe as a direct alter: both projects have zero ap_submissions rows (this
-- tool has not been opened to the public yet), so there is nothing to
-- backfill. See docs/academic-partnerships-design.md's revision note.

alter table public.ap_submissions rename column enrollment_estimate to estimated_students_reached;
comment on column public.ap_submissions.estimated_students_reached is
  'Roughly how many students this partnership is expected to reach, asked once up front regardless of which track(s) are chosen — an impact metric, not a single course''s roster.';

alter table public.ap_submissions add column partnership_types public.ap_partnership_type[] not null default '{}';
update public.ap_submissions set partnership_types = array[partnership_type] where partnership_type is not null;
alter table public.ap_submissions drop column partnership_type;
alter table public.ap_submissions
  add constraint ap_submissions_partnership_types_check check (cardinality(partnership_types) > 0);

comment on column public.ap_submissions.partnership_types is
  'One or more collaboration tracks chosen in a single inquiry. Always non-empty (enforced by ap_submit_inquiry() and this check constraint) — never set directly by application code.';

drop index if exists public.ap_submissions_partnership_type_idx;
create index ap_submissions_partnership_types_idx on public.ap_submissions using gin (partnership_types);

-- The public inquiry form ------------------------------------------------------
-- Same two functions, same signatures — only the body changes: partnership
-- type is now an array, validated element-by-element against the enabled
-- list, and the research-fields requirement now checks array membership
-- ('faculty_research' = any(...)) instead of equality.

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

  if 'faculty_research' = any (v_types) and (
    coalesce(trim(p_payload->>'research_topic'), '') = ''
    or coalesce(trim(p_payload->>'research_summary'), '') = ''
  ) then
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
    learning_objectives, description, student_experience, support_requested,
    deliverables, relevant_dates, may_publish, additional_context,
    research_topic, research_summary, research_relevance, research_status,
    research_links, research_dates, research_availability,
    submitted_ip_hash
  ) values (
    trim(p_payload->>'faculty_name'), v_email, trim(p_payload->>'department'),
    nullif(trim(p_payload->>'phone'), ''), v_types,
    nullif(trim(p_payload->>'course_title'), ''), nullif(trim(p_payload->>'course_number'), ''),
    nullif(trim(p_payload->>'timeframe'), ''),
    v_students,
    nullif(trim(p_payload->>'learning_objectives'), ''), trim(p_payload->>'description'),
    nullif(trim(p_payload->>'student_experience'), ''), nullif(trim(p_payload->>'support_requested'), ''),
    nullif(trim(p_payload->>'deliverables'), ''), nullif(trim(p_payload->>'relevant_dates'), ''),
    coalesce((p_payload->>'may_publish')::boolean, false), nullif(trim(p_payload->>'additional_context'), ''),
    nullif(trim(p_payload->>'research_topic'), ''), nullif(trim(p_payload->>'research_summary'), ''),
    nullif(trim(p_payload->>'research_relevance'), ''), nullif(trim(p_payload->>'research_status'), ''),
    nullif(trim(p_payload->>'research_links'), ''), nullif(trim(p_payload->>'research_dates'), ''),
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
  'The only way a row is ever written to ap_submissions from outside the portal. p_payload.partnership_types is a JSON array of strings; validates every element against the enabled-type list, requires at least one, requires the research fields only when faculty_research is among them, and checks email shape and per-submitter rate limits — all inside this one transaction. Every internal field is left at its default; the client cannot set stage, owner, or any assessment field.';
