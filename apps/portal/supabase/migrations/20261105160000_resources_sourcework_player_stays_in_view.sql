-- Resources content for the source screen's player staying in view on a computer (CLAUDE.md,
-- "Resources stay in step with the code"). Content only; no schema. The prefix continues the
-- sequence past 20261105150000; see 20261103120000's header on why the prefix is a sequence
-- number, not a date.
--
-- What changed for a reader: on a computer, the player bar was meant to stay at the top of the
-- transcript while scrolling, but it slid underneath the portal's top bar and out of sight. It now
-- stays just below it, and the excerpts panel beside the transcript does the same. A phone is
-- unchanged (the player stays docked at the bottom). No guide changes: the guides already describe
-- the phone behaviour and say nothing about a computer that is now wrong.

select private.rc_release_note(
  p_slug => 'release-2026-11-02-sourcework-player-stays-in-view',
  p_tool_key => 'transcription',
  p_released_on => '2026-11-02',
  p_title => 'The player stays in view while you scroll a long transcript',
  p_guide_slugs => array['sourcework-transcript-and-excerpts'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"On a computer, scrolling down a long transcript used to carry the player out of sight, so you had to scroll back up to pause. The player now stays just below the top bar while you scroll, and the excerpts panel beside the transcript stays in view the same way. On a phone nothing changes: the player stays docked at the bottom."}]}]}$body$
);
