-- Resources content for the notification layer (CLAUDE.md, "Resources stay in step with the code"). Content only; no schema. Follows
-- 20261115120000. The Notification Center and its preferences are portal-wide, not part of a tool, and a guide belongs to a tool, so this
-- ships a release note only (as 20261105150000 did for the dashboard). Station-neutral on purpose: a kept note names no station.

select private.rc_release_note(
  p_slug => 'release-2026-11-16-notifications',
  p_tool_key => null,
  p_released_on => '2026-11-16',
  p_title => 'Notifications, in the header and by email',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The bell in the header opens your Notification Center: what the tools you use have told you, newest first, with a count of what you have not read. Opening one marks it read and takes you to what it is about. Notification preferences, from the Center or from your account menu, choose which kinds of event you are told about and whether each also comes by email to the address on your account."}]},{"type":"paragraph","content":[{"type":"text","text":"Roadmap is the first tool to use it. If you filed a request, you are told when a curator changes its status, with the reason if it is declined, and by default by email too. You are told when someone comments on it, in the Center only. Email is sent within a minute or two, and you are only ever told about tools you can open."}]}]}$body$
);
