-- Roadmap: the fifth tool on the portal foundation, and the first one about the
-- portal itself. Posts (requests), votes, comments, and a curated status
-- workflow whose grouped view is the roadmap.
--
-- See docs/roadmap-design.md for the product and architecture rationale. Three
-- things below look different from the other four tools, and §6 of that
-- document explains each:
--
--   1. private.has_roadmap_access() reads tools.default_access instead of
--      requiring a tool_access grant. That column has documented
--      'approved_staff' as "any active user may open it" since the platform
--      schema was written, with nothing enforcing it; Roadmap is the first tool
--      that wants it. A wishlist an administrator has to grant one person at a
--      time collects nothing. Reading the column rather than hard-coding
--      "everyone" means an administrator can tighten the tool to invite_only
--      from the existing registry screen and this predicate follows.
--
--   2. Because entry is open to every active staff member, a tool_access grant
--      stops being the ticket in and becomes the elevation:
--      private.is_roadmap_curator() is a member whose grant carries
--      tool_role = 'curator'.
--
--   3. rd_posts has a `before update` guard trigger. RLS is row-level: the
--      policy that lets an author rewrite their own body would also let them
--      set their own status through PostgREST. Same shape of hole
--      ri_guest_join_waiting_room() closed for Remote Interview, where "a plain
--      RLS update policy on a guest's own row would also let them set their own
--      admitted_at".
--
-- Unlike Audience Listening, this tool has no public write surface and needs no
-- `security definer` API functions: every reader is an authenticated staff
-- member and every column on these rows is safe to hand any of them. Plain RLS
-- on plain tables is the whole boundary.
--
-- Tables are prefixed rd_ per CLAUDE.md's directory conventions.

create type public.rd_post_kind as enum ('feature', 'improvement', 'bug', 'new_tool');
create type public.rd_post_status as enum (
  'open', 'under_review', 'planned', 'in_progress', 'shipped', 'declined'
);

-- One row per request. `body` is a ProseMirror document (the Tiptap editor's
-- own JSON), never HTML: nothing in this codebase renders untrusted markup, so
-- there is no sanitizer here and none is needed. The whitelist of node and mark
-- types lives in lib/roadmap/rich-text.ts, which validates on the way in and
-- again on the way out. See docs/roadmap-design.md §6.
create table public.rd_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  body_text text not null default '',
  kind public.rd_post_kind not null default 'feature',
  status public.rd_post_status not null default 'open',
  tool_id uuid references public.tools (id) on delete set null,
  proposed_tool_name text,
  author_id uuid not null references public.profiles (id) on delete restrict,
  status_note text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rd_posts_title_check check (char_length(btrim(title)) between 3 and 160),
  -- Declining is a decision someone has to explain. "No" with no reason is the
  -- failure mode that stops people filing requests at all, so the note is a
  -- constraint rather than a convention an action has to remember.
  constraint rd_posts_declined_note_check
    check (status <> 'declined' or coalesce(btrim(status_note), '') <> ''),
  -- A new-tool request has to name its target one way or the other: a proposed
  -- tools row, or free text until an administrator promotes it into one.
  constraint rd_posts_new_tool_target_check
    check (
      kind <> 'new_tool'
      or tool_id is not null
      or coalesce(btrim(proposed_tool_name), '') <> ''
    )
);

comment on table public.rd_posts is
  'A request on the Roadmap tool. Targets an existing tool, a proposed one (tools.status = ''proposed''), or nothing. Status is what makes the same rows serve as both the wishlist and the roadmap.';
comment on column public.rd_posts.body is
  'ProseMirror JSON, not HTML. Validated against the whitelist in lib/roadmap/rich-text.ts at write time and again at render time.';
comment on column public.rd_posts.body_text is
  'Plain-text projection of body, derived at write time by richTextToPlainText(). A projection for list excerpts and future search, never authoritative.';
comment on column public.rd_posts.proposed_tool_name is
  'What a new-tool request wants built, before an administrator has created a proposed tools row for it. Cleared implicitly by linking tool_id.';

create index rd_posts_status_idx on public.rd_posts (status);
create index rd_posts_tool_idx on public.rd_posts (tool_id);
create index rd_posts_created_idx on public.rd_posts (created_at desc);
create index rd_posts_author_idx on public.rd_posts (author_id);

