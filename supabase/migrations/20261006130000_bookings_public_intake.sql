-- Bookings: slice 4 — the public intake (2026-10-06).
--
-- docs/bookings-design.md §2.4, §4 (/book, /book/embed, /bookings/intake),
-- §5 "Settings", §6.3 and §9 item 4. A university unit or an outside
-- organization asks for production, airtime or both from a public form that
-- needs no session at all — one page load, one submit, nothing read back —
-- the shape docs/academic-partnerships-design.md §3 established for /partner.
-- docs/bookings-design.md §16 has the account; this header is the summary.
--
--   * bk_settings — the singleton behind the public form: open or closed, the
--     three pieces of copy, and the service packages the form offers by name.
--     Staff read it; the director or the executive change it.
--   * bk_projects.requested_packages — what the submitter asked for, by the
--     names the form offered. A request, not an estimate: production staff
--     turn it into estimate lines on the project page. The staff form leaves
--     it empty.
--   * bk_projects.submitted_ip_hash — a salted hash of the submitter's
--     address (never the address), only so the rate limit below can count
--     recent submissions from one visitor; null for a staff-entered request.
--   * bk_public_form_config() — the one public read: what /book needs to
--     render and nothing else. Never the confirmation copy (sent back by the
--     write on success, so a probe of this function alone cannot see it).
--   * bk_submit_request() — the one public write. Validates everything in
--     one transaction (open, required fields, email shape, the offered
--     packages, dates, the airtime numbers, the per-email and per-address
--     rate limits), finds or creates the partner by name, inserts the
--     project at stage `request` with source `public`, an airtime commitment
--     when the form gave its numbers, and the "received" project event.
--     Every internal column stays at its default; the client cannot set a
--     stage, an owner, a treatment, or a judgment.
--
-- No participant-facing RLS policy on any bk_* table — the two functions are
-- the whole surface (§6.3). The rate limit reuses
-- lib/academic-partnerships/rate-limit.ts for the hash.

-- Settings -------------------------------------------------------------------------------------------------------

create table public.bk_settings (
  id boolean primary key default true check (id),
  is_open boolean not null default false,
  intro_copy text not null default
    'Tell us what you have in mind — a webcast, a studio or field production, editing, or airtime for a university message. WUWF''s production staff will review the request, estimate it, and follow up by email. Submitting this form does not book a date or commit WUWF to the work.',
  confirmation_copy text not null default
    'Thank you. WUWF''s production staff will review your request and follow up by email with an estimate. Nothing is booked until you approve that estimate.',
  closed_copy text not null default
    'WUWF is not taking new production requests right now. Please check back later, or contact the station directly.',
  -- The service packages the form offers, by name. A name, not a package id:
  -- packages are versioned with the rate model (bk_service_packages.version_id)
  -- and the public form must keep working across versions. The project page
  -- turns a request's names into real estimate lines.
  offered_packages text[] not null default array[
    'Studio access', 'Event webcast', 'Field production', 'Post-production / editing'
  ],
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  -- A blank name would offer a checkbox that says nothing; the settings action
  -- trims and drops blanks before the write, and this keeps a direct write honest.
  constraint bk_settings_packages_nonblank check (
    array_position(offered_packages, '') is null and array_position(offered_packages, null) is null
  )
);
comment on table public.bk_settings is
  'Singleton (id always true). Controls the public request form at /book: open or closed, its copy, and the service packages it offers by name (docs/bookings-design.md §5 "Settings").';

insert into public.bk_settings (id) values (true) on conflict (id) do nothing;

create trigger set_bk_settings_updated_at
  before update on public.bk_settings
  for each row execute function public.set_updated_at();

alter table public.bk_settings enable row level security;
grant select, update on public.bk_settings to authenticated;

create policy bk_settings_select on public.bk_settings for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
-- The intake form is station policy — whether WUWF is taking requests and
-- what it offers — so it is the director's or the executive's (§6.1).
create policy bk_settings_update on public.bk_settings for update to authenticated
  using (
    (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  )
  with check (
    (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  );

-- What a public request asked for ----------------------------------------------------------------

alter table public.bk_projects
  add column requested_packages text[] not null default '{}'::text[],
  add column submitted_ip_hash text;
comment on column public.bk_projects.requested_packages is
  'The service packages a public submitter asked for, by the names the form offered. A request, not an estimate — production staff add the real lines. Empty for a staff-entered request.';
comment on column public.bk_projects.submitted_ip_hash is
  'Salted hash of the public submitter''s address (never the address), for bk_submit_request()''s rate limit. Null for a staff-entered request.';

-- The public surface -------------------------------------------------------------------------------------
-- Two security-definer functions, callable by anon and authenticated, are the
-- whole of what a visitor with no session can reach (§6.3).

create function public.bk_public_form_config()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'is_open', s.is_open,
    'intro_copy', s.intro_copy,
    'closed_copy', s.closed_copy,
    'offered_packages', to_jsonb(s.offered_packages)
  )
  from public.bk_settings s
  where s.id = true;
$$;
comment on function public.bk_public_form_config() is
  'The only part of Bookings readable without a session: what /book needs to render. Never returns confirmation_copy (bk_submit_request sends it back on success).';

create function public.bk_submit_request(p_payload jsonb, p_ip_hash text)
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
  if v_settings.is_open is not true then
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
comment on function public.bk_submit_request(jsonb, text) is
  'The only way a row is ever written to bk_projects from outside the portal (docs/bookings-design.md §6.3). Validates the required fields, email shape, the offered packages, dates, the airtime numbers and the per-submitter rate limits in one transaction; finds or creates the partner by name; inserts the project at stage request with source public, a commitment when the airtime numbers were given, and the received event. Returns the confirmation copy or an error code — never an id.';

revoke execute on function public.bk_public_form_config() from public;
revoke execute on function public.bk_submit_request(jsonb, text) from public;
grant execute on function public.bk_public_form_config() to anon, authenticated;
grant execute on function public.bk_submit_request(jsonb, text) to anon, authenticated;
