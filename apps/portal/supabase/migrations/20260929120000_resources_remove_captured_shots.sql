-- Resources: drop captured screenshots. The capture script
-- (scripts/resources-screenshots/, now removed) needed preview's and
-- production's keys at once, which no deployment has, so it never ran: every
-- captured-shot rc_media row was still a placeholder with no object, and the
-- four guides that referenced one showed only its alt text in a dashed box.
--
-- This removes those guides' figure nodes and then the placeholder rows.
-- Only figures pointing at a captured shot (screen_key set) are removed; a
-- screenshot an editor uploaded into an article is untouched. Each guide's
-- `source` is left as it is, so the version trigger keeps its
-- edited_since_release flag unchanged. Past versions still reference the
-- deleted ids and render their alt text, as a missing figure always does.

update public.rc_articles a
set body = jsonb_set(
      a.body,
      '{content}',
      coalesce(
        (
          select jsonb_agg(node order by ord)
          from jsonb_array_elements(a.body -> 'content') with ordinality as n(node, ord)
          where not (
            node ->> 'type' = 'figure'
            and exists (
              select 1
              from public.rc_media m
              where m.id::text = node -> 'attrs' ->> 'mediaId'
                and m.screen_key is not null
            )
          )
        ),
        '[]'::jsonb
      )
    ),
    version_note = 'Removed the screenshot placeholder'
where exists (
  select 1
  from jsonb_array_elements(a.body -> 'content') as n(node)
  join public.rc_media m on m.id::text = n.node -> 'attrs' ->> 'mediaId'
  where n.node ->> 'type' = 'figure'
    and m.screen_key is not null
);

delete from public.rc_media where screen_key is not null;
