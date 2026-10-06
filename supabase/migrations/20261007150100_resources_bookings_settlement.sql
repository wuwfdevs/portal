-- Resources content for Bookings slice 6 — settlement at actual cost
-- (CLAUDE.md, "Resources stay in step with the code"). Content only; the schema
-- is 20261007150000_bookings_settlement.sql.

select private.rc_release_guide(
  p_slug => 'bookings-settlement',
  p_tool_key => 'bookings',
  p_title => 'Settling a delivered request',
  p_summary => 'Finance records what a delivered request actually cost and what was recharged or invoiced, and posts it under a journal entry number.',
  p_screen_keys => array['bookings.project'],
  p_sort_order => 23,
  p_version_note => 'Slice 6: settlement at actual cost',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Once a request is delivered and production has confirmed the hours and equipment used, Finance settles it. The "},{"type":"text","text":"Settlement","marks":[{"type":"bold"}]},{"type":"text","text":" panel on the request drafts itself: the amount is the approved estimate's, with each direct expense replaced by what it actually cost, and the cost to WUWF is the confirmed hours and equipment at the rate card the request was priced on. The hours never change what the partner is charged; they change what the work cost WUWF."}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"A university unit is recharged to its funding index. An outside partner is invoiced, with the assessment and margin shown on their own lines."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Type the actual cost of any direct expense, or leave it blank to settle it as estimated. Update the draft to recalculate from the hours confirmed now."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Post the entry in the university's own system, then enter its journal entry number here and post the settlement. Posting settles the request, and a posted settlement is final."}]}]}]},{"type":"paragraph","content":[{"type":"text","text":"WUWF contributes the cost the partner's payment does not cover, never less than zero. The Term report totals settled requests so actual cost can be read against the estimates."}]}]}$body$
);

select private.rc_release_note(
  p_slug => 'release-2026-10-07-bookings-settlement',
  p_tool_key => 'bookings',
  p_released_on => '2026-10-06',
  p_title => 'Bookings: settling delivered requests at actual cost',
  p_guide_slugs => array['bookings-settlement', 'bookings-term-report'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Finance can now settle a delivered request. The settlement drafts from the approved estimate, the hours and equipment production confirmed, and what each direct expense actually cost, then is posted under a journal entry number, which settles the request. The Term report shows settled requests' actual cost against their estimates."}]}]}$body$
);