-- One vote per person per post, and the composite primary key IS that rule —
-- there is nothing to update on a vote, it exists or it doesn't. No downvotes:
-- in a newsroom this size a downvote on a colleague's request is a social act,
-- not a signal.
create table public.rd_votes (
  post_id uuid not null references public.rd_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index rd_votes_user_idx on public.rd_votes (user_id);

create table public.rd_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.rd_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  body jsonb not null,
  body_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rd_comments_post_idx on public.rd_comments (post_id, created_at);

-- Deliberately no vote_count/comment_count columns on rd_posts. Counts come
-- from two grouped reads merged in memory in listPosts(), the same shape
-- listQueries() uses in lib/audience-listening/queries.ts. At this scale that
-- is cheaper than trigger-maintained counters, and it keeps the guard trigger
-- below from having to tell an application update apart from a counter update
-- of its own — a whitelist in a security trigger is where a bypass hides.

-- updated_at maintenance (reuses public.set_updated_at() from the platform schema) ---

create trigger set_rd_posts_updated_at
  before update on public.rd_posts
  for each row execute function public.set_updated_at();

create trigger set_rd_comments_updated_at
  before update on public.rd_comments
  for each row execute function public.set_updated_at();

-- Authorization helpers ---------------------------------------------------------
-- Both in `private`, never `public`: a function in `public` is reachable as a
-- PostgREST RPC endpoint, letting any signed-in user probe other people's tool
-- access. See 20260724120000_private_authz_functions.sql for the full rationale.

-- Reads tools.default_access rather than requiring a tool_access grant — see
-- this file's header, point 1. Still requires the tool to be enabled and the
-- profile to be active, exactly like the other four predicates.
create function private.has_roadmap_access(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tools t
    join public.profiles p on p.id = uid
    where t.key = 'roadmap'
      and t.enabled
      and p.account_status = 'active'
      and (
        t.default_access = 'approved_staff'
        or exists (
          select 1
          from public.tool_access ta
          where ta.tool_id = t.id
            and ta.user_id = uid
            and ta.revoked_at is null
        )
      )
  );
$$;

-- The elevation, not the ticket in. tool_role stays free text the portal itself
-- does not interpret (CLAUDE.md) — this tool interprets it, and only this tool.
create function private.is_roadmap_curator(uid uuid)
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
      and t.key = 'roadmap'
      and ta.revoked_at is null
      and lower(coalesce(ta.tool_role, '')) = 'curator'
      and p.account_status = 'active'
  );
$$;

revoke execute on function private.has_roadmap_access(uuid) from public, anon;
grant execute on function private.has_roadmap_access(uuid) to authenticated;
revoke execute on function private.is_roadmap_curator(uuid) from public, anon;
grant execute on function private.is_roadmap_curator(uuid) to authenticated;

-- Curation guard ----------------------------------------------------------------
-- rd_posts_update admits the post's author, because an author edits their own
-- title and body. RLS cannot express "these columns but not those", so without
-- this an author could set their own status to 'planned' through PostgREST and
-- never load the page whose buttons we hid. Hiding the button is a courtesy;
-- this is the boundary.
create function public.rd_guard_post_curation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.author_id is distinct from old.author_id then
    raise exception 'A post''s author cannot be changed.'
      using errcode = 'check_violation';
  end if;

  if (new.status, new.status_note, new.kind, new.tool_id)
       is distinct from (old.status, old.status_note, old.kind, old.tool_id)
     and not (
       private.is_roadmap_curator(auth.uid())
       or private.is_administrator(auth.uid())
     )
  then
    raise exception 'Only a roadmap curator can change a post''s status, kind, or linked tool.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.rd_guard_post_curation() from public, anon, authenticated;

create trigger rd_posts_guard_curation
  before update on public.rd_posts
  for each row execute function public.rd_guard_post_curation();

-- Row Level Security ------------------------------------------------------------
-- Membership is "any active staff member" while the registry row stays
-- approved_staff (see the header). Within that, the trust model is the shared
-- workspace the other tools use: everyone sees everything. Ownership is
-- asserted only where destroying or rewriting someone else's words is possible.

alter table public.rd_posts enable row level security;
alter table public.rd_votes enable row level security;
alter table public.rd_comments enable row level security;

grant select, insert, update, delete on public.rd_posts to authenticated;
-- No update grant on votes: a vote is created or removed, never edited.
grant select, insert, delete on public.rd_votes to authenticated;
grant select, insert, update, delete on public.rd_comments to authenticated;

