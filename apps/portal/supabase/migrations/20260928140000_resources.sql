-- Resources: slice 1 (Foundation). A top-level area at /resources holding
-- three kinds of article in one table — station procedures, tool guides, and
-- release notes ("What's new"). See docs/resources-design.md. This slice is
-- read-only in the app: the schema, RLS, registry row, and seed content.
-- Editing, screenshots (rc_media + the resources-media bucket), the in-tool
-- Help panel, and the assistant capability are later slices.
--
-- Tables are prefixed rc_. Access follows Roadmap's shape exactly: the
-- registry row is default_access = 'approved_staff', so every active user is
-- a reader, and a tool_access grant carrying tool_role = 'editor' is the
-- elevation, not the ticket in (see 20260801121000_roadmap.sql).

create type public.rc_kind as enum ('procedure', 'guide', 'release_note');
create type public.rc_audience as enum ('staff', 'students', 'partners');
create type public.rc_source as enum ('editor', 'release');

-- Plain text of a ProseMirror body --------------------------------------------
-- Every text node's `text`, in document order. Used only by the generated
-- search column below; a pure function of its input, hence immutable. In
-- public (not private) because a generated column's expression is evaluated
-- with the inserting role's privileges — it is harmless as an RPC.

create function public.rc_body_text(body jsonb)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(string_agg(t #>> '{}', ' '), '')
  from jsonb_path_query(body, 'strict $.**.text') as t
  where jsonb_typeof(t) = 'string';
$$;

-- Articles --------------------------------------------------------------------

create table public.rc_articles (
  id uuid primary key default gen_random_uuid(),
  -- The stable identity migrations upsert on. Never match a seeded row by id.
  slug text not null unique,
  kind public.rc_kind not null,
  title text not null,
  -- One line, shown in lists (and later in the Help panel).
  summary text,
  -- ProseMirror JSON — see lib/roadmap/rich-text.ts for the whitelist. Never HTML.
  body jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  audience public.rc_audience[] not null default '{staff}',
  -- procedure
  area text,
  owner_role text,
  -- guide + release_note
  tool_id uuid references public.tools (id) on delete cascade,
  screen_keys text[] not null default '{}',
  released_on date,
  -- Order of a tool's guides in the guide list; lower first.
  sort_order integer not null default 0,
  -- provenance
  source public.rc_source not null default 'editor',
  -- The note recorded with this version in rc_article_versions ("Updated
  -- for PDF documents"). Set by whoever writes a new version.
  version_note text,
  needs_review boolean not null default false,
  edited_since_release boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(summary, '')), 'B')
    || setweight(to_tsvector('english', public.rc_body_text(body)), 'C')
  ) stored,

  constraint rc_articles_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint rc_articles_title_present check (length(trim(title)) > 0),
  constraint rc_articles_audience_present check (cardinality(audience) > 0),
  constraint rc_articles_procedure_shape check (
    kind <> 'procedure' or (area is not null and tool_id is null and released_on is null)
  ),
  constraint rc_articles_guide_shape check (
    kind <> 'guide' or (tool_id is not null and released_on is null)
  ),
  -- A release note may be portal-wide (tool_id null), but always has a date.
  constraint rc_articles_release_note_shape check (
    kind <> 'release_note' or released_on is not null
  )
);

comment on table public.rc_articles is
  'Resources: station procedures, tool guides, and release notes in one table, discriminated by kind. Upserted on slug by migrations. See docs/resources-design.md.';
comment on column public.rc_articles.edited_since_release is
  'True once an editor has changed a guide after the last release wrote it. A release migration must not overwrite such a body — it sets needs_review instead.';

create index rc_articles_kind_idx on public.rc_articles (kind);
create index rc_articles_tool_idx on public.rc_articles (tool_id);
create index rc_articles_released_on_idx on public.rc_articles (released_on desc)
  where kind = 'release_note';
create index rc_articles_search_idx on public.rc_articles using gin (search_vector);

