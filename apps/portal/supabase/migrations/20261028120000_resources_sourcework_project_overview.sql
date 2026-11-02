-- Resources content for the Sourcework project overview and one-time hints (CLAUDE.md, "Resources stay in step with the code").
-- Content only; no schema. Depends on 20261027120000.

select private.rc_release_guide(
  p_slug => 'sourcework-project-overview',
  p_tool_key => 'transcription',
  p_title => 'A project at a glance',
  p_summary => 'See where a project stands, do the next step yourself or with AI, and find any source.',
  p_screen_keys => array['sourcework.project'],
  p_sort_order => 12,
  p_version_note => 'New guide: the step strip, the next-step band and the hand-over',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A project's Sources tab opens on where the project stands and what to do next. You can do every step yourself, ask AI to do any step, or hand it the rest."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"The steps and the next step"}]},{"type":"paragraph","content":[{"type":"text","text":"The row of steps runs Sources, Analyze, Review, Synthesis, Piece. A finished step is a link back to its tab. Under it, one panel names the next step and gives you one button for it: "},{"type":"text","text":"Analyze","marks":[{"type":"bold"}]},{"type":"text","text":" when sources are ready, "},{"type":"text","text":"Review","marks":[{"type":"bold"}]},{"type":"text","text":" when findings and clips are waiting, then Open Synthesis and Start a piece. The steps only report and suggest. You can use any tab at any time."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Run the remaining steps with AI"}]},{"type":"paragraph","content":[{"type":"text","text":"The link under the button opens a dialog that runs the steps still to do, one after another, and hands control back where you choose: after Analyze, after Synthesis, after Outline, or after a first draft. It starts on Analyze, so the Review tab stays yours. Going past Analyze accepts every suggested finding and clip without your review, and the dialog says so before you start; they can be put back for review afterwards. Keep the page open while it runs. Stop after this step ends the run, and what finished is kept."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Find a source"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Filter sources searches titles. Show narrows the list to sources not yet analyzed or that need attention, and Sort puts the newest first or sorts by title."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Select a row to open the source. A source that failed to process says why under its title."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"+ Add source and the ⋮ menu are at the top of the page. Deleting a project is in the ⋮ menu, with a list of what goes and what stays."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Hints that go away"}]},{"type":"paragraph","content":[{"type":"text","text":"Short how-to notes on some screens, such as how to select words into an excerpt, show a Got it button. Select it and that note stays hidden in this browser."}]}]}$body$
);

select private.rc_release_note(
  p_slug => 'release-2026-10-28-sourcework-project-overview',
  p_tool_key => 'transcription',
  p_released_on => '2026-10-28',
  p_title => 'Sourcework: A project shows where it stands and what to do next',
  p_guide_slugs => array['sourcework-project-overview'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A project's Sources tab now opens on a row of steps and one panel naming the next step, with a sparkle-marked link to run the remaining steps with AI and hand control back where you choose. The sources are a list you can filter and sort, Delete project moved into the project's ⋮ menu, Projects opens on the projects that need you and shows how far along each one is, and the tabs read Source library and All excerpts. Short how-to notes, such as how to select words into an excerpt, now go away for good once you select Got it."}]}]}$body$
);
