-- Editorial Planning tool schema. Design: docs/editorial-planning-design.md.
--
-- Pitches are long-lived backlog items (open -> assigned | archived). Meetings
-- are lightweight weekly sessions (open -> agenda -> concluded) that select a
-- slate of pitches, collect independent reviewer scores, and record decisions.
-- The ep_meeting_pitches join row is the permanent record of each review round.
--
-- Configuration (form fields, rubric criteria, scoring scale) is data, not
-- code. Config rows are deactivated rather than deleted, and every score
-- snapshots the criterion weight and scale in force when it was given, so
-- historical rankings stay frozen when the rubric evolves.

-- Configuration ---------------------------------------------------------------

create table public.ep_form_fields (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  label       text not null,
  help_text   text,
  field_type  text not null check (
    field_type in ('short_text', 'long_text', 'select', 'multi_select', 'date', 'url')
  ),
  options     jsonb,
  required    boolean not null default false,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.ep_form_fields is
  'The configurable pitch submission form, one row per field. Fields are deactivated, never deleted, so historical pitches always render. A change in a field''s meaning should be deactivate + create, not an edit.';

create table public.ep_criteria (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null,
  guidance    text,
  weight      numeric(4,2) not null default 1.0 check (weight > 0),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.ep_criteria is
  'The configurable editorial rubric. Same lifecycle rule as ep_form_fields: deactivate, never delete; a change in meaning is a new row.';

create table public.ep_settings (
  id          boolean primary key default true check (id),
  scale_min   integer not null default 1,
  scale_max   integer not null default 5,
  updated_at  timestamptz not null default now(),
  constraint ep_settings_scale_check check (scale_max > scale_min)
);

comment on table public.ep_settings is
  'Singleton (id always true). One scoring scale for the whole rubric; changes only affect future scoring because scores snapshot their scale.';

-- Pitches ---------------------------------------------------------------------

create table public.ep_pitches (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  status          text not null default 'open' check (status in ('open', 'assigned', 'archived')),
  submitted_by    uuid references public.profiles (id) on delete set null,
  assigned_to     uuid references public.profiles (id) on delete set null,
  archived_reason text,
  archived_by     uuid references public.profiles (id) on delete set null,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.ep_pitches is
  'Title is the one hard-coded field; everything else lives in ep_pitch_values against the configurable form. assigned_to is a convenience copy of the deciding ep_meeting_pitches row.';

create table public.ep_pitch_values (
  pitch_id  uuid not null references public.ep_pitches (id) on delete cascade,
  field_id  uuid not null references public.ep_form_fields (id),
  value     jsonb not null,
  primary key (pitch_id, field_id)
);

-- Meetings --------------------------------------------------------------------

create table public.ep_meetings (
  id            uuid primary key default gen_random_uuid(),
  meeting_date  date not null,
  status        text not null default 'open' check (status in ('open', 'agenda', 'concluded')),
  notes         text,
  created_by    uuid references public.profiles (id) on delete set null,
  agenda_at     timestamptz,
  concluded_at  timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.ep_meetings is
  'open: slate building + independent scoring (reviewers see only their own reviews). agenda: scoring closed, scores revealed, decisions recorded. concluded: permanent read-only record.';

create table public.ep_meeting_pitches (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references public.ep_meetings (id) on delete cascade,
  pitch_id     uuid not null references public.ep_pitches (id) on delete cascade,
  added_by     uuid references public.profiles (id) on delete set null,
  outcome      text check (outcome in ('assigned', 'deferred', 'archived')),
  assigned_to  uuid references public.profiles (id) on delete set null,
  rationale    text,
  decided_by   uuid references public.profiles (id) on delete set null,
  decided_at   timestamptz,
  unique (meeting_id, pitch_id)
);

comment on table public.ep_meeting_pitches is
  'Slate membership plus the decision record for one review round. A pitch deferred across several meetings has one row per meeting — that is the review history.';

-- Reviews ---------------------------------------------------------------------

create table public.ep_reviews (
  id                uuid primary key default gen_random_uuid(),
  meeting_pitch_id  uuid not null references public.ep_meeting_pitches (id) on delete cascade,
  reviewer_id       uuid not null references public.profiles (id) on delete cascade,
  comment           text,
  submitted_at      timestamptz not null default now(),
  unique (meeting_pitch_id, reviewer_id)
);

create table public.ep_review_scores (
  review_id        uuid not null references public.ep_reviews (id) on delete cascade,
  criterion_id     uuid not null references public.ep_criteria (id),
  score            integer not null check (score >= 0),
  weight_snapshot  numeric(4,2) not null,
  scale_snapshot   integer not null,
  primary key (review_id, criterion_id)
);

comment on table public.ep_review_scores is
  'weight_snapshot/scale_snapshot copy the rubric configuration at scoring time, so past aggregates are frozen arithmetic that later rubric changes cannot rewrite.';

-- Indexes ---------------------------------------------------------------------

create index ep_pitches_status_idx on public.ep_pitches (status);
create index ep_meeting_pitches_pitch_id_idx on public.ep_meeting_pitches (pitch_id);
create index ep_reviews_reviewer_id_idx on public.ep_reviews (reviewer_id);

-- updated_at maintenance ------------------------------------------------------

create trigger set_ep_form_fields_updated_at
  before update on public.ep_form_fields
  for each row execute function public.set_updated_at();

create trigger set_ep_criteria_updated_at
  before update on public.ep_criteria
  for each row execute function public.set_updated_at();

create trigger set_ep_settings_updated_at
  before update on public.ep_settings
  for each row execute function public.set_updated_at();

create trigger set_ep_pitches_updated_at
  before update on public.ep_pitches
  for each row execute function public.set_updated_at();

-- Authorization helpers -------------------------------------------------------
-- All security definer, mirroring is_administrator(): they are evaluated inside
-- RLS policies and must not recurse into the policies of the tables they read.

create function public.ep_tool_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.tools where key = 'editorial-planning';
$$;

-- The caller's editorial role: 'contributor' | 'reviewer' | 'editor', or null
-- when they have no active grant (or an inactive account, or the tool is
-- disabled). Unrecognized free-text roles fall back to 'contributor'.
create function public.ep_role(uid uuid)
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

create function public.ep_has_access(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.ep_role(uid) is not null;
$$;

create function public.ep_is_reviewer(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.ep_role(uid) in ('reviewer', 'editor');
$$;

create function public.ep_is_editor(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.ep_role(uid) = 'editor';
$$;

create function public.ep_meeting_status_of(mp_id uuid)
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

-- A pitch on the slate of a meeting that hasn't concluded is frozen: reviewers
-- must all score the same text, so submitter edits are blocked until the round
-- ends.
create function public.ep_pitch_under_review(pid uuid)
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

-- A review is visible to its author always, and to everyone else only once the
-- meeting's scoring has closed. This is the mechanical guarantee of independent
-- review — hiding colleagues' scores is a database property, not a UI courtesy.
create function public.ep_review_visible(rid uuid, uid uuid)
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

create function public.ep_review_editable(rid uuid, uid uuid)
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

revoke execute on function public.ep_tool_id() from public, anon;
revoke execute on function public.ep_role(uuid) from public, anon;
revoke execute on function public.ep_has_access(uuid) from public, anon;
revoke execute on function public.ep_is_reviewer(uuid) from public, anon;
revoke execute on function public.ep_is_editor(uuid) from public, anon;
revoke execute on function public.ep_meeting_status_of(uuid) from public, anon;
revoke execute on function public.ep_pitch_under_review(uuid) from public, anon;
revoke execute on function public.ep_review_visible(uuid, uuid) from public, anon;
revoke execute on function public.ep_review_editable(uuid, uuid) from public, anon;
grant execute on function public.ep_tool_id() to authenticated;
grant execute on function public.ep_role(uuid) to authenticated;
grant execute on function public.ep_has_access(uuid) to authenticated;
grant execute on function public.ep_is_reviewer(uuid) to authenticated;
grant execute on function public.ep_is_editor(uuid) to authenticated;
grant execute on function public.ep_meeting_status_of(uuid) to authenticated;
grant execute on function public.ep_pitch_under_review(uuid) to authenticated;
grant execute on function public.ep_review_visible(uuid, uuid) to authenticated;
grant execute on function public.ep_review_editable(uuid, uuid) to authenticated;

-- Row Level Security ----------------------------------------------------------

alter table public.ep_form_fields enable row level security;
alter table public.ep_criteria enable row level security;
alter table public.ep_settings enable row level security;
alter table public.ep_pitches enable row level security;
alter table public.ep_pitch_values enable row level security;
alter table public.ep_meetings enable row level security;
alter table public.ep_meeting_pitches enable row level security;
alter table public.ep_reviews enable row level security;
alter table public.ep_review_scores enable row level security;

grant select, insert, update, delete on public.ep_form_fields to authenticated;
grant select, insert, update, delete on public.ep_criteria to authenticated;
grant select, update on public.ep_settings to authenticated;
grant select, insert, update on public.ep_pitches to authenticated;
grant select, insert, update, delete on public.ep_pitch_values to authenticated;
grant select, insert, update on public.ep_meetings to authenticated;
grant select, insert, update, delete on public.ep_meeting_pitches to authenticated;
grant select, insert, update, delete on public.ep_reviews to authenticated;
grant select, insert, update, delete on public.ep_review_scores to authenticated;

-- Configuration: readable by every tool member, writable by editors. Rubric
-- and form design are editorial decisions, so they belong to the tool's
-- 'editor' role rather than platform administrators.

create policy ep_form_fields_select_members on public.ep_form_fields
  for select to authenticated
  using (public.ep_has_access(auth.uid()));

create policy ep_form_fields_write_editors on public.ep_form_fields
  for all to authenticated
  using (public.ep_is_editor(auth.uid()))
  with check (public.ep_is_editor(auth.uid()));

create policy ep_criteria_select_members on public.ep_criteria
  for select to authenticated
  using (public.ep_has_access(auth.uid()));

create policy ep_criteria_write_editors on public.ep_criteria
  for all to authenticated
  using (public.ep_is_editor(auth.uid()))
  with check (public.ep_is_editor(auth.uid()));

create policy ep_settings_select_members on public.ep_settings
  for select to authenticated
  using (public.ep_has_access(auth.uid()));

-- The singleton row is created below; no insert/delete policies on purpose.
create policy ep_settings_update_editors on public.ep_settings
  for update to authenticated
  using (public.ep_is_editor(auth.uid()))
  with check (public.ep_is_editor(auth.uid()));

-- Pitches: any member may submit as themselves. Submitters may edit their own
-- pitch only while it is open and not on an active meeting's slate (and cannot
-- change its status); editors may always write (decisions, archive, revive).
-- No delete policy: pitches are never deleted, matching the portal-wide
-- history-is-preserved principle.

create policy ep_pitches_select_members on public.ep_pitches
  for select to authenticated
  using (public.ep_has_access(auth.uid()));

create policy ep_pitches_insert_members on public.ep_pitches
  for insert to authenticated
  with check (public.ep_has_access(auth.uid()) and submitted_by = auth.uid());

create policy ep_pitches_update_submitter_or_editor on public.ep_pitches
  for update to authenticated
  using (
    public.ep_is_editor(auth.uid())
    or (
      submitted_by = auth.uid()
      and public.ep_has_access(auth.uid())
      and status = 'open'
      and not public.ep_pitch_under_review(id)
    )
  )
  with check (
    public.ep_is_editor(auth.uid())
    or (submitted_by = auth.uid() and status = 'open')
  );

create policy ep_pitch_values_select_members on public.ep_pitch_values
  for select to authenticated
  using (public.ep_has_access(auth.uid()));

create policy ep_pitch_values_write_submitter_or_editor on public.ep_pitch_values
  for all to authenticated
  using (
    public.ep_is_editor(auth.uid())
    or exists (
      select 1 from public.ep_pitches p
      where p.id = pitch_id
        and p.submitted_by = auth.uid()
        and p.status = 'open'
        and not public.ep_pitch_under_review(p.id)
    )
  )
  with check (
    public.ep_is_editor(auth.uid())
    or exists (
      select 1 from public.ep_pitches p
      where p.id = pitch_id
        and p.submitted_by = auth.uid()
        and p.status = 'open'
        and not public.ep_pitch_under_review(p.id)
    )
  );

-- Meetings and slates: visible to every member, managed by editors.

create policy ep_meetings_select_members on public.ep_meetings
  for select to authenticated
  using (public.ep_has_access(auth.uid()));

create policy ep_meetings_write_editors on public.ep_meetings
  for all to authenticated
  using (public.ep_is_editor(auth.uid()))
  with check (public.ep_is_editor(auth.uid()));

create policy ep_meeting_pitches_select_members on public.ep_meeting_pitches
  for select to authenticated
  using (public.ep_has_access(auth.uid()));

create policy ep_meeting_pitches_write_editors on public.ep_meeting_pitches
  for all to authenticated
  using (public.ep_is_editor(auth.uid()))
  with check (public.ep_is_editor(auth.uid()));

-- Reviews: writable only by their author, only with a reviewer/editor role,
-- and only while the meeting is open; readable by the author always and by
-- everyone else once scoring has closed (ep_review_visible).

create policy ep_reviews_select_own_or_revealed on public.ep_reviews
  for select to authenticated
  using (
    public.ep_has_access(auth.uid())
    and (
      reviewer_id = auth.uid()
      or public.ep_meeting_status_of(meeting_pitch_id) in ('agenda', 'concluded')
    )
  );

create policy ep_reviews_insert_own_while_open on public.ep_reviews
  for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and public.ep_is_reviewer(auth.uid())
    and public.ep_meeting_status_of(meeting_pitch_id) = 'open'
  );

create policy ep_reviews_update_own_while_open on public.ep_reviews
  for update to authenticated
  using (
    reviewer_id = auth.uid()
    and public.ep_is_reviewer(auth.uid())
    and public.ep_meeting_status_of(meeting_pitch_id) = 'open'
  )
  with check (
    reviewer_id = auth.uid()
    and public.ep_meeting_status_of(meeting_pitch_id) = 'open'
  );

create policy ep_reviews_delete_own_while_open on public.ep_reviews
  for delete to authenticated
  using (
    reviewer_id = auth.uid()
    and public.ep_meeting_status_of(meeting_pitch_id) = 'open'
  );

create policy ep_review_scores_select_visible on public.ep_review_scores
  for select to authenticated
  using (public.ep_has_access(auth.uid()) and public.ep_review_visible(review_id, auth.uid()));

create policy ep_review_scores_write_own_while_open on public.ep_review_scores
  for all to authenticated
  using (public.ep_review_editable(review_id, auth.uid()))
  with check (public.ep_review_editable(review_id, auth.uid()));

-- Portal-table additions ------------------------------------------------------
-- Three narrowly-scoped policies the tool needs on existing portal tables.
-- Policies are OR'd, so these extend (never replace) the portal's own rules.

-- Editorial members can read profiles: the backlog shows submitter names, the
-- agenda shows reviewer names, and decisions assign to people — including
-- former colleagues on historical records, which is why this is not limited to
-- current tool members.
create policy profiles_select_editorial_members on public.profiles
  for select to authenticated
  using (public.ep_has_access(auth.uid()));

-- Editorial members can see who else holds an active grant for this tool
-- (the assignee picker and the reviewer roster), without seeing grants for
-- other tools.
create policy tool_access_select_editorial_members on public.tool_access
  for select to authenticated
  using (
    public.ep_has_access(auth.uid())
    and tool_id = public.ep_tool_id()
    and revoked_at is null
  );

-- Editorial editors write audit events for privileged tool actions (meeting
-- transitions, decisions, config changes) as themselves, mirroring the
-- administrator insert policy.
create policy audit_events_insert_editorial_editor on public.audit_events
  for insert to authenticated
  with check (public.ep_is_editor(auth.uid()) and actor_id = auth.uid());

-- Default configuration -------------------------------------------------------
-- Ships a fully-formed submission form and starter rubric so day one is usable;
-- every row here is editable (or deactivatable) from the settings screens.

insert into public.ep_settings (id) values (true);

insert into public.ep_form_fields (key, label, help_text, field_type, options, required, sort_order)
values
  ('summary', 'Summary',
   'What is the story? Two or three sentences.',
   'long_text', null, true, 1),
  ('why_now', 'Why now?',
   'What makes this timely — a news peg, a season, a decision coming up?',
   'long_text', null, true, 2),
  ('sources', 'Possible sources',
   'Who could we talk to? Note any access you already have.',
   'long_text', null, false, 3),
  ('format', 'Suggested format', null,
   'select', '["Spot news", "Feature", "Interview / two-way", "Series", "Digital-first"]'::jsonb,
   false, 4);

insert into public.ep_criteria (name, description, guidance, weight, sort_order)
values
  ('News value', 'Is this new, consequential, or timely?',
   'Score high when the story tells listeners something they don''t already know and would want to.',
   1.0, 1),
  ('Local relevance', 'Does it matter to the WUWF listening area?',
   'A national story scores here only if there is a genuine local angle.',
   1.0, 2),
  ('Feasibility', 'Can we report this well with the time and people we have?',
   'Consider access to sources, travel, and how much reporting time it realistically needs.',
   1.0, 3),
  ('Audience impact', 'Will this inform, engage, or serve our audience?',
   'Think beyond reach: does it help someone decide, act, or understand their community?',
   1.0, 4);
