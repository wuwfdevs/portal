-- Resources content for the DAD log (CLAUDE.md, "Resources stay in step with
-- the code"). Content only; the schema change is 20261002140000.

select private.rc_release_guide(
  p_slug => 'log-dad-log',
  p_tool_key => 'log',
  p_title => 'The DAD log',
  p_summary => 'The file DAD plays automated hours from: what''s in it, what stops it, and how to release it.',
  p_screen_keys => array['log.dad-log'],
  p_sort_order => 46,
  p_version_note => 'The DAD log',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The DAD log is the file DAD merges into a day's playlist so it plays that day's credits in automated hours. Open it from "},{"type":"text","text":"Today","marks":[{"type":"bold"}]},{"type":"text","text":" with "},{"type":"text","text":"DAD log","marks":[{"type":"bold"}]},{"type":"text","text":". Only breaks in automated hours are in the file; hosted hours are left to the host."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Before releasing"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"The bar at the top shades the day's automated hours. Change them on "},{"type":"text","text":"Automated hours","marks":[{"type":"bold"}]},{"type":"text","text":", reached from Programs."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Anything DAD can't play is listed first, with a link to fix it: a message with no DAD cut, something only a host can do (a live read written for the rundown, or the weather), copy that isn't approved or is outside its dates, or a break that runs past its window."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"A program that airs in automated hours but has no rundown is listed as worth knowing. Its breaks aren't in the file until it has one."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"The "},{"type":"text","text":"Table","marks":[{"type":"bold"}]},{"type":"text","text":" shows what DAD will play and when. "},{"type":"text","text":"File","marks":[{"type":"bold"}]},{"type":"text","text":" shows the exact rows."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Releasing"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"A producer releases the day with "},{"type":"text","text":"Release","marks":[{"type":"bold"}]},{"type":"text","text":". It's refused while anything can't play."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Download the release and put it in DAD's import folder. The file is named for the day, such as 100126tWUWF.log."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"If a rundown changes afterwards, the page says the release is out of date. Release again; each release is a new version, and the history keeps every one."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Each item keeps the same spot number in every version."}]}]}]}]}$body$
);

select private.rc_release_note(
  p_slug => 'release-2026-10-02-log-dad-log',
  p_tool_key => 'log',
  p_released_on => '2026-10-02',
  p_title => 'The DAD log',
  p_guide_slugs => array['log-dad-log', 'log-automated-hours'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Each day now has a DAD log, opened from Today. It lists the credits DAD plays in automated hours, flags anything that can't play, and lets a producer release the file and download it for DAD's import folder. Each release is kept as a version."}]}]}$body$
);