create trigger set_rc_articles_updated_at
  before update on public.rc_articles
  for each row execute function public.set_updated_at();

-- Versions ------------------------------------------------------------------
-- Insert-only, like log_clock_versions: no update policy, ever. One row per
-- version of an article, including the current one, so a History list is a
-- single read.

create table public.rc_article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.rc_articles (id) on delete cascade,
  version integer not null,
  title text not null,
  body jsonb not null,
  source public.rc_source not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (article_id, version)
);

comment on table public.rc_article_versions is
  'Every version of an rc_articles row, current one included, written by triggers on rc_articles. Insert-only by design.';

-- Before update: a change to the title or body is a new version. An editor's
-- change marks a guide as diverged from the last release; a release's change
-- clears that.
create function public.rc_articles_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.title, new.body) is distinct from (old.title, old.body) then
    new.version := old.version + 1;
    if new.source = 'editor' then
      new.edited_since_release := true;
    else
      new.edited_since_release := false;
    end if;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;

create trigger rc_articles_version_bump
  before update on public.rc_articles
  for each row execute function public.rc_articles_before_update();

-- After insert or a version bump: snapshot the new state.
create function public.rc_articles_snapshot_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.version <> old.version then
    insert into public.rc_article_versions (article_id, version, title, body, source, note, created_by)
    values (new.id, new.version, new.title, new.body, new.source, new.version_note, auth.uid());
  end if;
  return null;
end;
$$;

create trigger rc_articles_version_snapshot
  after insert or update on public.rc_articles
  for each row execute function public.rc_articles_snapshot_version();

revoke execute on function public.rc_articles_before_update() from public, anon, authenticated;
revoke execute on function public.rc_articles_snapshot_version() from public, anon, authenticated;

-- Release note ↔ guide links ----------------------------------------------

create table public.rc_release_note_guides (
  release_note_id uuid not null references public.rc_articles (id) on delete cascade,
  guide_id uuid not null references public.rc_articles (id) on delete cascade,
  primary key (release_note_id, guide_id)
);

comment on table public.rc_release_note_guides is
  'Which guides a release note changed. Drives "Guide updated:" on What''s new and the provenance note on a guide.';

create index rc_release_note_guides_guide_idx on public.rc_release_note_guides (guide_id);

-- Authorization helpers -----------------------------------------------------
-- In `private`, never `public` — see 20260724120000_private_authz_functions.sql.

create function private.has_resources_access(uid uuid)
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
    where t.key = 'resources'
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

