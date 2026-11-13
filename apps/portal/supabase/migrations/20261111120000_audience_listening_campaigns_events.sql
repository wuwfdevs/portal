-- Audience Listening: campaigns, events, tables and seats (phase D, first half, of docs/audience-listening-suite-design.md).
--
-- A campaign is a season: one question, the prompts a table is walked through, a tag vocabulary and a span of dates. An event is a
-- session in a place at a time inside that span, and a table is one conversation at it (a kitchen table is an event with one
-- table). This file is the records and the rules the database enforces; the staff screens are in the Portal. The recording side of
-- a table (agreement, segments, speakers, highlights, contact cards) and the signed messages the website sends for it come in the
-- second half of phase D, with the consent and retention choices they depend on.
--
-- RLS is staff-only on every table, as for every al_* table. Nothing here has a participant-facing policy or function yet.
--
-- Rules that live here so no screen can get them wrong:
--   * an event's start falls inside its campaign's span;
--   * a private event is never listed, and a public event is listed only by a coordinator (a staff member may ask for review, a
--     coordinator approves or declines, and editing a listed event's public details sends it back to review);
--   * closing a campaign closes its query;
--   * a seat cannot be saved beyond the event's seats, and an address saves one seat per event;
--   * a table's link is stored as a SHA-256 hash, never the token.
--
-- The coordinator role is a stacking tool role (tool_access.tool_roles), the same arrangement as Sourcework's editor. Approving a
-- public event puts a stranger's gathering under the station's name, so it is a named role and not every grant (open item 4 in
-- the design, adopted as a working default).

-- ------------------------------------------------------------------------------------------------
-- The coordinator

create function private.is_audience_listening_coordinator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.has_tool_role(uid, 'audience-listening', 'coordinator');
$$;

revoke execute on function private.is_audience_listening_coordinator(uuid) from public, anon;
grant execute on function private.is_audience_listening_coordinator(uuid) to authenticated;

-- ------------------------------------------------------------------------------------------------
-- Campaigns

create table public.al_campaigns (
  id uuid primary key default gen_random_uuid(),
  public_id text not null,
  slug text not null,
  title text not null,
  question text not null,
  intro text not null default '',
  owner_id uuid references public.profiles (id) on delete set null,
  owner_label text,
  status text not null default 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  query_id uuid references public.al_queries (id) on delete set null,
  sourcework_project_id uuid references public.tw_projects (id) on delete set null,
  internal_notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint al_campaigns_public_id_unique unique (public_id),
  constraint al_campaigns_slug_unique unique (slug),
  constraint al_campaigns_query_unique unique (query_id),
  constraint al_campaigns_public_id_format check (public_id ~ '^[a-z0-9]{16}$'),
  constraint al_campaigns_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  constraint al_campaigns_title_check check (char_length(btrim(title)) between 1 and 200),
  constraint al_campaigns_question_check check (char_length(btrim(question)) between 1 and 500),
  constraint al_campaigns_intro_check check (char_length(intro) <= 4000),
  constraint al_campaigns_owner_label_check check (owner_label is null or char_length(owner_label) <= 120),
  constraint al_campaigns_status_check check (status in ('draft', 'open', 'closed', 'archived')),
  constraint al_campaigns_span_check check (opens_at is null or closes_at is null or closes_at > opens_at),
  constraint al_campaigns_notes_check check (internal_notes is null or char_length(internal_notes) <= 4000)
);

comment on table public.al_campaigns is
  'A listening season: one question, prompts, a tag vocabulary and a span. Staff-only. The word "campaign" is never shown to the public.';
comment on column public.al_campaigns.query_id is
  'Optional: the same question answered alone, an existing al_queries row. Closing the campaign closes it.';
comment on column public.al_campaigns.sourcework_project_id is
  'Optional: the Sourcework project its conversations are sent to. A soft link (set null if the project is deleted).';

create index al_campaigns_status_idx on public.al_campaigns (status, opens_at);

create trigger set_al_campaigns_updated_at
  before update on public.al_campaigns
  for each row execute function public.set_updated_at();

create table public.al_campaign_prompts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.al_campaigns (id) on delete cascade,
  position integer not null,
  kind text not null default 'prompt',
  text text not null,
  hint text,
  suggested_seconds integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint al_campaign_prompts_position_check check (position >= 1),
  constraint al_campaign_prompts_kind_check check (kind in ('intro', 'question', 'prompt')),
  constraint al_campaign_prompts_text_check check (char_length(btrim(text)) between 1 and 500),
  constraint al_campaign_prompts_hint_check check (hint is null or char_length(hint) <= 300),
  constraint al_campaign_prompts_seconds_check check (suggested_seconds is null or suggested_seconds between 15 and 1800)
);

