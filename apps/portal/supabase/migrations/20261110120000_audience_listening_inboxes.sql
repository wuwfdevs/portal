-- Audience Listening: the standing inboxes (phase C of docs/audience-listening-suite-design.md).
--
-- Two places a person on the website can write to the station without answering a query, and without an account or a box
-- ticked ("no account, no checkbox", board 5 and 5c):
--
--   * al_inbox: Ask WUWF. A question for the newsroom or an idea for a story; an email only if they want to hear what came of it.
--   * al_host_requests: board 5c, "bring a listening session to your table". The station writes back; nothing promises a date.
--
-- The public surface is two functions, al_site_inbox_send() and al_site_host_request(), executable by service_role only: the
-- Portal's signed route calls them after it verifies the request. RLS on both tables is staff-only (the same policy as every al_*
-- table), and staff may change only the columns they work with. Nothing is deleted or published automatically.
--
-- Not stored: the sender's subject. Nothing a staff member sees needs it, and a row that cannot be tied to a visitor id cannot be
-- tied back to one. The rate limit (per subject and per client address) is counted in al_site_rate_limits by the route.
--
-- Not here, because their tables do not exist yet: al_seats and the `event` read (phase D, with events), the link from an
-- inbox item to an outcome (phase F), the one-email-per-host-request and daily Ask WUWF digest (they need the Resend wiring;
-- until then the staff list flags a request waiting more than five days).

-- ------------------------------------------------------------------------------------------------
-- Ask WUWF

create table public.al_inbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  body text not null,
  email text,
  state text not null default 'new',
  internal_notes text,
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint al_inbox_kind_check check (kind in ('question', 'story_idea')),
  constraint al_inbox_state_check check (state in ('new', 'read', 'answered', 'declined')),
  constraint al_inbox_body_check check (char_length(btrim(body)) between 1 and 2000),
  constraint al_inbox_email_check check (email is null or (char_length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  constraint al_inbox_notes_check check (internal_notes is null or char_length(internal_notes) <= 4000)
);

comment on table public.al_inbox is
  'Ask WUWF: questions and story ideas sent from the website, with an optional email. Staff-only. The sender''s visitor id is deliberately not stored.';

create index al_inbox_state_idx on public.al_inbox (state, created_at desc);

create trigger set_al_inbox_updated_at
  before update on public.al_inbox
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------------------------------------
-- Host requests

create table public.al_host_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  kind text not null,
  organization text,
  seats integer not null,
  address text not null,
  expected text not null,
  when_text text not null,
  invitees_text text,
  journalist_requested boolean not null default false,
  state text not null default 'new',
  internal_notes text,
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint al_host_requests_name_check check (char_length(btrim(name)) between 1 and 200),
  constraint al_host_requests_email_check check (char_length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint al_host_requests_kind_check check (kind in ('invite', 'public')),
  constraint al_host_requests_organization_check check (organization is null or char_length(organization) <= 200),
  constraint al_host_requests_seats_check check (seats in (12, 30, 60)),
  constraint al_host_requests_address_check check (char_length(btrim(address)) between 1 and 500),
  constraint al_host_requests_expected_check check (expected in ('6-8', '9-12', '12+')),
  constraint al_host_requests_when_check check (char_length(btrim(when_text)) between 1 and 500),
  constraint al_host_requests_invitees_check check (invitees_text is null or char_length(invitees_text) <= 2000),
  constraint al_host_requests_state_check check (state in ('new', 'contacted', 'scheduled', 'declined')),
  constraint al_host_requests_notes_check check (internal_notes is null or char_length(internal_notes) <= 4000)
);

comment on table public.al_host_requests is
  'Board 5c: a request to host a listening session. Staff-only. The site tells the host someone will write back within a week; the staff list flags any request older than five days that is still new.';

create index al_host_requests_state_idx on public.al_host_requests (state, created_at);

create trigger set_al_host_requests_updated_at
  before update on public.al_host_requests
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------------------------------------
-- RLS: staff only. The functions below are the only way a row is made. Staff may change only the columns they work with
-- (state, notes, who and when), never the words a person sent.

alter table public.al_inbox enable row level security;
alter table public.al_host_requests enable row level security;

grant select, delete on public.al_inbox to authenticated;
grant update (state, internal_notes, handled_by, handled_at) on public.al_inbox to authenticated;
grant select, delete on public.al_host_requests to authenticated;
grant update (state, internal_notes, handled_by, handled_at) on public.al_host_requests to authenticated;

create policy al_inbox_member_select on public.al_inbox
  for select to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_inbox_member_update on public.al_inbox
  for update to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))))
  with check ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_inbox_member_delete on public.al_inbox
  for delete to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))));

