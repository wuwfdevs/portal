-- Resources content for the website's listening page grouping each campaign into one band (CLAUDE.md, "Resources stay in step with the
-- code"). Content only; no schema. Follows 20261114160000. A release note linked to the campaigns guide, which already explains how a
-- campaign, its events and kitchen tables are set up; the note says where they now appear. Station-neutral on purpose.

select private.rc_release_note(
  p_slug => 'release-2026-11-14-listening-page-shows-each-campaign-as-one-band',
  p_tool_key => 'audience-listening',
  p_released_on => '2026-11-14',
  p_title => 'The website shows each open campaign as one band',
  p_guide_slugs => array['audience-listening-campaigns-events-and-table-cards'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"On the website's listening page, an open campaign now appears as a single band: its question, then ways to take part. A person can answer on their own if the campaign has a linked query that is listed, join one of its listed public events, or start a private table if the campaign accepts kitchen tables. Before, those showed as separate lists with nothing tying them to the campaign. A query that belongs to no open campaign still appears on its own, and a campaign with nothing to take part in yet makes no band. Nothing new is public: a campaign still needs to be open, and its query, events and tables listed, as before."}]}]}$body$
);
