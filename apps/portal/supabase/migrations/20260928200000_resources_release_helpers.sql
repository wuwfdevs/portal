-- Resources slice 5: helpers a release migration calls to keep Resources in
-- step with the code (CLAUDE.md, "Resources stay in step with the code").
--
-- Every user-visible change ships a migration that writes one release note
-- and updates or adds the guides for the screens it affects. Written by hand
-- as bare inserts, that's a dozen lines per article with two rules easy to get
-- wrong: match on slug, never id; and never overwrite a guide an editor has
-- changed since the last release — flag it for review instead. These two
-- functions hold both rules, so a release migration is a list of calls:
--
--   select private.rc_release_guide(
--     p_slug => 'log-read-a-clock', p_tool_key => 'log',
--     p_title => 'Read a clock', p_summary => '…',
--     p_screen_keys => array['log.clock'], p_sort_order => 10,
--     p_version_note => 'Updated for …',
--     p_body => $body${"type":"doc","content":[…]}$body$);
--
--   select private.rc_release_note(
--     p_slug => 'release-2026-10-01-log-…', p_tool_key => 'log',
--     p_released_on => '2026-10-01', p_title => '…',
--     p_guide_slugs => array['log-read-a-clock'],
--     p_body => $body${"type":"doc","content":[…]}$body$);
--
-- Named arguments, $body$ quoting, and p_body last are the convention, not
-- decoration:
-- src/lib/resources/release-content.test.ts finds every call in
-- supabase/migrations by them and checks each body against the rich-text
-- whitelist and each screen key against lib/resources/screens.ts.
--
-- In `private`, not reachable over the API, and execute is revoked from every
-- API role: only a migration (running as the owner) calls these. They are
-- security invoker — a migration already bypasses RLS.

create function private.rc_release_guide(
  p_slug text,
  p_tool_key text,
  p_title text,
  p_summary text,
  p_body jsonb,
  p_screen_keys text[],
  p_sort_order integer,
  p_version_note text,
  p_audience public.rc_audience[] default '{staff,students,partners}'
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
      (slug, kind, title, summary, body, audience, tool_id, screen_keys, sort_order,
       source, version_note)
    values
      (p_slug, 'guide', p_title, p_summary, p_body, p_audience, v_tool_id, p_screen_keys,
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
    audience = p_audience,
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
  p_guide_slugs text[] default '{}',
  p_audience public.rc_audience[] default '{staff,students,partners}'
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
    (slug, kind, title, body, audience, tool_id, released_on, source)
  values
    (p_slug, 'release_note', p_title, p_body, p_audience, v_tool_id, p_released_on, 'release')
  on conflict (slug) do update set
    title = excluded.title,
    body = excluded.body,
    audience = excluded.audience,
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

revoke execute on function private.rc_release_guide(text, text, text, text, jsonb, text[], integer, text, public.rc_audience[])
  from public, anon, authenticated;
revoke execute on function private.rc_release_note(text, text, date, text, jsonb, text[], public.rc_audience[])
  from public, anon, authenticated;
