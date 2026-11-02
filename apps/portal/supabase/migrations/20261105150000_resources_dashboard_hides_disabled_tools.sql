-- Resources content for the dashboard no longer listing tools an administrator has switched off
-- (CLAUDE.md, "Resources stay in step with the code"). Content only; no schema. The prefix
-- continues the sequence past 20261105140000; see 20261103120000's header on why the prefix is a
-- sequence number, not a date.
--
-- What changed for a reader: a tool that is switched off in Administration, Tools used to keep a
-- card on the dashboard labelled Unavailable. It is now left off the dashboard. Administrators
-- still see it in Administration, Tools and can switch it back on. The dashboard has no Help
-- screen of its own, so this ships a release note only.

select private.rc_release_note(
  p_slug => 'release-2026-11-02-dashboard-hides-disabled-tools',
  p_tool_key => null,
  p_released_on => '2026-11-02',
  p_title => 'Tools that are switched off no longer appear on the dashboard',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A tool that an administrator has switched off used to stay on the dashboard with an Unavailable label. The dashboard now lists only tools that are switched on. Administrators can still see every tool in Administration, Tools, and can switch one back on there."}]}]}$body$
);