-- The elevation, not the ticket in, OR'd with administrator — the same shape
-- as private.is_roadmap_curator plus Roadmap's administrator branch.
create function private.is_resources_editor(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select private.has_resources_access(uid)
    and (
      private.is_administrator(uid)
      or exists (
        select 1
        from public.tool_access ta
        join public.tools t on t.id = ta.tool_id
        where ta.user_id = uid
          and t.key = 'resources'
          and ta.revoked_at is null
          and lower(coalesce(ta.tool_role, '')) = 'editor'
      )
    );
$$;

-- Which audience a reader belongs to, from the platform role the profile
-- already carries: students and faculty partners are their own audiences,
-- everyone else (staff, administrators) is staff.
create function private.resources_audience_for(uid uuid)
returns public.rc_audience
language sql
security definer
stable
set search_path = public
as $$
  select case p.platform_role
    when 'student' then 'students'::public.rc_audience
    when 'faculty_partner' then 'partners'::public.rc_audience
    else 'staff'::public.rc_audience
  end
  from public.profiles p
  where p.id = uid;
$$;

-- Whether this user may open this tool — the SQL twin of canOpenTool in
-- lib/auth/authz.ts. A guide or release note about a tool is visible only to
-- people who can open that tool. Takes a row column, so it stays a per-row call.
create function private.can_open_tool(uid uuid, p_tool_id uuid)
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
    where t.id = p_tool_id
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

revoke execute on function private.has_resources_access(uuid) from public, anon;
grant execute on function private.has_resources_access(uuid) to authenticated;
revoke execute on function private.is_resources_editor(uuid) from public, anon;
grant execute on function private.is_resources_editor(uuid) to authenticated;
revoke execute on function private.resources_audience_for(uuid) from public, anon;
grant execute on function private.resources_audience_for(uuid) to authenticated;
revoke execute on function private.can_open_tool(uuid, uuid) from public, anon;
grant execute on function private.can_open_tool(uuid, uuid) to authenticated;

-- Search --------------------------------------------------------------------
-- security invoker, so rc_articles RLS is still the boundary: a search only
-- ever ranks what the caller could already read.

create function public.rc_search_articles(p_query text, p_limit integer default 30)
returns table (id uuid, rank real)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, ts_rank(a.search_vector, q) as rank
  from public.rc_articles a,
       websearch_to_tsquery('english', coalesce(p_query, '')) as q
  where a.search_vector @@ q
  order by rank desc, a.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

revoke execute on function public.rc_search_articles(text, integer) from public, anon;
grant execute on function public.rc_search_articles(text, integer) to authenticated;

-- Row Level Security ----------------------------------------------------------
-- Readers see an article when it is addressed to their audience and, for one
-- about a tool, when they can open that tool. Editors see everything, since
-- they maintain it. Writes are editor-only; this slice has no write path in
-- the app, but the policies are the boundary whenever one lands.

alter table public.rc_articles enable row level security;
alter table public.rc_article_versions enable row level security;
alter table public.rc_release_note_guides enable row level security;

grant select, insert, update, delete on public.rc_articles to authenticated;
grant select, insert on public.rc_article_versions to authenticated;
grant select, insert, delete on public.rc_release_note_guides to authenticated;

create policy rc_articles_select on public.rc_articles
  for select to authenticated
  using (
    (select private.is_resources_editor((select auth.uid())))
    or (
      (select private.has_resources_access((select auth.uid())))
      and (select private.resources_audience_for((select auth.uid()))) = any (audience)
      and (tool_id is null or private.can_open_tool((select auth.uid()), tool_id))
    )
  );

create policy rc_articles_insert on public.rc_articles
  for insert to authenticated
  with check ((select private.is_resources_editor((select auth.uid()))));

create policy rc_articles_update on public.rc_articles
  for update to authenticated
  using ((select private.is_resources_editor((select auth.uid()))))
  with check ((select private.is_resources_editor((select auth.uid()))));

create policy rc_articles_delete on public.rc_articles
  for delete to authenticated
  using ((select private.is_resources_editor((select auth.uid()))));

-- Follows the parent: the subquery runs under rc_articles' own RLS.
create policy rc_article_versions_select on public.rc_article_versions
  for select to authenticated
  using (exists (select 1 from public.rc_articles a where a.id = article_id));

-- The snapshot trigger runs as the writing editor. No update policy: insert-only.
create policy rc_article_versions_insert on public.rc_article_versions
  for insert to authenticated
  with check ((select private.is_resources_editor((select auth.uid()))));

create policy rc_release_note_guides_select on public.rc_release_note_guides
  for select to authenticated
  using (exists (select 1 from public.rc_articles a where a.id = release_note_id));

create policy rc_release_note_guides_insert on public.rc_release_note_guides
  for insert to authenticated
  with check ((select private.is_resources_editor((select auth.uid()))));

create policy rc_release_note_guides_delete on public.rc_release_note_guides
  for delete to authenticated
  using ((select private.is_resources_editor((select auth.uid()))));

-- Scoped to editors, like Roadmap's curator policy: reading is not audited,
-- only creating, editing, and deleting articles (slice 2).
create policy audit_events_insert_resources_editor on public.audit_events
  for insert to authenticated
  with check (
    (select private.is_resources_editor((select auth.uid())))
    and actor_id = (select auth.uid())
  );

-- Registry row ------------------------------------------------------------------
-- Upsert, not update: a bare update silently no-ops on a project whose seed
-- never ran.

insert into public.tools (key, name, description, route, status, enabled, default_access, sort_order)
values (
  'resources',
  'Resources',
  'Station procedures, a guide to every tool in the portal, and notes on what changed.',
  '/resources',
  'available',
  true,
  'approved_staff',
  10
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  route = excluded.route,
  status = excluded.status,
  enabled = excluded.enabled,
  default_access = excluded.default_access;

-- Seed content ------------------------------------------------------------------
-- Guides and release notes only. Release notes are the real user-visible
-- changes recorded in CLAUDE.md; guides describe screens as they exist today.
-- Procedures are deliberately not seeded here: the station's own procedures
-- haven't been written into the portal yet, and placeholder SOPs must never
-- reach production (sample ones live in supabase/seed.sql for local/preview).
-- Every insert upserts on slug. source = 'release' marks rows a release wrote.

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, screen_keys, sort_order, source, version_note)
select 'sourcework-reference-another-source', 'guide'::public.rc_kind, 'Reference another source in a project', 'Use one interview or document in more than one story.', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A project can draw on more than one recording or document. When the same interview matters to more than one story, reference it from each project instead of uploading it again. Every project then shares one original and one transcript."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Add a source"}]},{"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Open the project. The row of pills above the transcript lists every source it references."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Select "},{"type":"text","text":"+ Reference another source","marks":[{"type":"bold"}]},{"type":"text","text":"."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Search for the source by title and choose it. It is added right away, with no confirmation step."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Switch between sources"}]},{"type":"paragraph","content":[{"type":"text","text":"Select a pill to show that source''s transcript, media, and excerpts. The page address changes to include "},{"type":"text","text":"?source=","marks":[{"type":"code"}]},{"type":"text","text":", so you can send a colleague a link straight to it."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Good to know"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"An excerpt belongs to the source that was selected when you made it."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Retrying a failed transcription retries the selected source, not the project''s first one."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"PDF documents are referenced the same way as audio. They open in the document viewer instead of the player."}]}]}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '{sourcework.project}'::text[], 10, 'release'::public.rc_source, 'Updated for PDF documents'
from public.tools t where t.key = 'transcription'
on conflict (slug) do update set
  title = excluded.title, summary = excluded.summary, body = excluded.body,
  tool_id = excluded.tool_id, screen_keys = excluded.screen_keys,
  sort_order = excluded.sort_order, source = excluded.source,
  version_note = excluded.version_note
where not public.rc_articles.edited_since_release;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, screen_keys, sort_order, source, version_note)
select 'sourcework-browse-source-library', 'guide'::public.rc_kind, 'Browse the Source Library', 'Every recording and document, whichever project it came from.', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The Source Library lists every recording and document uploaded to Sourcework, independent of the projects that use them. Open it from the "},{"type":"text","text":"Sources","marks":[{"type":"bold"}]},{"type":"text","text":" tab on the Sourcework home page."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Open a source"}]},{"type":"paragraph","content":[{"type":"text","text":"Select a source to open its own page. It shows the same working surface a project does — the player, transcript, and excerpts for audio and video, or the page viewer and text for a PDF — plus the list of projects that reference it."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Good to know"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"A source is the original recording or document. It is never edited; a project is the work that refers to it."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"To use a source in another story, add it from that project with "},{"type":"text","text":"+ Reference another source","marks":[{"type":"bold"}]},{"type":"text","text":"."}]}]}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '{sourcework.sources,sourcework.source}'::text[], 20, 'release'::public.rc_source, 'Created with the Source Library and multi-source projects'
from public.tools t where t.key = 'transcription'
on conflict (slug) do update set
  title = excluded.title, summary = excluded.summary, body = excluded.body,
  tool_id = excluded.tool_id, screen_keys = excluded.screen_keys,
  sort_order = excluded.sort_order, source = excluded.source,
  version_note = excluded.version_note
where not public.rc_articles.edited_since_release;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, screen_keys, sort_order, source, version_note)
select 'roadmap-curate-requests', 'guide'::public.rc_kind, 'Curate requests', 'Move requests through the roadmap statuses on the board.', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Curators decide what happens to each request. A curator is anyone an administrator has given the Curator role on Roadmap; administrators curate too."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Move a request"}]},{"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Open the Roadmap. As a curator you see a board with a column for each of the six statuses."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Drag a card to the status it should have. A move the status rules don''t allow is ignored and the card returns to its column."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Dropping a card on "},{"type":"text","text":"Declined","marks":[{"type":"bold"}]},{"type":"text","text":" asks for a reason first. The reason is shown on the request."}]}]}]},{"type":"paragraph","content":[{"type":"text","text":"You can also change a request''s status from its own page."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Good to know"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Everyone else sees the grouped list of decided requests, not the board."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Status changes are recorded in the audit log."}]}]}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '{roadmap.board,roadmap.post}'::text[], 20, 'release'::public.rc_source, 'Updated for the kanban board'
from public.tools t where t.key = 'roadmap'
on conflict (slug) do update set
  title = excluded.title, summary = excluded.summary, body = excluded.body,
  tool_id = excluded.tool_id, screen_keys = excluded.screen_keys,
  sort_order = excluded.sort_order, source = excluded.source,
  version_note = excluded.version_note
where not public.rc_articles.edited_since_release;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, screen_keys, sort_order, source, version_note)
select 'log-read-a-clock', 'guide'::public.rc_kind, 'Read a clock', 'What the ring diagram on a clock template''s page shows.', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A clock template''s page draws each version of the clock as a ring, the same way the network''s own clock diagrams do, with a table of the same slots beside it."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Reading the ring"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"The inner ring is the network''s structure: segments, newscasts, billboards, and breaks, each at its minute in the hour."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"The outer ring marks the station''s local opportunities — the slots WUWF may fill."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Minute labels at each boundary are rotated along the radius so close boundaries stay readable."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"A floating break is drawn across its whole window with a hatched fill and a dashed border. Its exact position within that window is the station''s call."}]}]}]},{"type":"paragraph","content":[{"type":"text","text":"Hover over a segment to see its label and times."}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '{log.clock}'::text[], 20, 'release'::public.rc_source, 'Updated for the ring diagram'
from public.tools t where t.key = 'log'
on conflict (slug) do update set
  title = excluded.title, summary = excluded.summary, body = excluded.body,
  tool_id = excluded.tool_id, screen_keys = excluded.screen_keys,
  sort_order = excluded.sort_order, source = excluded.source,
  version_note = excluded.version_note
where not public.rc_articles.edited_since_release;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, screen_keys, sort_order, source, version_note)
select 'log-schedule-a-program', 'guide'::public.rc_kind, 'Schedule a program', 'Put a program on the air on given days, at a time, on a clock.', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Scheduling a program is a producer task. Each program has its own page listing its schedule."}]},{"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Open "},{"type":"text","text":"Programs","marks":[{"type":"bold"}]},{"type":"text","text":" in Log and select the program."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Select "},{"type":"text","text":"+ Schedule","marks":[{"type":"bold"}]},{"type":"text","text":"."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Choose the clock template the program runs on, and the entry type: recurring, override, or holiday."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"For a recurring entry, pick the days of the week."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Enter the start date, and an end date if the entry stops."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Enter the air time and the duration in minutes, then save."}]}]}]},{"type":"paragraph","content":[{"type":"text","text":"If there is no clock template yet, create one under "},{"type":"text","text":"Clocks","marks":[{"type":"bold"}]},{"type":"text","text":" first."}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '{log.program,log.program.schedule}'::text[], 30, 'release'::public.rc_source, 'Updated for program pages'
from public.tools t where t.key = 'log'
on conflict (slug) do update set
  title = excluded.title, summary = excluded.summary, body = excluded.body,
  tool_id = excluded.tool_id, screen_keys = excluded.screen_keys,
  sort_order = excluded.sort_order, source = excluded.source,
  version_note = excluded.version_note
where not public.rc_articles.edited_since_release;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, screen_keys, sort_order, source, version_note)
select 'underwriting-find-contracts', 'guide'::public.rc_kind, 'Find and filter contracts', 'Search contracts and narrow the list by status.', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The Contracts page lists every underwriting contract, with search and filters in one row above it."}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Search by underwriter name or order number."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Use the chips to show all contracts, active ones, drafts, or the ones that need attention — a draft, or a contract with an open exception."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Select "},{"type":"text","text":"+ New contract","marks":[{"type":"bold"}]},{"type":"text","text":" to start the setup steps for a new order."}]}]}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '{underwriting.contracts}'::text[], 10, 'release'::public.rc_source, 'Updated for the shared list toolbar'
from public.tools t where t.key = 'underwriting'
on conflict (slug) do update set
  title = excluded.title, summary = excluded.summary, body = excluded.body,
  tool_id = excluded.tool_id, screen_keys = excluded.screen_keys,
  sort_order = excluded.sort_order, source = excluded.source,
  version_note = excluded.version_note
