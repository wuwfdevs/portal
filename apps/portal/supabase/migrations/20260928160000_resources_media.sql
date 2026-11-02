-- Resources: slice 2 (Editing and screenshots). Screenshots for procedures
-- and tool guides — the first images anywhere in a rich-text body. See
-- docs/resources-design.md, "Screenshots".
--
-- A body's `figure` node stores an rc_media id, never a URL
-- (lib/rich-text.ts). The renderer looks the row up and signs a URL for its
-- object, so a body can only ever show an object in this bucket, and only
-- to someone Storage's own policies let read it.
--
-- Two kinds of row:
--   * An editor's upload belongs to one article (article_id set) and is
--     visible exactly when that article is.
--   * A captured shot (scripts/resources-screenshots/) is shared by every
--     guide that shows its screen: article_id is null, and (screen_key, name)
--     is the identity the script upserts on, so re-capturing refreshes every
--     guide that uses it without touching a body.

create table public.rc_media (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.rc_articles (id) on delete cascade,
  object_path text not null unique,
  -- Null until the object exists (a shot a migration has declared but the
  -- capture script hasn't run for yet); the renderer shows the alt text.
  width integer,
  height integer,
  alt text not null,
  source public.rc_source not null default 'editor',
  screen_key text,
  name text,
  captured_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint rc_media_alt_present check (length(trim(alt)) > 0),
  constraint rc_media_dimensions_positive check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  constraint rc_media_shot_identity check ((screen_key is null) = (name is null)),
  constraint rc_media_shot_or_article check (article_id is not null or screen_key is not null)
);

comment on table public.rc_media is
  'Screenshots referenced by figure nodes in rc_articles bodies. An editor upload has article_id; a captured shot has (screen_key, name) and no article. The object lives in the private resources-media bucket at object_path.';

create unique index rc_media_shot_key on public.rc_media (screen_key, name)
  where screen_key is not null;
create index rc_media_article_idx on public.rc_media (article_id);

alter table public.rc_media enable row level security;

grant select, insert, update, delete on public.rc_media to authenticated;

-- An article's upload follows the article (the subquery runs under
-- rc_articles' own RLS); a shared shot is readable by any Resources reader —
-- the guides that embed it are what's scoped.
create policy rc_media_select on public.rc_media
  for select to authenticated
  using (
    (select private.is_resources_editor((select auth.uid())))
    or (
      (select private.has_resources_access((select auth.uid())))
      and (
        article_id is null
        or exists (select 1 from public.rc_articles a where a.id = article_id)
      )
    )
  );

create policy rc_media_insert on public.rc_media
  for insert to authenticated
  with check ((select private.is_resources_editor((select auth.uid()))));

create policy rc_media_update on public.rc_media
  for update to authenticated
  using ((select private.is_resources_editor((select auth.uid()))))
  with check ((select private.is_resources_editor((select auth.uid()))));

create policy rc_media_delete on public.rc_media
  for delete to authenticated
  using ((select private.is_resources_editor((select auth.uid()))));

-- Bucket ------------------------------------------------------------------------
-- Private. PNG and WebP only, 2 MiB — the editor enforces the same limits
-- (and a 2400px width) before uploading.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resources-media', 'resources-media', false, 2097152, array['image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Reading an object follows its rc_media row's visibility (the subquery runs
-- under rc_media's RLS above). Editors read everything, which storage-js
-- also needs to upsert.
create policy resources_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resources-media'
    and (
      (select private.is_resources_editor((select auth.uid())))
      -- objects.name, qualified: rc_media has its own `name` column, which
      -- an unqualified reference inside this subquery would resolve to.
      or exists (select 1 from public.rc_media m where m.object_path = objects.name)
    )
  );

create policy resources_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resources-media' and (select private.is_resources_editor((select auth.uid())))
  );

create policy resources_media_update on storage.objects
  for update to authenticated
  using (bucket_id = 'resources-media' and (select private.is_resources_editor((select auth.uid()))))
  with check (
    bucket_id = 'resources-media' and (select private.is_resources_editor((select auth.uid())))
  );

create policy resources_media_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'resources-media' and (select private.is_resources_editor((select auth.uid()))));

