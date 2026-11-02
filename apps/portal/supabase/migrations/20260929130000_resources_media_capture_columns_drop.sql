-- Resources: rc_media without captured shots. 20260929120000 removed the
-- last captured-shot rows; every row is now an editor's upload into one
-- article. So the columns and rules that existed only for a shot shared
-- across guides go:
--   * screen_key / name / captured_at, their constraints and unique index;
--   * source -- 'release' meant a row a migration declared for a shot, so
--     every remaining row would read 'editor';
--   * the nullable article_id, width and height -- a shot had no article and
--     no size until it was captured, while an upload always has all three;
--   * the select policy's "article_id is null" branch, which let any reader
--     see a shared shot.

alter table public.rc_media
  drop constraint rc_media_shot_identity,
  drop constraint rc_media_shot_or_article,
  drop constraint rc_media_dimensions_positive;

drop index public.rc_media_shot_key;

alter table public.rc_media
  drop column screen_key,
  drop column name,
  drop column captured_at,
  drop column source,
  alter column article_id set not null,
  alter column width set not null,
  alter column height set not null,
  add constraint rc_media_dimensions_positive check (width > 0 and height > 0);

comment on table public.rc_media is
  'Screenshots an editor uploaded into an rc_articles body, referenced by its figure nodes. The object lives in the private resources-media bucket at object_path.';

-- An upload follows its article's visibility (the subquery runs under
-- rc_articles' own RLS).
drop policy rc_media_select on public.rc_media;
create policy rc_media_select on public.rc_media
  for select to authenticated
  using (
    (select private.is_resources_editor((select auth.uid())))
    or (
      (select private.has_resources_access((select auth.uid())))
      and exists (select 1 from public.rc_articles a where a.id = article_id)
    )
  );
