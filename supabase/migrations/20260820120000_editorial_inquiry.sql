-- Editorial Inquiry: a new tool. An editorial workspace that turns one broad
-- guiding question into concrete, reportable story questions through
-- iterative collaboration with an AI model — the core object is a question
-- tree, not a chat log. See docs/editorial-inquiry-design.md for the product
-- and architecture rationale.
--
-- Tables are prefixed ei_ per CLAUDE.md's directory conventions. Unlike most
-- recent tools, this one has no elevated role: every action (grow the tree,
-- reject, promote, add context, discuss) is ordinary membership, not a
-- privileged one — see design doc §3.

-- Inquiries ------------------------------------------------------------------
-- One row per guiding question a reporter has started. seed_question is the
-- inquiry's identity; there is no separate title (the switcher truncates
-- seed_question, matching the concept mockup).

create table public.ei_inquiries (
  id uuid primary key default gen_random_uuid(),
  seed_question text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ei_inquiries is
  'One guiding question a reporter has started growing a tree from. Shared within the tool, not per-reporter siloed — see design doc §3.';

create index ei_inquiries_created_at_idx on public.ei_inquiries (created_at desc);

-- Questions --------------------------------------------------------------------
-- One row per node in the tree. depth 0 is the root (the guiding question
-- itself, one per inquiry); depth 1 is a "line of inquiry"; depth 2+ narrows
-- further. status active/rejected/promoted — rejecting hides a node and its
-- descendants from the canvas but never deletes them (design doc §2).

create table public.ei_questions (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.ei_inquiries (id) on delete cascade,
  parent_id uuid references public.ei_questions (id) on delete cascade,
  depth integer not null,
  text text not null,
  status text not null default 'active' check (status in ('active', 'rejected', 'promoted')),
  has_assumption boolean not null default false,
  assumption_text text,
  -- The question's previous text, set when a discuss-proposed reframe is
  -- applied. A one-deep breadcrumb, not a full edit history.
  reframed_from_text text,
  -- Persisted canvas drag offset from the computed layout position. Null
  -- (the default) means "use the computed layout position" — unlike the
  -- single-session concept mockup, a reporter's manual rearrangement
  -- survives a reload.
  manual_dx double precision,
  manual_dy double precision,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ei_questions_depth_check check (depth >= 0),
  constraint ei_questions_root_shape_check check ((parent_id is null) = (depth = 0)),
  -- The root is the guiding question itself — never a dead end, never a
  -- finished story question.
  constraint ei_questions_reject_depth_check check (status <> 'rejected' or depth >= 1),
  -- A line of inquiry (depth 1) is a thematic frame, not yet reportable —
  -- promoting requires at least one drill-down first. See design doc §2.
  constraint ei_questions_promote_depth_check check (status <> 'promoted' or depth >= 2)
);

comment on table public.ei_questions is
  'One node in an inquiry''s question tree. Rejecting hides a node and its descendants from the canvas but never deletes them — status stays queryable. See design doc §2 for the depth rules on reject/promote.';

create index ei_questions_inquiry_idx on public.ei_questions (inquiry_id);
create index ei_questions_parent_idx on public.ei_questions (parent_id);

-- Context notes -----------------------------------------------------------------
-- A note, link, or excerpt attached to one question. Inheritance down a
-- branch is computed at read time by walking parent_id, not denormalized —
-- see design doc §4.

create table public.ei_context_notes (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.ei_questions (id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'link', 'excerpt')),
  body text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.ei_context_notes is
  'A note/link/excerpt attached to one question, visible on it and every descendant. Insert + select only — no update/delete, the same "add a new one instead" posture as log_content_items'' own lifecycle fields.';

create index ei_context_notes_question_idx on public.ei_context_notes (question_id);

-- Chat messages -------------------------------------------------------------------
-- The discuss thread, scoped to one question. sibling/context actions
-- execute immediately (applied_at set at insert time); reframe waits for an
-- explicit Apply click. See design doc §4.

create table public.ei_chat_messages (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.ei_questions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null,
  action_kind text check (action_kind in ('reframe', 'sibling', 'context')),
  action_payload jsonb,
  applied_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint ei_chat_messages_action_kind_role_check
    check (action_kind is null or role = 'assistant')
);

comment on table public.ei_chat_messages is
  'One question''s discuss thread. action_kind/action_payload record what an assistant turn proposed or did; applied_at is set immediately for sibling/context (they execute as part of the same turn) and stays null for reframe until the reporter applies it.';

create index ei_chat_messages_question_idx on public.ei_chat_messages (question_id, created_at);

-- updated_at maintenance ----------------------------------------------------

create trigger set_ei_inquiries_updated_at
  before update on public.ei_inquiries
  for each row execute function public.set_updated_at();

create trigger set_ei_questions_updated_at
  before update on public.ei_questions
  for each row execute function public.set_updated_at();

-- Authorization helper --------------------------------------------------------
-- In `private`, never `public` — see 20260724120000_private_authz_functions.sql.
-- No elevated role: every action in this tool is ordinary membership.

create function private.has_editorial_inquiry_access(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tool_access ta
    join public.tools t on t.id = ta.tool_id
    join public.profiles p on p.id = uid
    where ta.user_id = uid
      and t.key = 'editorial-inquiry'
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

revoke execute on function private.has_editorial_inquiry_access(uuid) from public, anon;
grant execute on function private.has_editorial_inquiry_access(uuid) to authenticated;

-- Creating an inquiry also creates its root question, in one transaction, so
-- the tree never has a moment where an inquiry exists with no root (or vice
-- versa). security definer so it can write both tables atomically under one
-- RLS-checked entry point; the check itself is the same predicate the plain
-- table policies below use.

create function public.ei_create_inquiry(p_seed_question text)
returns public.ei_inquiries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.ei_inquiries;
begin
  if not private.has_editorial_inquiry_access(auth.uid()) then
    raise exception 'not authorized';
  end if;
  if coalesce(trim(p_seed_question), '') = '' then
    raise exception 'seed_question is required';
  end if;

  insert into public.ei_inquiries (seed_question, created_by)
  values (trim(p_seed_question), auth.uid())
  returning * into v_inquiry;

  insert into public.ei_questions (inquiry_id, parent_id, depth, text, created_by)
  values (v_inquiry.id, null, 0, v_inquiry.seed_question, auth.uid());

  return v_inquiry;
end;
$$;

comment on function public.ei_create_inquiry(text) is
  'The only way an inquiry is created — inserts the ei_inquiries row and its depth-0 root ei_questions row together so neither can exist without the other.';

revoke execute on function public.ei_create_inquiry(text) from public, anon;
grant execute on function public.ei_create_inquiry(text) to authenticated;

-- Row Level Security ------------------------------------------------------------
-- Staff-only on every table. No public surface — this tool has none.

alter table public.ei_inquiries enable row level security;
alter table public.ei_questions enable row level security;
alter table public.ei_context_notes enable row level security;
alter table public.ei_chat_messages enable row level security;

-- No insert grant on ei_inquiries: the only way one is created is
-- ei_create_inquiry() above, which also seeds its root question.
grant select, update on public.ei_inquiries to authenticated;
grant select, insert, update on public.ei_questions to authenticated;
grant select, insert on public.ei_context_notes to authenticated;
grant select, insert, update on public.ei_chat_messages to authenticated;

create policy ei_inquiries_select on public.ei_inquiries
  for select to authenticated
  using (private.has_editorial_inquiry_access(auth.uid()));

create policy ei_inquiries_update on public.ei_inquiries
  for update to authenticated
  using (private.has_editorial_inquiry_access(auth.uid()))
  with check (private.has_editorial_inquiry_access(auth.uid()));

create policy ei_questions_select on public.ei_questions
  for select to authenticated
  using (private.has_editorial_inquiry_access(auth.uid()));

create policy ei_questions_insert on public.ei_questions
  for insert to authenticated
  with check (private.has_editorial_inquiry_access(auth.uid()));

create policy ei_questions_update on public.ei_questions
  for update to authenticated
  using (private.has_editorial_inquiry_access(auth.uid()))
  with check (private.has_editorial_inquiry_access(auth.uid()));

create policy ei_context_notes_select on public.ei_context_notes
  for select to authenticated
  using (private.has_editorial_inquiry_access(auth.uid()));

create policy ei_context_notes_insert on public.ei_context_notes
  for insert to authenticated
  with check (private.has_editorial_inquiry_access(auth.uid()) and created_by = auth.uid());

create policy ei_chat_messages_select on public.ei_chat_messages
  for select to authenticated
  using (private.has_editorial_inquiry_access(auth.uid()));

create policy ei_chat_messages_insert on public.ei_chat_messages
  for insert to authenticated
  with check (
    private.has_editorial_inquiry_access(auth.uid())
    and (role = 'assistant' or created_by = auth.uid())
  );

-- update is needed only to set applied_at on a reframe message once the
-- reporter applies it.
create policy ei_chat_messages_update on public.ei_chat_messages
  for update to authenticated
  using (private.has_editorial_inquiry_access(auth.uid()))
  with check (private.has_editorial_inquiry_access(auth.uid()));

-- audit_events: without this, a future logAuditEvent() call from this tool
-- would fail RLS (the existing policies admit only administrators, Editorial
-- Planning editors, and Audience Listening members) and be swallowed by that
-- helper's console.error. No caller uses this yet in milestone 1 (no
-- privileged action needs one), but the policy costs nothing to add now and
-- matches every other tool's own migration.
create policy audit_events_insert_editorial_inquiry on public.audit_events
  for insert to authenticated
  with check (private.has_editorial_inquiry_access(auth.uid()) and actor_id = auth.uid());

-- Registry row ------------------------------------------------------------------
-- Upsert rather than update, per the audience-listening/remote-interview
-- lesson: a bare update silently no-ops on a project whose seed never ran.

insert into public.tools (key, name, description, route, status, enabled, default_access, sort_order)
values (
  'editorial-inquiry',
  'Editorial Inquiry',
  'Turn a broad guiding question into concrete, reportable story questions by growing a question tree in collaboration with an AI model.',
  '/editorial-inquiry',
  'available',
  true,
  'invite_only',
  9
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  route = excluded.route,
  status = excluded.status,
  enabled = excluded.enabled;