create policy al_host_requests_member_select on public.al_host_requests
  for select to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_host_requests_member_update on public.al_host_requests
  for update to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))))
  with check ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_host_requests_member_delete on public.al_host_requests
  for delete to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))));

-- ------------------------------------------------------------------------------------------------
-- The site API. Subject first, as every al_site_* function; every refusal is { "error": code }.
-- The subject is checked for shape and then not used: it is what the route's rate limit counted.

create function public.al_site_inbox_send(p_subject text, p_kind text, p_body text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
begin
  if private.al_site_subject(p_subject) is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.tool_is_enabled('audience-listening') then
    return jsonb_build_object('error', 'not_accepting');
  end if;
  if p_kind is null or p_kind not in ('question', 'story_idea') then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if char_length(v_body) = 0 then
    return jsonb_build_object('error', 'required_field_missing');
  end if;
  if char_length(v_body) > 2000
     or (v_email is not null and (char_length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  insert into public.al_inbox (kind, body, email) values (p_kind, v_body, v_email);
  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.al_site_inbox_send(text, text, text, text) is
  'Ask WUWF from the website. Stores the message and the optional email; the subject is checked and not kept. service_role only.';

create function public.al_site_host_request(
  p_subject text,
  p_name text,
  p_email text,
  p_kind text,
  p_organization text,
  p_seats integer,
  p_address text,
  p_expected text,
  p_when_text text,
  p_invitees_text text,
  p_journalist_requested boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_org text := nullif(btrim(coalesce(p_organization, '')), '');
  v_address text := btrim(coalesce(p_address, ''));
  v_when text := btrim(coalesce(p_when_text, ''));
  v_invitees text := nullif(btrim(coalesce(p_invitees_text, '')), '');
begin
  if private.al_site_subject(p_subject) is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.tool_is_enabled('audience-listening') then
    return jsonb_build_object('error', 'not_accepting');
  end if;
  if p_kind is null or p_kind not in ('invite', 'public')
     or p_seats is null or p_seats not in (12, 30, 60)
     or p_expected is null or p_expected not in ('6-8', '9-12', '12+')
     or p_journalist_requested is null
  then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if char_length(v_name) = 0 or char_length(v_email) = 0 or char_length(v_address) = 0 or char_length(v_when) = 0 then
    return jsonb_build_object('error', 'required_field_missing');
  end if;
  if char_length(v_name) > 200 or char_length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or char_length(coalesce(v_org, '')) > 200 or char_length(v_address) > 500 or char_length(v_when) > 500
     or char_length(coalesce(v_invitees, '')) > 2000
  then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  insert into public.al_host_requests
    (name, email, kind, organization, seats, address, expected, when_text, invitees_text, journalist_requested)
  values
    (v_name, v_email, p_kind, v_org, p_seats, v_address, p_expected, v_when, v_invitees, p_journalist_requested);
  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.al_site_host_request(text, text, text, text, text, integer, text, text, text, text, boolean) is
  'Board 5c: a request to host a listening session, from the website. The subject is checked and not kept. service_role only.';

revoke execute on function public.al_site_inbox_send(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.al_site_host_request(text, text, text, text, text, integer, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.al_site_inbox_send(text, text, text, text) to service_role;
grant execute on function public.al_site_host_request(text, text, text, text, text, integer, text, text, text, text, boolean) to service_role;