comment on table public.al_campaign_prompts is
  'The prompts a table is walked through, in order (position, then creation). kind: intro (read to the table), question (the one the campaign asks), prompt (a follow-up). Position is not unique: the screens renumber, and a swap passes through a duplicate.';

create index al_campaign_prompts_order_idx on public.al_campaign_prompts (campaign_id, position, created_at);

create trigger set_al_campaign_prompts_updated_at
  before update on public.al_campaign_prompts
  for each row execute function public.set_updated_at();

create table public.al_campaign_tags (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.al_campaigns (id) on delete cascade,
  label text not null,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  constraint al_campaign_tags_label_check check (char_length(btrim(label)) between 1 and 40)
);

comment on table public.al_campaign_tags is
  'The tag vocabulary a facilitator picks from when marking a line "what mattered". Unique by label, ignoring case.';

create unique index al_campaign_tags_label_unique on public.al_campaign_tags (campaign_id, lower(btrim(label)));

-- Closing a campaign closes its query: a question that is still taking answers after the season is over is a surprise.
create function public.al_campaign_close_query()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('closed', 'archived')
     and old.status is distinct from new.status
     and new.query_id is not null
  then
    update public.al_queries
    set status = 'closed'
    where id = new.query_id and status = 'open';
  end if;
  return new;
end;
$$;

create trigger al_campaigns_close_query
  after update of status on public.al_campaigns
  for each row execute function public.al_campaign_close_query();

revoke execute on function public.al_campaign_close_query() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------
-- Events

create table public.al_events (
  id uuid primary key default gen_random_uuid(),
  public_id text not null,
  campaign_id uuid not null references public.al_campaigns (id) on delete restrict,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  place_name text not null,
  address text,
  city text,
  visibility text not null default 'private',
  listing_state text not null default 'not_listed',
  listing_reviewed_by uuid references public.profiles (id) on delete set null,
  listing_reviewed_at timestamptz,
  listing_declined_reason text,
  organizer_kind text not null default 'wuwf',
  organizer_label text,
  organizer_subject text,
  seats integer,
  status text not null default 'draft',
  current_prompt_position integer not null default 1,
  last_call_at timestamptz,
  wuwf_journalist_joining boolean not null default false,
  internal_notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint al_events_public_id_unique unique (public_id),
  constraint al_events_public_id_format check (public_id ~ '^[a-z0-9]{16}$'),
  constraint al_events_title_check check (char_length(btrim(title)) between 1 and 200),
  constraint al_events_span_check check (ends_at > starts_at),
  constraint al_events_place_check check (char_length(btrim(place_name)) between 1 and 200),
  constraint al_events_address_check check (address is null or char_length(address) <= 500),
  constraint al_events_city_check check (city is null or char_length(city) <= 120),
  constraint al_events_visibility_check check (visibility in ('private', 'public')),
  constraint al_events_listing_state_check check (listing_state in ('not_listed', 'pending_review', 'listed', 'declined')),
  constraint al_events_listing_public_only check (visibility = 'public' or listing_state = 'not_listed'),
  constraint al_events_declined_reason_check check (listing_declined_reason is null or char_length(listing_declined_reason) <= 1000),
  constraint al_events_organizer_kind_check check (organizer_kind in ('wuwf', 'partner', 'person')),
  constraint al_events_organizer_label_check check (organizer_label is null or char_length(organizer_label) <= 200),
  constraint al_events_seats_check check (seats is null or seats between 1 and 500),
  constraint al_events_status_check check (status in ('draft', 'scheduled', 'live', 'done', 'cancelled')),
  constraint al_events_prompt_position_check check (current_prompt_position >= 1),
  constraint al_events_notes_check check (internal_notes is null or char_length(internal_notes) <= 4000)
);

comment on table public.al_events is
  'A listening session in a place at a time, inside a campaign. A public event is listed only after a coordinator approves it; a private event is never listed. A private event with one table is the kitchen table.';
comment on column public.al_events.organizer_subject is
  'A site account that organizes the event and may manage only its own events (phase E). Opaque; the Portal never learns who it is.';

create index al_events_campaign_idx on public.al_events (campaign_id, starts_at);
create index al_events_listing_idx on public.al_events (listing_state, starts_at) where listing_state = 'pending_review';

create trigger set_al_events_updated_at
  before update on public.al_events
  for each row execute function public.set_updated_at();

-- An event's start falls inside its campaign's span. Checked here, on every write, because the screens only show the span.
create function public.al_events_check_span()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_opens timestamptz;
  v_closes timestamptz;
