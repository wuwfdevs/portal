-- Fixes a systemic labeling error found immediately after the Morning
-- Edition top-of-hour fix (20260807130000): a maximum-resolution re-render
-- of Morning Edition's and All Things Considered's source PDFs showed a
-- genuine, separately-colored (red) 20-second Funding Credit wedge right
-- after Newscast 2, distinct from the following Music Bed — previously
-- dismissed as decoration from the red double-headed "network newscast
-- tolerance" arrow drawn over the same spot. Every other seeded clock
-- shares this identical house-template junction and had the same two
-- slots in the wrong order (Music Bed then Funding Credit, rather than
-- Funding Credit then Music Bed) — an error that survived both prior
-- correction passes because it was assumed to be normal cross-clock
-- transcription noise rather than checked at full zoom.
--
-- This is a pure label swap — the two slots' offsets/durations (340s for
-- 20s, then 360s for 30s) were already correct, only which one is which
-- was backwards. World Cafe is excluded: it has no Newscast 2 at this
-- position at all, so the pattern doesn't apply.

begin;

update public.log_clock_slots
set label = case start_offset_seconds when 340 then 'Funding Credit' when 360 then 'Music Bed' end
where clock_version_id in (
  '7e138bbc-7118-5b33-83c7-8fda6ef548ab', -- 1A
  '02448d52-27f4-5be5-9442-2a2bf23a4010', -- All Things Considered (weekday)
  'c1d3984f-2ab3-514a-a0af-7440686446e3', -- All Things Considered (Weekends)
  '23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', -- Fresh Air
  'e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', -- Fresh Air Weekend
  'f5c6d57a-b646-5abf-8b57-d3b4160b2a29', -- Here & Now
  '67d43532-399b-51ae-b5e5-b99d699fc075', -- Hidden Brain
  '6da992b5-176c-54a8-b5de-c7fbadc6f8e8', -- TED Radio Hour
  '69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', -- Wait Wait... Don't Tell Me!
  '6476a80c-e33a-5520-96e9-1c38c4ba1281', -- Weekend Edition Saturday
  '722314ab-721c-5676-b3bf-5b58bece999e'  -- Weekend Edition Sunday
)
and start_offset_seconds in (340, 360);

commit;