where not public.rc_articles.edited_since_release;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, released_on, source, version_note)
select 'release-2026-07-31-sourcework-pdf-documents', 'release_note'::public.rc_kind, 'PDF documents', null, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Upload a PDF as a source. Its text is extracted automatically and is searchable next to transcripts, and an excerpt can point to a page."}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '2026-07-31'::date, 'release'::public.rc_source, null
from public.tools t where t.key = 'transcription'
on conflict (slug) do update set
  title = excluded.title, body = excluded.body, tool_id = excluded.tool_id,
  released_on = excluded.released_on, source = excluded.source;

insert into public.rc_release_note_guides (release_note_id, guide_id)
select n.id, g.id from public.rc_articles n, public.rc_articles g
where n.slug = 'release-2026-07-31-sourcework-pdf-documents' and g.slug = 'sourcework-reference-another-source'
on conflict do nothing;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, released_on, source, version_note)
select 'release-2026-07-31-sourcework-rename', 'release_note'::public.rc_kind, 'Transcription Workspace is now Sourcework', null, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The tool has a new name and a new address, /sourcework. Clips are now called excerpts."}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '2026-07-31'::date, 'release'::public.rc_source, null
from public.tools t where t.key = 'transcription'
on conflict (slug) do update set
  title = excluded.title, body = excluded.body, tool_id = excluded.tool_id,
  released_on = excluded.released_on, source = excluded.source;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, released_on, source, version_note)