begin
  select opens_at, closes_at into v_opens, v_closes from public.al_campaigns where id = new.campaign_id;
  if v_opens is not null and new.starts_at < v_opens then
    raise exception 'event_outside_campaign' using errcode = '23514', detail = 'The event starts before the campaign opens.';
  end if;
  if v_closes is not null and new.starts_at > v_closes then
    raise exception 'event_outside_campaign' using errcode = '23514', detail = 'The event starts after the campaign closes.';
  end if;
  return new;
end;
$$;

create trigger al_events_check_span
  before insert or update of starts_at, campaign_id on public.al_events
  for each row execute function public.al_events_check_span();

-- Listing is a decision. Any staff member may ask for review (not_listed <-> pending_review); only a coordinator lists or declines,
-- and a decline carries the reason the organizer is told. Changing what a listed event shows the public (its title, time, place,
-- address or visibility) sends it back to review unless a coordinator is the one changing it, so an approval is never stretched
-- to cover a different event.
create function public.al_events_guard_listing()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_coordinator boolean := coalesce(private.is_audience_listening_coordinator(auth.uid()), false);
begin
  if tg_op = 'INSERT' then
    if new.listing_state in ('listed', 'declined') and not v_is_coordinator then
      raise exception 'Only a coordinator can list or decline an event.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Making an event private takes it off the website whoever does it; a private event is never listed.
  if new.visibility = 'private' then
    new.listing_state := 'not_listed';
    return new;
  end if;

  if old.listing_state = 'listed'
     and new.listing_state = 'listed'
     and not v_is_coordinator
     and (new.title is distinct from old.title
          or new.starts_at is distinct from old.starts_at
          or new.ends_at is distinct from old.ends_at
          or new.place_name is distinct from old.place_name
          or new.address is distinct from old.address
          or new.city is distinct from old.city
          or new.visibility is distinct from old.visibility
          or new.seats is distinct from old.seats)
  then
    new.listing_state := 'pending_review';
  end if;

  if new.listing_state is distinct from old.listing_state then
    if new.listing_state in ('listed', 'declined') then
      if not v_is_coordinator then
        raise exception 'Only a coordinator can list or decline an event.' using errcode = '42501';
      end if;
      new.listing_reviewed_by := auth.uid();
      new.listing_reviewed_at := now();
      if new.listing_state = 'declined' and coalesce(btrim(new.listing_declined_reason), '') = '' then
        raise exception 'A decline needs a reason.' using errcode = '23514';
      end if;
      if new.listing_state = 'listed' then
        new.listing_declined_reason := null;
      end if;
    elsif new.listing_state = 'not_listed' and old.listing_state = 'listed' and not v_is_coordinator then
      raise exception 'Only a coordinator can take a listed event off the website.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger al_events_guard_listing
  before insert or update on public.al_events
  for each row execute function public.al_events_guard_listing();

-- ------------------------------------------------------------------------------------------------
-- Tables (the conversation at an event). The recording columns exist so the second half of phase D adds behaviour, not columns.

create table public.al_tables (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.al_events (id) on delete cascade,
  number integer not null,
  join_token_hash text,
  join_token_issued_at timestamptz,
  join_token_used_at timestamptz,
  facilitator_subject text,
  facilitator_first_name text,
  state text not null default 'waiting',
  agreed_at timestamptz,
  consent_text_version text,
  help_requested_at timestamptz,
  prompt_position integer not null default 1,
  elapsed_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint al_tables_number_unique unique (event_id, number),
  constraint al_tables_number_check check (number between 1 and 99),
  constraint al_tables_hash_check check (join_token_hash is null or join_token_hash ~ '^[0-9a-f]{64}$'),
  constraint al_tables_state_check check (state in ('waiting', 'agreed', 'recording', 'paused', 'ended', 'sent')),
  constraint al_tables_agreed_check check (state = 'waiting' or agreed_at is not null),
  constraint al_tables_name_check check (facilitator_first_name is null or char_length(facilitator_first_name) <= 60),
  constraint al_tables_prompt_check check (prompt_position >= 1),
  constraint al_tables_elapsed_check check (elapsed_seconds >= 0)
);

comment on table public.al_tables is
  'One conversation at an event. The single-use link is stored as a SHA-256 hash of a 256-bit token, never the token; staff re-issue a link and read it out or print it. agreed_at is the group-consent record.';

create trigger set_al_tables_updated_at
  before update on public.al_tables
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------------------------------------
-- Seats. A seat belongs to an event; saving one collects a name and an email as a side effect of the seat, used for that event only.

