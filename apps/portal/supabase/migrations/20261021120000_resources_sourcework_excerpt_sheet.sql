-- Resources content for the excerpt sheet on a phone (CLAUDE.md, "Resources stay in step with the code").
-- Content only; no schema.

select private.rc_release_guide(
  p_slug => 'sourcework-excerpt-sheet-on-a-phone',
  p_tool_key => 'transcription',
  p_title => 'Play, trim and manage an excerpt on a phone',
  p_summary => 'Tap an excerpt in the transcript to play it, trim it, change its level, export it or delete it.',
  p_screen_keys => array['sourcework.source'],
  p_sort_order => 26,
  p_version_note => 'First version',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"On a phone, tapping words that are part of a saved excerpt opens a sheet above the player. The transcript stays visible behind it. On a larger screen the same tap selects the excerpt's card beside the transcript."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"What the sheet shows first"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Play excerpt","marks":[{"type":"bold"}]},{"type":"text","text":" plays just that excerpt, at the level it will be exported. It becomes "},{"type":"text","text":"Pause","marks":[{"type":"bold"}]},{"type":"text","text":" while it plays."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Edit","marks":[{"type":"bold"}]},{"type":"text","text":" opens everything you can do to the excerpt."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Show in Excerpts tab","marks":[{"type":"bold"}]},{"type":"text","text":" takes you to the excerpt's card in the list."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"The ✕ button closes the sheet."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Edit an excerpt"}]},{"type":"paragraph","content":[{"type":"text","text":"Edit shows the same card as the Excerpts tab. Tap the title to rename it. Choose "},{"type":"text","text":"Trim","marks":[{"type":"bold"}]},{"type":"text","text":" to show the excerpt's words and move its start or end by tapping a word. Choose "},{"type":"text","text":"Original level","marks":[{"type":"bold"}]},{"type":"text","text":" or "},{"type":"text","text":"Even out","marks":[{"type":"bold"}]},{"type":"text","text":" to change its level. "},{"type":"text","text":"Export WAV","marks":[{"type":"bold"}]},{"type":"text","text":" makes the file, and "},{"type":"text","text":"Download","marks":[{"type":"bold"}]},{"type":"text","text":" appears once it exists. Delete asks you to confirm. Play stays at the bottom of the sheet so you can hear each change; choose "},{"type":"text","text":"Done","marks":[{"type":"bold"}]},{"type":"text","text":" to go back."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"When excerpts overlap"}]},{"type":"paragraph","content":[{"type":"text","text":"If the words you tapped are in more than one excerpt, the sheet says so and lets you pick which one to work on. The shortest is shown first."}]}]}$body$
);

select private.rc_release_note(
  p_slug => 'release-2026-10-13-sourcework-excerpt-sheet',
  p_tool_key => 'transcription',
  p_released_on => '2026-10-13',
  p_title => 'Sourcework: play and edit an excerpt from the transcript on a phone',
  p_guide_slugs => array['sourcework-excerpt-sheet-on-a-phone', 'sourcework-transcript-and-excerpts'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"On a phone, tapping an excerpt's words in the transcript now opens a sheet with Play, and Edit for renaming, trimming, changing the level, exporting and deleting. Before, the tap did nothing visible because the excerpt list is on another tab. Where excerpts overlap, the sheet lets you choose which one."}]}]}$body$
);
