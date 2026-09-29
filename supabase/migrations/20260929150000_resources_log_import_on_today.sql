-- Resources content for the program-log import moving onto the Today screen
-- (CLAUDE.md, "Resources stay in step with the code"). No schema change.

select private.rc_release_guide(
  p_slug => 'log-import-a-program-log',
  p_tool_key => 'log',
  p_title => 'Import a program log',
  p_summary => 'Build a day''s rundowns from the traffic system''s program log.',
  p_screen_keys => array['log.import'],
  p_sort_order => 25,
  p_version_note => 'Written for the import starting from Today.',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The program log is the day's schedule as the traffic system exports it, as a PDF. Importing it builds that day's rundowns with each break and its credits already in place."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Start from Today"}]},{"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"On the Today tab, choose the day, then select "},{"type":"text","text":"Import program log","marks":[{"type":"bold"}]},{"type":"text","text":". If some programs have no rundown yet, the notice above the table links there too."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Choose the PDF and select "},{"type":"text","text":"Preview import","marks":[{"type":"bold"}]},{"type":"text","text":". Reading the log can take a minute, and nothing is written yet."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Review the plan. If the log is dated a different day than the one you started from, a notice says so: rundowns are created for the log's date."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Check the rows that could not be placed, any new underwriters or copy, and any library scripts that will change. Then select "},{"type":"text","text":"Import","marks":[{"type":"bold"}]},{"type":"text","text":"."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"You land on Today for the log's date, where the new rundowns are listed."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"If a rundown already exists"}]},{"type":"paragraph","content":[{"type":"text","text":"A program that already has a rundown for that date is skipped and named in the result. The import stays on its own page in that case so the reasons are easy to read, with a link back to Today."}]}]}$body$);

select private.rc_release_note(
  p_slug => 'release-2026-09-29-log-import-on-today',
  p_tool_key => 'log',
  p_released_on => '2026-09-29',
  p_title => 'Program log import now starts from Today',
  p_guide_slugs => array['log-import-a-program-log'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The Import tab is gone. "},{"type":"text","text":"Import program log","marks":[{"type":"bold"}]},{"type":"text","text":" now sits beside the date controls on Today, and you return to Today when it finishes. While a log is being read or imported, the screen shows which step it is on. If the log is dated a different day than the one you started from, the review says so before you confirm."}]}]}$body$);