create table public.al_seats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.al_events (id) on delete cascade,
  name text not null,
  email text not null,
  subject text,
  created_at timestamptz not null default now(),
  constraint al_seats_name_check check (char_length(btrim(name)) between 1 and 200),
  constraint al_seats_email_check check (char_length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

comment on table public.al_seats is
  'A saved seat at an event. Capped by the event''s seats; one per email per event. The email is used for that event only.';

create unique index al_seats_event_email_unique on public.al_seats (event_id, lower(email));

create function public.al_seats_check_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_seats integer;
  v_taken integer;
begin
  select seats into v_seats from public.al_events where id = new.event_id for update;
  if v_seats is null then
    return new;
  end if;
  select count(*) into v_taken from public.al_seats where event_id = new.event_id;
  if v_taken >= v_seats then
    raise exception 'event_full' using errcode = '23514', detail = 'Every seat at this event is taken.';
  end if;
  return new;
end;
$$;

create trigger al_seats_check_capacity
  before insert on public.al_seats
  for each row execute function public.al_seats_check_capacity();

-- Trigger functions are not callable as RPC, but nothing should be able to name them either.
revoke execute on function public.al_events_check_span() from public, anon, authenticated;
revoke execute on function public.al_events_guard_listing() from public, anon, authenticated;
revoke execute on function public.al_seats_check_capacity() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------
-- RLS: staff only. Supabase's default privileges give anon and authenticated every right on a new public table; take them away
-- and grant exactly what staff need, so the column grants below actually limit what they can write.

alter table public.al_campaigns enable row level security;
alter table public.al_campaign_prompts enable row level security;
alter table public.al_campaign_tags enable row level security;
alter table public.al_events enable row level security;
alter table public.al_tables enable row level security;
alter table public.al_seats enable row level security;

revoke all on public.al_campaigns, public.al_campaign_prompts, public.al_campaign_tags,
  public.al_events, public.al_tables, public.al_seats from anon, authenticated;

grant select, insert, update, delete on public.al_campaigns to authenticated;
grant select, insert, update, delete on public.al_campaign_prompts to authenticated;
grant select, insert, update, delete on public.al_campaign_tags to authenticated;
grant select, insert, update, delete on public.al_events to authenticated;
-- A table's recording state is written by the table's own session (the second half of phase D), never by a screen. Staff add and
-- remove tables and re-issue a link, which is the only thing they write on one.
grant select, insert (event_id, number), delete on public.al_tables to authenticated;
grant update (join_token_hash, join_token_issued_at, join_token_used_at) on public.al_tables to authenticated;
grant select, delete on public.al_seats to authenticated;

create policy al_campaigns_member_select on public.al_campaigns
  for select to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_campaigns_member_insert on public.al_campaigns
  for insert to authenticated
  with check ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_campaigns_member_update on public.al_campaigns
  for update to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))))
  with check ((select private.has_audience_listening_access((select auth.uid()))));
-- Only a draft is deleted. A campaign that ran is closed and archived, never removed.
create policy al_campaigns_member_delete on public.al_campaigns
  for delete to authenticated
  using (status = 'draft' and (select private.has_audience_listening_access((select auth.uid()))));

create policy al_campaign_prompts_member_all on public.al_campaign_prompts
  for all to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))))
  with check ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_campaign_tags_member_all on public.al_campaign_tags
  for all to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))))
  with check ((select private.has_audience_listening_access((select auth.uid()))));

create policy al_events_member_select on public.al_events
  for select to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_events_member_insert on public.al_events
  for insert to authenticated
  with check ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_events_member_update on public.al_events
  for update to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))))
  with check ((select private.has_audience_listening_access((select auth.uid()))));
-- An event with tables, seats or recordings is cancelled, not deleted: only an event nobody has joined goes.
create policy al_events_member_delete on public.al_events
  for delete to authenticated
  using (
    status in ('draft', 'cancelled')
    and (select private.has_audience_listening_access((select auth.uid())))
  );

create policy al_tables_member_select on public.al_tables
  for select to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_tables_member_insert on public.al_tables
  for insert to authenticated
  with check ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_tables_member_update on public.al_tables
  for update to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))))
  with check ((select private.has_audience_listening_access((select auth.uid()))));
-- A table that has recorded anything is never deleted from a screen.
create policy al_tables_member_delete on public.al_tables
  for delete to authenticated
  using (state = 'waiting' and (select private.has_audience_listening_access((select auth.uid()))));

create policy al_seats_member_select on public.al_seats
  for select to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_seats_member_delete on public.al_seats
  for delete to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))));
