-- Resources content for the Sourcework Review tab, "Write a story", patterns across sources and the Writing guide
-- (CLAUDE.md, "Resources stay in step with the code"). Content only; no schema.

select private.rc_release_note(
  p_slug => 'release-2026-10-27-sourcework-review-and-story',
  p_tool_key => 'transcription',
  p_released_on => '2026-10-27',
  p_title => 'Sourcework: review everything in one place, and write a story in one go',
  p_guide_slugs => array['sourcework-synthesis','sourcework-outline','sourcework-pieces'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A project's new "},{"type":"text","text":"Review","marks":[{"type":"bold"}]},{"type":"text","text":" tab lists every finding and clip that Analyze suggested, from all of its sources, with play buttons and one control to accept them all. It also lists the web pages the model looked up, and each finding says which of them it used. Synthesis now offers "},{"type":"text","text":"patterns across sources","marks":[{"type":"bold"}]},{"type":"text","text":" that no research question asked about, which you can track as a question. On the Sources tab, "},{"type":"text","text":"Write a story from these sources","marks":[{"type":"bold"}]},{"type":"text","text":" runs Analyze, accept, Synthesize, Outline and Write in one go, or stops at Review so you decide first."}]},{"type":"paragraph","content":[{"type":"text","text":"Also new: play buttons on findings and suggested clips now pause, Outline with AI warns you when no excerpts have been accepted, the format is chosen once at the top of a piece, narration attributes in the past tense (editors can change the house style under Writing guide), Analyze offers more clips and listens for what speakers keep coming back to, and every button that starts an AI run carries a sparkles mark."}]}]}$body$
);
