-- Resources content for the Bookings refinement pass, slice C — model corrections
-- (CLAUDE.md, "Resources stay in step with the code"). Content only; the schema
-- is 20261007140000_bookings_model_corrections.sql.

select private.rc_release_guide(
  p_slug => 'bookings-adjust-scope',
  p_tool_key => 'bookings',
  p_title => 'Adjusting what a package includes',
  p_summary => 'Change the hours, equipment or crew on one request without changing the package, and record the hours actually used.',
  p_screen_keys => array['bookings.project'],
  p_sort_order => 22,
  p_version_note => 'Refinement pass, slice C: adjust scope',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A package is the usual recipe for a kind of work. When one request needs something different, use "},{"type":"text","text":"Adjust scope","marks":[{"type":"bold"}]},{"type":"text","text":" on that line: change the hours, equipment or crew and say why. The package and the rate model are not changed, the request keeps a reference to the standard recipe and shows the difference, and the request carries a Scope adjusted badge."}]},{"type":"paragraph","content":[{"type":"text","text":"An adjusted line is priced from its own cost. The package's market floor and ceiling are scaled by the same change in cost, which is a judgment Finance should confirm. Reset the line to go back to the standard recipe."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Hours used"}]},{"type":"paragraph","content":[{"type":"text","text":"After the work is delivered, confirm the hours and equipment actually used. They feed the assumed-versus-observed view in the Term report and never change a price."}]}]}$body$
);

select private.rc_release_guide(
  p_slug => 'bookings-term-report',
  p_tool_key => 'bookings',
  p_title => 'The term report',
  p_summary => 'What the term''s work cost WUWF, what partners paid and what WUWF contributed, by partner and by rate, the $500 webcast against modeled cost, and package assumptions against what was observed.',
  p_screen_keys => array['bookings.report'],
  p_sort_order => 21,
  p_version_note => 'Refinement pass, slice C: assumed versus observed',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The "},{"type":"text","text":"Term report","marks":[{"type":"bold"}]},{"type":"text","text":" totals what the term's work cost WUWF, what partners paid and what WUWF contributed. Open it from the link at the foot of the Dashboard. It reads the figures each estimate stored when it was priced, so it follows the rates in use at the time rather than today's."}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Full cost is the modeled labor, equipment and space, and direct expenses. WUWF contributes is the full cost the partner's payment doesn't cover, never negative. Partners pay is the total of the estimates' lines."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"The tables split the same figures by rate and by partner, count strategic requests however they were priced, and set the $500 webcast against modeled cost."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Assumed versus observed"}]},{"type":"paragraph","content":[{"type":"text","text":"A read-only view compares each package's hours with the hours confirmed after delivery, resource units planned with units used, and shows the dates refused or released by resource. It informs the next rate model version; it never changes a price."}]}]}$body$
);

select private.rc_release_note(
  p_slug => 'release-2026-10-07-bookings-model-corrections',
  p_tool_key => 'bookings',
  p_released_on => '2026-10-06',
  p_title => 'Bookings: capacity, capital costs and adjusted scope',
  p_guide_slugs => array['bookings-adjust-scope', 'bookings-term-report'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Capacity is now practical capacity, and the webcast pool's 20 events is flagged as a forecast. Equipment can carry capital consumption and maintenance from the asset register, general overhead stays out of per-unit costs, and a package can carry a market ceiling that raises a review flag. A request can adjust a package's scope with a reason, and the Term report compares assumed with observed hours."}]}]}$body$
);