select 'release-2026-07-31-sourcework-source-library', 'release_note'::public.rc_kind, 'The Source Library, and more than one source per project', null, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Every recording and document now has its own page in the Source Library, and a project can reference more than one source."}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '2026-07-31'::date, 'release'::public.rc_source, null
from public.tools t where t.key = 'transcription'
on conflict (slug) do update set
  title = excluded.title, body = excluded.body, tool_id = excluded.tool_id,
  released_on = excluded.released_on, source = excluded.source;

insert into public.rc_release_note_guides (release_note_id, guide_id)
select n.id, g.id from public.rc_articles n, public.rc_articles g
where n.slug = 'release-2026-07-31-sourcework-source-library' and g.slug = 'sourcework-browse-source-library'
on conflict do nothing;

insert into public.rc_release_note_guides (release_note_id, guide_id)
select n.id, g.id from public.rc_articles n, public.rc_articles g
where n.slug = 'release-2026-07-31-sourcework-source-library' and g.slug = 'sourcework-reference-another-source'
on conflict do nothing;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, released_on, source, version_note)
select 'release-2026-08-05-academic-partnerships-wizard', 'release_note'::public.rc_kind, 'The inquiry form is now step-by-step', null, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"An inquiry can name more than one collaboration track, and the public form asks only the questions each chosen track needs."}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '2026-08-05'::date, 'release'::public.rc_source, null
from public.tools t where t.key = 'academic-partnerships'
on conflict (slug) do update set
  title = excluded.title, body = excluded.body, tool_id = excluded.tool_id,
  released_on = excluded.released_on, source = excluded.source;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, released_on, source, version_note)
