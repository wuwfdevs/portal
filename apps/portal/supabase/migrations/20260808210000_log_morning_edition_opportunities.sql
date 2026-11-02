-- Log: seeds WUWF's real local-substitution opportunities for Morning
-- Edition, the reference case for the network-clock/local-opportunity split
-- (see 20260808120000_log_local_opportunities.sql and CLAUDE.md). Morning
-- Edition's own network clock is untouched by this migration — every one of
-- its 27 slots stays exactly as transcribed and corrected across the four
-- prior seed-correction migrations. What's new is WUWF's own overlay: where
-- the station may (or, in one case, must) cover network material with local
-- content.
--
-- Five opportunities, chosen to cover the representative cases named in
-- the redesign brief:
--
--   1-2. Two short optional covers over a post-segment Music Bed — a local
--        ID, PSA, promo, membership message, or underwriting credit may
--        fill either; if nothing is placed, the network feed simply
--        continues (requirement = optional is the point).
--   3-4. The two real WUWF story-substitution windows: approximately
--        :29:30-:34:00 and :49:35-:51:30. Both span multiple underlying
--        network clock slots (window 3 covers the tail of "ATC Promo," a
--        Music Bed, and both Newscast 3/4; window 4 lands almost exactly on
--        the Music Bed at :49:34-:51:29) — this is the concrete proof that
--        a local opportunity is not 1:1 with a network segment. Both are
--        optional: some days no local story is ready, and the network
--        feed runs through unmodified.
--   5.   One genuinely required local opportunity (a station legal ID /
--        local announcement window), so this seed also exercises
--        requirement = required — unlike the four optional windows above,
--        an empty instance of this one is unresolved and must be flagged.
--
-- Only Morning Edition gets opportunities in this migration — the brief is
-- explicit that Morning Edition is the reference case to prove the model
-- against, and inventing opportunities for the other twelve seeded network
-- clocks without real operational information about each one would be
-- exactly the "manufacture local slots" mistake this redesign exists to
-- correct. A producer can add opportunities for any other clock template
-- from /log/clocks/[id] once WUWF confirms where they actually are.

insert into public.log_local_opportunities (
  clock_version_id, position, label, requirement, timing_mode,
  start_offset_seconds, duration_seconds, permitted_content_types, allow_multiple, notes
) values
  (
    'a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 1,
    'Local cover — post-newscast music bed (6:00)',
    'optional', 'fixed', 360, 90,
    array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'],
    true,
    'Short avail over the Music Bed following the 5:40 newscast/funding-credit pair. Left unused, NPR''s own music continues — a normal, resolved state.'
  ),
  (
    'a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 2,
    'Local cover — Segment A music bed (19:00)',
    'optional', 'fixed', 1140, 90,
    array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'],
    true,
    'Short avail over the Music Bed following Segment A.'
  ),
  (
    'a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 3,
    'Local story window (~29:30–34:00)',
    'optional', 'fixed', 1770, 270,
    array['news', 'interview_feature', 'host_created'],
    false,
    'Spans the tail of the ATC cross-promo, a Music Bed, and both Newscast 3 and Newscast 4 — WUWF''s call to run a longer local story or feature in place of that network material. allow_multiple = false: this window is sized for one longer piece, not several short ones. Some days nothing local is ready and NPR''s own material runs unmodified.'
  ),
  (
    'a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 4,
    'Local story window (~49:35–51:30)',
    'optional', 'fixed', 2975, 115,
    array['news', 'interview_feature', 'host_created'],
    true,
    'Lands almost exactly on the Music Bed at :49:34–:51:29 — WUWF''s second common story-substitution point.'
  ),
  (
    'a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 5,
    'Required local ID / announcement (42:30)',
    'required', 'fixed', 2550, 90,
    array['legal_id', 'university_announcement'],
    true,
    'A genuine local obligation, unlike the four optional windows above — left unfilled, this is flagged unresolved rather than treated as "carrying network."'
  );
