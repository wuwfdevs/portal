-- Resources content for the Bookings refinement pass, slice B — cost transparency
-- (CLAUDE.md, "Resources stay in step with the code"). Content only; the schema
-- is 20261007130000_bookings_cost_transparency.sql.

select private.rc_release_guide(
  p_slug => 'bookings-term-report',
  p_tool_key => 'bookings',
  p_title => 'The term report',
  p_summary => 'What the term''s work cost WUWF, what partners paid and what WUWF contributed, by partner and by rate, and the $500 webcast against modeled cost.',
  p_screen_keys => array['bookings.report'],
  p_sort_order => 21,
  p_version_note => 'Refinement pass, slice B: cost transparency',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The "},{"type":"text","text":"Term report","marks":[{"type":"bold"}]},{"type":"text","text":" totals what the term's work cost WUWF, what partners paid and what WUWF contributed. Open it from the link at the foot of the Dashboard. It reads the figures each estimate stored when it was priced, so it follows the rates in use at the time rather than today's."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"The figures"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Full cost","marks":[{"type":"bold"}]},{"type":"text","text":" is the modeled labor, equipment and space, and direct expenses for the work. It leaves out the outside margin, the university's assessment and general overhead."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Partners pay","marks":[{"type":"bold"}]},{"type":"text","text":" is the total of the estimates' lines."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"WUWF contributes","marks":[{"type":"bold"}]},{"type":"text","text":" is the full cost the partner's payment doesn't cover, request by request. It is never negative: an outside partner's margin and assessment are shown on their own columns and don't offset it."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"By rate and by partner"}]},{"type":"paragraph","content":[{"type":"text","text":"The first table splits the same figures by the rate each request was priced at — University rate, University rate (WUWF contributing) and Outside rate. The second splits them by partner. Below them the report counts the requests that qualify as strategic work however they were priced, and says how many were priced at the university rate because the time set aside for them was used up."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"The $500 webcast"}]},{"type":"paragraph","content":[{"type":"text","text":"Across the webcast events priced this term, the report shows what an event costs WUWF, what partners are charged, and how far the old $500 convention sits from the modeled cost. Costs and prices are provisional until a rate model version is adopted."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Show calculation"}]},{"type":"paragraph","content":[{"type":"text","text":"Each request's page has the same figures for that request under "},{"type":"text","text":"Show calculation","marks":[{"type":"bold"}]},{"type":"text","text":": the cost line by line, what the partner pays, WUWF's contribution, an outside partner's margin and assessment, and the market floor and reference for each package."}]}]}$body$
);

select private.rc_release_note(
  p_slug => 'release-2026-10-07-bookings-cost-transparency',
  p_tool_key => 'bookings',
  p_released_on => '2026-10-06',
  p_title => 'Bookings: what the work costs and what WUWF contributes',
  p_guide_slugs => array['bookings-term-report', 'bookings-new-request'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Every estimate now records what the work costs WUWF, what the partner pays and what WUWF contributes, and the new Term report totals them by partner and by rate. It also sets the old $500 webcast against the modeled cost per event. The request's summary line names the contribution in dollars, and Show calculation lists the cost line by line. Costs are kept exact; only the rate is rounded up to the next $25."}]}]}$body$
);
