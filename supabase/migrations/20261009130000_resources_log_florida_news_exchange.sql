-- Resources content for the Florida News Exchange source in Log
-- (CLAUDE.md, "Resources stay in step with the code"). Content only; no schema.
-- The Sources guide ('log-npr-and-weather') should also gain a section for the
-- new card; it is linked here and still needs that edit.

select private.rc_release_note(
  p_slug => 'release-2026-10-09-log-florida-news-exchange',
  p_tool_key => 'log',
  p_released_on => '2026-10-09',
  p_title => 'Florida News Exchange stories in Sources',
  p_guide_slugs => array['log-npr-and-weather'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The "},{"type":"text","text":"Sources","marks":[{"type":"bold"}]},{"type":"text","text":" tab now has a Florida News Exchange card. It lists the stories other Florida stations shared through PRX in the last 24 hours, with a wrap and its cut together, each with its audio, a download, and a link to its PRX page. The feed's description is often only a summary, so the full script may be on the PRX page. Select "},{"type":"text","text":"Add to library","marks":[{"type":"bold"}]},{"type":"text","text":" to open the new content item form with the title and description filled in, then add the script and components as you would for any item."}]}]}$body$
);
