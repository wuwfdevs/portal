-- Resources content for the 2026-10-09 logic consolidation (CLAUDE.md, "Resources stay in step with the code").
-- Content only; no schema. Release notes only: the guides' documented steps did not change, so they are
-- linked rather than rewritten.

select private.rc_release_note(
  p_slug => 'release-2026-10-09-roadmap-board-failed-moves',
  p_tool_key => 'roadmap',
  p_released_on => '2026-10-09',
  p_title => 'Roadmap: the board says when a move did not save',
  p_guide_slugs => array['roadmap-curate-requests'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"When a card dropped on the board cannot be saved, it now returns to where it was and the board says why. Two quick moves of the same card can no longer leave it in a column that was never saved, and the board follows the latest data after the page refreshes."}]}]}$body$
);

select private.rc_release_note(
  p_slug => 'release-2026-10-09-academic-partnerships-board-and-search',
  p_tool_key => 'academic-partnerships',
  p_released_on => '2026-10-09',
  p_title => 'Academic Partnerships: board errors and search',
  p_guide_slugs => array['academic-partnerships-work-the-pipeline'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"When a card dropped on the board cannot be saved, the board now says why instead of quietly moving the card back. Dropping a card on the column it is already in no longer adds an entry to its history, and changing the owner to the same person does not either. Searching the submissions list treats an underscore or a percent sign as the character you typed."}]}]}$body$
);