create policy rd_posts_select on public.rd_posts
  for select
  to authenticated
  using (private.has_roadmap_access(auth.uid()));

create policy rd_posts_insert on public.rd_posts
  for insert
  to authenticated
  with check (private.has_roadmap_access(auth.uid()) and author_id = auth.uid());

-- The author edits their own words; a curator (or an administrator) curates.
-- Which COLUMNS each may touch is the guard trigger's job, above.
create policy rd_posts_update on public.rd_posts
  for update
  to authenticated
  using (
    private.has_roadmap_access(auth.uid())
    and (
      author_id = auth.uid()
      or private.is_roadmap_curator(auth.uid())
      or private.is_administrator(auth.uid())
    )
  )
  with check (
    private.has_roadmap_access(auth.uid())
    and (
      author_id = auth.uid()
      or private.is_roadmap_curator(auth.uid())
      or private.is_administrator(auth.uid())
    )
  );

create policy rd_posts_delete on public.rd_posts
  for delete
  to authenticated
  using (
    private.has_roadmap_access(auth.uid())
    and (author_id = auth.uid() or private.is_roadmap_curator(auth.uid()))
  );

create policy rd_votes_select on public.rd_votes
  for select
  to authenticated
  using (private.has_roadmap_access(auth.uid()));

create policy rd_votes_insert on public.rd_votes
  for insert
  to authenticated
  with check (private.has_roadmap_access(auth.uid()) and user_id = auth.uid());

create policy rd_votes_delete on public.rd_votes
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy rd_comments_select on public.rd_comments
  for select
  to authenticated
  using (private.has_roadmap_access(auth.uid()));

create policy rd_comments_insert on public.rd_comments
  for insert
  to authenticated
  with check (private.has_roadmap_access(auth.uid()) and author_id = auth.uid());

-- Nobody edits someone else's comment, curator included.
create policy rd_comments_update on public.rd_comments
  for update
  to authenticated
  using (private.has_roadmap_access(auth.uid()) and author_id = auth.uid())
  with check (private.has_roadmap_access(auth.uid()) and author_id = auth.uid());

create policy rd_comments_delete on public.rd_comments
  for delete
  to authenticated
  using (
    private.has_roadmap_access(auth.uid())
    and (author_id = auth.uid() or private.is_roadmap_curator(auth.uid()))
  );

-- Additive portal-schema policies -----------------------------------------------
-- The only two this tool needs, and both are the "narrowly-scoped additive RLS
-- policies" CLAUDE.md sanctions for a new tool.

-- A proposed tool carries enabled = false, so tools_select_enabled_or_admin
-- hides it from everyone but administrators. Roadmap members need to see
-- proposed rows to file posts against them — and only those rows: a genuinely
-- disabled real tool stays hidden from them, exactly as before.
create policy tools_select_proposed_for_roadmap on public.tools
  for select
  to authenticated
  using (status = 'proposed' and private.has_roadmap_access(auth.uid()));

-- Scoped to curators, not to every member — unlike the equivalent policy in
-- every other tool's migration, where "member" is a much smaller set. Filing a
-- post and leaving a comment are ordinary writes by ordinary users, recorded by
-- the author column on the row itself; only curation is audited. Without this,
-- logAuditEvent() from this tool would fail RLS and be swallowed by its own
-- console.error.
create policy audit_events_insert_roadmap_curator on public.audit_events
  for insert
  to authenticated
  with check (private.is_roadmap_curator(auth.uid()) and actor_id = auth.uid());

-- Tool registry -------------------------------------------------------------------
-- Upsert rather than update, following the Audience Listening migration: a bare
-- `update` silently no-ops on a project whose seed never ran. default_access is
-- 'approved_staff' — the first row in this registry to use it, and the value
-- private.has_roadmap_access() reads.

insert into public.tools (key, name, description, route, status, enabled, default_access, sort_order)
values (
  'roadmap',
  'Roadmap',
  'Ask for what these tools should do next, vote on what other people asked for, and follow what is planned, in progress, and shipped.',
  '/roadmap',
  'available',
  true,
  'approved_staff',
  5
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  route = excluded.route,
  status = excluded.status,
  enabled = excluded.enabled,
  default_access = excluded.default_access;
