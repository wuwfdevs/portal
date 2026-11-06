-- Resources content for the Audience Listening hand-off to Sourcework only appearing when it can
-- work (CLAUDE.md, "Resources stay in step with the code"). Content only; no schema. The prefix
-- continues the sequence past 20261105170000; see 20261103120000's header on why the prefix is a
-- sequence number, not a date.
--
-- What changed for a reader: on a submission, "Send to transcription" and "Open in Sourcework" used
-- to show whether or not the person could use Sourcework. If Sourcework was switched off, or the
-- person had no access to it, the button failed with an error and the link went nowhere. Both now
-- show only when the person can use Sourcework. The transcription state badge is unchanged. No
-- guide changes: the guides describe the hand-off for someone who has Sourcework and say nothing
-- that is now wrong.

select private.rc_release_note(
  p_slug => 'release-2026-11-04-audience-listening-sourcework-handoff',
  p_tool_key => 'audience-listening',
  p_released_on => '2026-11-04',
  p_title => 'Sending an answer to transcription only shows when you can use Sourcework',
  p_guide_slugs => array['audience-listening-review-submissions'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"On a submission, the buttons that send an answer to transcription, retry it, or open it in Sourcework now appear only when you can use Sourcework. Before, they showed for everyone, and pressing one when Sourcework was switched off or you had no access to it ended in an error or a page that would not open. If you do not see them and expect to, ask an administrator for Sourcework access. The transcription status beside an answer is unchanged."}]}]}$body$
);
