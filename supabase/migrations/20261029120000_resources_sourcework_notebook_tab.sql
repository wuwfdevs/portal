-- Resources content for the Sourcework project's Notebook tab (CLAUDE.md, "Resources stay in step with the code").
-- Content only; no schema. Depends on 20261028120000.

select private.rc_release_note(
  p_slug => 'release-2026-10-29-sourcework-notebook-tab',
  p_tool_key => 'transcription',
  p_released_on => '2026-10-29',
  p_title => 'Sourcework: One Notebook tab for sources, review and excerpts',
  p_guide_slugs => array['sourcework-project-overview'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A project's sources, the findings and clips waiting for review, and its excerpts now sit under one Notebook tab, with a second row to move between them. The Sources list is also paged, 25 to a page, and each source's ⋮ menu is now at the right edge of its row."}]}]}$body$
);
