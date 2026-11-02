-- Resources content for Sourcework bulk accept (CLAUDE.md, "Resources stay in step with the
-- code"). Content only; no schema.

select private.rc_release_guide(
  p_slug => 'sourcework-accept-in-bulk',
  p_tool_key => 'transcription',
  p_title => 'Accepting suggestions in bulk',
  p_summary => 'Accept every waiting data point, theme or suggested quote at once instead of one by one.',
  p_screen_keys => array['sourcework.themes', 'sourcework.theme_quotes', 'sourcework.source'],
  p_sort_order => 24,
  p_version_note => 'First version',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"When the model has suggested a lot, you do not have to decide on each one separately. Three screens have an accept-all button. It asks you to confirm first, because you are deciding on many things without reading each."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Data points"}]},{"type":"paragraph","content":[{"type":"text","text":"On a source, with the To review filter showing, "},{"type":"text","text":"Accept all","marks":[{"type":"bold"}]},{"type":"text","text":" accepts every data point in that source still waiting for review. On the project’s Themes tab, the Waiting for you panel has the same button for every source in the project. Accepted data points are then filed into your accepted themes, as when you accept one at a time."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Themes"}]},{"type":"paragraph","content":[{"type":"text","text":"On the Themes tab, "},{"type":"text","text":"Accept all suggested","marks":[{"type":"bold"}]},{"type":"text","text":" accepts every suggested theme as it is worded. Merge suggestions are a separate decision and keep their own Accept and Reject buttons. If a theme reads like a topic, reword it first with Edit."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Suggested quotes"}]},{"type":"paragraph","content":[{"type":"text","text":"On a theme’s suggested quotes, "},{"type":"text","text":"Accept all","marks":[{"type":"bold"}]},{"type":"text","text":" saves the waiting clips as excerpts, each at the cut the model suggested. To use a trimmed cut, accept that clip on its own. Up to 30 clips are accepted at a time; if more are waiting, accept again. A clip that cannot be accepted stays in the list."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Taking a decision back"}]},{"type":"paragraph","content":[{"type":"text","text":"Nothing is deleted by accepting. A data point can be rejected or put back for review, a theme rejected from its page, and an accepted quote’s excerpt deleted like any other."}]}]}$body$
);

select private.rc_release_note(
  p_slug => 'release-2026-10-11-sourcework-accept-in-bulk',
  p_tool_key => 'transcription',
  p_released_on => '2026-10-11',
  p_title => 'Sourcework: accept suggestions in bulk',
  p_guide_slugs => array['sourcework-accept-in-bulk'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Sourcework can now accept suggestions in bulk. A source’s data points, the Themes tab’s suggested themes and data points, and a theme’s suggested quotes each have an Accept all button that asks you to confirm and then accepts everything waiting. Merge suggestions and trimmed clips are still decided one at a time."}]}]}$body$
);
