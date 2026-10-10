-- Resources content for excerpt export filenames (CLAUDE.md, "Resources stay in step with the code").
-- Content only; no schema.

select private.rc_release_note(
  p_slug => 'release-2026-10-10-sourcework-excerpt-filenames',
  p_tool_key => 'transcription',
  p_released_on => '2026-10-10',
  p_title => 'Sourcework: excerpt files are named for the story, speaker and quote',
  p_guide_slugs => array['sourcework-transcript-and-excerpts'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"An exported excerpt, whether downloaded on its own or inside Export excerpts, is now named for the story, the person speaking and a short id for the quote, such as hurricane-isaias_chip-simmons_second-fatality-from-generator-fumes.wav. The quote id comes from the excerpt's title, so a short descriptive title makes a better file name. An excerpt with no named speaker reads unnamed. The date is no longer part of the name."}]}]}$body$
);