select 'release-2026-08-06-academic-partnerships-delete', 'release_note'::public.rc_kind, 'Coordinators can delete an inquiry', null, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A permanent delete, with a confirmation step, is in the Danger zone on the submission page. The deletion is recorded in the audit log."}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '2026-08-06'::date, 'release'::public.rc_source, null
from public.tools t where t.key = 'academic-partnerships'
on conflict (slug) do update set
  title = excluded.title, body = excluded.body, tool_id = excluded.tool_id,
  released_on = excluded.released_on, source = excluded.source;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, released_on, source, version_note)
select 'release-2026-08-06-roadmap-kanban', 'release_note'::public.rc_kind, 'Curators get a kanban board', null, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Curators can drag a request between statuses. Moving a request to Declined asks for a reason first. Everyone else still sees the grouped list."}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '2026-08-06'::date, 'release'::public.rc_source, null
from public.tools t where t.key = 'roadmap'
on conflict (slug) do update set
  title = excluded.title, body = excluded.body, tool_id = excluded.tool_id,
  released_on = excluded.released_on, source = excluded.source;

insert into public.rc_release_note_guides (release_note_id, guide_id)
select n.id, g.id from public.rc_articles n, public.rc_articles g
where n.slug = 'release-2026-08-06-roadmap-kanban' and g.slug = 'roadmap-curate-requests'
on conflict do nothing;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, released_on, source, version_note)
select 'release-2026-08-06-log-clock-diagram', 'release_note'::public.rc_kind, 'Clock versions show as a ring diagram', null, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The clock page draws each version as a ring with minute labels. Floating breaks appear as a hatched window spanning their range."}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '2026-08-06'::date, 'release'::public.rc_source, null
from public.tools t where t.key = 'log'
on conflict (slug) do update set
  title = excluded.title, body = excluded.body, tool_id = excluded.tool_id,
  released_on = excluded.released_on, source = excluded.source;

