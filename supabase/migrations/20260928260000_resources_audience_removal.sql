-- Resources: drop the audience/platform-role visibility split. It never had
-- a real effect: private.rc_release_guide()/rc_release_note() default
-- p_audience to '{staff,students,partners}' and no migration has ever passed
-- anything else, so every article a real release ever wrote is already
-- visible to all three; no student or faculty_partner profile has ever
-- existed in this portal (checked directly against production); and an
-- editor or administrator already bypasses the check entirely. The only
-- differentiated audience values on file are the three local/preview-only
-- samples in supabase/seed.sql.
--
-- Simplify: every active profile with Resources access reads every article.
-- Per-article restriction by role/function is deferred to whatever real
-- model gets designed for that later (see CLAUDE.md) — audience was not it.

-- RLS: drop the audience clause from the select policy.
alter policy rc_articles_select on public.rc_articles
  using (
    (select private.is_resources_editor((select auth.uid())))
    or (
      (select private.has_resources_access((select auth.uid())))
      and (tool_id is null or private.can_open_tool((select auth.uid()), tool_id))
    )
  );

-- The release helpers no longer take (or need) an audience argument. The
-- parameter list is changing, so this is a drop + recreate, not
-- create or replace.
drop function private.rc_release_guide(text, text, text, text, jsonb, text[], integer, text, public.rc_audience[]);
drop function private.rc_release_note(text, text, date, text, jsonb, text[], public.rc_audience[]);

create function private.rc_release_guide(
  p_slug text,
  p_tool_key text,
  p_title text,
  p_summary text,
  p_body jsonb,
  p_screen_keys text[],
  p_sort_order integer,
  p_version_note text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_tool_id uuid;
  v_existing public.rc_articles%rowtype;
begin
  select id into v_tool_id from public.tools where key = p_tool_key;
  if v_tool_id is null then
    raise exception 'rc_release_guide(%): no tool with key %', p_slug, p_tool_key;
  end if;

  select * into v_existing from public.rc_articles where slug = p_slug;

  if not found then
    insert into public.rc_articles
      (slug, kind, title, summary, body, tool_id, screen_keys, sort_order,
       source, version_note)
    values
      (p_slug, 'guide', p_title, p_summary, p_body, v_tool_id, p_screen_keys,
       p_sort_order, 'release', p_version_note);
    return;
  end if;

  if v_existing.kind <> 'guide' then
    raise exception 'rc_release_guide(%): that slug is a %, not a guide', p_slug, v_existing.kind;
  end if;

  if v_existing.edited_since_release then
    -- An editor changed this guide after the last release wrote it. Their
    -- words win; the release note still ships, and an editor reconciles.
    update public.rc_articles set needs_review = true where id = v_existing.id;
    return;
  end if;

  update public.rc_articles set
    title = p_title,
    summary = p_summary,
    body = p_body,
    tool_id = v_tool_id,
    screen_keys = p_screen_keys,
    sort_order = p_sort_order,
    source = 'release',
    version_note = p_version_note,
    needs_review = false
  where id = v_existing.id;
end;
$$;

create function private.rc_release_note(
  p_slug text,
  p_tool_key text,
  p_released_on date,
  p_title text,
  p_body jsonb,
  p_guide_slugs text[] default '{}'
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_tool_id uuid;
  v_note_id uuid;
  v_guide_slug text;
  v_guide_id uuid;
begin
  if p_tool_key is not null then
    select id into v_tool_id from public.tools where key = p_tool_key;
    if v_tool_id is null then
      raise exception 'rc_release_note(%): no tool with key %', p_slug, p_tool_key;
    end if;
  end if;

  insert into public.rc_articles
    (slug, kind, title, body, tool_id, released_on, source)
  values
    (p_slug, 'release_note', p_title, p_body, v_tool_id, p_released_on, 'release')
  on conflict (slug) do update set
    title = excluded.title,
    body = excluded.body,
    tool_id = excluded.tool_id,
    released_on = excluded.released_on,
    source = excluded.source
  where public.rc_articles.kind = 'release_note'
  returning id into v_note_id;

  if v_note_id is null then
    raise exception 'rc_release_note(%): that slug is taken by an article that is not a release note', p_slug;
  end if;

  foreach v_guide_slug in array coalesce(p_guide_slugs, '{}') loop
    select id into v_guide_id from public.rc_articles where slug = v_guide_slug and kind = 'guide';
    if v_guide_id is null then
      raise exception 'rc_release_note(%): no guide with slug %', p_slug, v_guide_slug;
    end if;
    insert into public.rc_release_note_guides (release_note_id, guide_id)
    values (v_note_id, v_guide_id)
    on conflict do nothing;
  end loop;
end;
$$;

revoke execute on function private.rc_release_guide(text, text, text, text, jsonb, text[], integer, text)
  from public, anon, authenticated;
revoke execute on function private.rc_release_note(text, text, date, text, jsonb, text[])
  from public, anon, authenticated;

-- Drop the column, its resolver function, and the enum type, in that order
-- (the type can't go while anything still references it).
alter table public.rc_articles drop constraint rc_articles_audience_present;
alter table public.rc_articles drop column audience;

drop function private.resources_audience_for(uuid);
drop type public.rc_audience;