-- The first captured shot -------------------------------------------------------
-- Declared here, captured by the script: until
-- scripts/resources-screenshots/ has run, the guide shows this
-- row's alt text in a placeholder. The id is fixed (chosen here, not
-- generated) because the guide body below references it. The element it
-- captures carries data-help-shot="source-grid" in
-- src/app/(portal)/sourcework/[id]/source-card-grid.tsx.

insert into public.rc_media (id, object_path, alt, source, screen_key, name)
values (
  '5c1d8f0e-2a47-4b6e-9f3d-8e2b7a4c6d15',
  'shots/sourcework.project/source-grid.png',
  'A project''s source cards, with + Add source above them and the Sources and Excerpts tabs.',
  'release',
  'sourcework.project',
  'source-grid'
)
on conflict do nothing;

-- The two Sourcework guides slice 1 seeded described the project page's old
-- pill row and its "+ Reference another source" button; the page has since
-- become a card grid with "+ Add source". Both guides are corrected here, and
-- the project-workspace guide gains the screenshot. Same upsert rule as the
-- seed: an editor's changes since the last release are never overwritten —
-- the guide is flagged for review instead.

update public.rc_articles
set needs_review = true
where slug in ('sourcework-reference-another-source', 'sourcework-browse-source-library')
  and edited_since_release;

update public.rc_articles
set
  title = 'Add another source to a project',
  body = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A project can draw on more than one recording or document. When the same interview matters to more than one story, add it to each project instead of uploading it again. Every project then shares one original and one transcript."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Add a source"}]},{"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Open the project. It opens on a card for each source it references."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Select "},{"type":"text","text":"+ Add source","marks":[{"type":"bold"}]},{"type":"text","text":"."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"On "},{"type":"text","text":"Find existing","marks":[{"type":"bold"}]},{"type":"text","text":", search for the source by title and choose it. It is added right away, with no confirmation step."}]}]}]},{"type":"figure","attrs":{"mediaId":"5c1d8f0e-2a47-4b6e-9f3d-8e2b7a4c6d15","alt":"A project''s source cards, with + Add source above them and the Sources and Excerpts tabs.","caption":"A project''s sources, before one is opened."}},{"type":"paragraph","content":[{"type":"text","text":"Upload new","marks":[{"type":"bold"}]},{"type":"text","text":" in the same window adds a recording or PDF that isn''t in Sourcework yet."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Switch between sources"}]},{"type":"paragraph","content":[{"type":"text","text":"Select a card to open that source''s transcript, media, and excerpts. The page address changes to include "},{"type":"text","text":"?source=","marks":[{"type":"code"}]},{"type":"text","text":", so you can send a colleague a link straight to it. "},{"type":"text","text":"← All sources in this project","marks":[{"type":"bold"}]},{"type":"text","text":" goes back to the cards."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Good to know"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"An excerpt belongs to the source that was open when you made it."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Retrying a failed transcription retries the open source, not the project''s first one."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"PDF documents are added the same way as audio. They open in the document viewer instead of the player."}]}]}]}]}'::jsonb,
  source = 'release',
  version_note = 'Updated for the source cards, and added a screenshot'
where slug = 'sourcework-reference-another-source' and not edited_since_release;

update public.rc_articles
set
  body = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The Source Library lists every recording and document uploaded to Sourcework, independent of the projects that use them. Open it from the "},{"type":"text","text":"Sources","marks":[{"type":"bold"}]},{"type":"text","text":" tab on the Sourcework home page."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Open a source"}]},{"type":"paragraph","content":[{"type":"text","text":"Select a source to open its own page. It shows the same working surface a project does — the player, transcript, and excerpts for audio and video, or the page viewer and text for a PDF — plus the list of projects that reference it."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Good to know"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"A source is the original recording or document. It is never edited; a project is the work that refers to it."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"To use a source in another story, open that project, select "},{"type":"text","text":"+ Add source","marks":[{"type":"bold"}]},{"type":"text","text":", and find it on "},{"type":"text","text":"Find existing","marks":[{"type":"bold"}]},{"type":"text","text":"."}]}]}]}]}'::jsonb,
  source = 'release',
  version_note = 'Updated for + Add source'
where slug = 'sourcework-browse-source-library' and not edited_since_release;