insert into public.rc_release_note_guides (release_note_id, guide_id)
select n.id, g.id from public.rc_articles n, public.rc_articles g
where n.slug = 'release-2026-08-06-log-clock-diagram' and g.slug = 'log-read-a-clock'
on conflict do nothing;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, released_on, source, version_note)
select 'release-2026-09-27-underwriting-list-toolbar', 'release_note'::public.rc_kind, 'List pages share one toolbar', null, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Search, filters, and “+ New” now sit in one row above the full-width list. Create forms moved off the right column onto their own page or an inline card."}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '2026-09-27'::date, 'release'::public.rc_source, null
from public.tools t where t.key = 'underwriting'
on conflict (slug) do update set
  title = excluded.title, body = excluded.body, tool_id = excluded.tool_id,
  released_on = excluded.released_on, source = excluded.source;

insert into public.rc_release_note_guides (release_note_id, guide_id)
select n.id, g.id from public.rc_articles n, public.rc_articles g
where n.slug = 'release-2026-09-27-underwriting-list-toolbar' and g.slug = 'underwriting-find-contracts'
on conflict do nothing;

insert into public.rc_articles
  (slug, kind, title, summary, body, audience, tool_id, released_on, source, version_note)
select 'release-2026-09-27-log-program-pages', 'release_note'::public.rc_kind, 'Each program has its own page', null, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A program lists its schedule on its own page. Scheduling a program moved to a dedicated form for producers."}]}]}'::jsonb, '{staff,students,partners}'::public.rc_audience[],
  t.id, '2026-09-27'::date, 'release'::public.rc_source, null
from public.tools t where t.key = 'log'
on conflict (slug) do update set
  title = excluded.title, body = excluded.body, tool_id = excluded.tool_id,
  released_on = excluded.released_on, source = excluded.source;

insert into public.rc_release_note_guides (release_note_id, guide_id)
select n.id, g.id from public.rc_articles n, public.rc_articles g
where n.slug = 'release-2026-09-27-log-program-pages' and g.slug = 'log-schedule-a-program'
on conflict do nothing;
