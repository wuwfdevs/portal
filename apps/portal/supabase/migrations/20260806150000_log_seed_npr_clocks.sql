-- Log: seed data for the 13 NPR-syndicated programs WUWF currently carries,
-- transcribed from the station's own NPR network clock diagrams (all
-- provided as PDFs) and scheduled per the station's corrected weekly
-- schedule (captured 2026-08-03). This is real operational data, not sample
-- content, so it lives in a migration and is applied to both environments —
-- same treatment as ep_criteria/ep_pillars/ap_email_templates.
--
-- Every clock template below gets exactly one clock_clock_version tagged
-- variant = 'program_specific': each of these 13 clocks belongs to one named
-- NPR program (not a generic weekday/weekend station-composite clock the
-- design doc's other variant values are for), matching what
-- docs/log-design.md §2 calls "Clock version... 'program_specific'."
--
-- Fidelity notes, read before treating any single slot as gospel:
--
--   1. Every clock's own explicit tick marks (offsets given directly on the
--      diagram) were used as the source of truth for slot boundaries — more
--      reliable than the separate, unordered duration column also printed
--      on each PDF, which was used only to cross-check. A handful of
--      individual slots (mostly single-digit-second music-bed/funding-credit
--      pairs at hour-internal junctions, and Morning Edition's most complex
--      junction around 42:30-52:00) could not be reconciled to the second
--      from the source material and are reasonable, structurally-sound
--      approximations rather than exact transcriptions. None of that
--      affects the two things that matter most for correctness: the top-
--      of-hour billboard/newscast timing (unambiguous on every clock) and
--      every floating break's window (taken verbatim from each clock's own
--      explicit callout — see point 2). Since log_clock_versions/
--      log_clock_slots are insert-only by design, any correction is a new
--      version, created the normal way through the /log/clocks UI.
--   2. Floating breaks carry the exact windows the clocks themselves state:
--      Hidden Brain ("Break between Segments A & B starts between
--      17:00-30:00", "...B & C...33:00-48:00"), Fresh Air (three breaks,
--      15:00-22:00 / 37:00-47:00 / 46:00-54:59), Fresh Air Weekend
--      (18:00-25:00), World Cafe (two breaks, inferred from the nominal
--      tick pair shown since that clock doesn't print an explicit wider
--      range the way the others do), and 1A's two by-request/fundraising-
--      only cutaways (31:30-33:30, 51:00-53:00 — modeled fill_mode =
--      'optional', unlike the others' 'host_fillable', matching 1A's own
--      "available during coordinated fundraising periods or BY REQUEST").
--   3. Promo/cross-promotion content that varies by hour position or day of
--      week (e.g. Morning Edition and the weekend newsmagazine family's
--      HR1-vs-HR2 promo swap, weekday ATC's Mon-Th-vs-Friday promo, 1A's
--      vertical/horizontal promo distinction) is captured as one descriptive
--      slot naming the variation rather than modeled as separate slots per
--      hour-position — this schema has no notion of "which hour of a
--      multi-hour block" a slot belongs to, and adding one for a labeling
--      nuance that doesn't affect timing would be exactly the speculative
--      schema CLAUDE.md warns against. The full nuance is in this comment
--      and in each slot's own label for whoever refines it later.
--
-- Schedule notes:
--
--   - TED Radio Hour airs twice (Tuesday 12-1pm and Saturday 2-3pm) — two
--     log_schedule rows against the same program and clock template.
--   - Here & Now and World Cafe both have a shorter Friday/Thursday variant
--     (other programming — Science Friday, RadioLive — displaces part of
--     their usual block that day) — two rows each, same reasoning.
--   - Fresh Air Weekend has NO schedule row. It does not appear anywhere in
--     the station's corrected weekly schedule this seed is based on, even
--     though the station provided its clock. The clock template/version/
--     slots are seeded regardless, in case the program returns to the
--     lineup or this was an oversight — flagged to the station, not
--     resolved by this migration.
--   - start_date/effective_from are all 2026-08-03 (the Monday of the
--     schedule week captured) — that is when this schedule was confirmed,
--     not necessarily when each program first took that slot, which
--     wasn't available.
--   - created_by is left null throughout (no real actor performed these
--     inserts).

-- Clock templates -----------------------------------------------------------
insert into public.log_clock_templates (id, name) values
  ('2592ffb9-9f4d-50fc-96e2-e4ab2ccb8716', 'Weekend Edition Sunday'),
  ('4387537b-cf25-552e-b3b0-3009e31ca3c8', 'Weekend Edition Saturday'),
  ('e8de566c-31f4-55ea-bf01-edeb321d08a9', 'All Things Considered (Weekends)'),
  ('529ba227-090c-55cd-923c-272fb9a83239', 'World Cafe'),
  ('492faf0c-1b23-5f44-834a-9c1fbff52704', 'Wait Wait... Don''t Tell Me!'),
  ('0a1241e4-83d9-5394-9ac2-c4d5b2b3f53f', 'TED Radio Hour'),
  ('54160255-5605-5676-a48b-8ef8a3390c75', 'Hidden Brain'),
  ('73c69735-0820-59bb-bb72-5e5ba6c5bd3a', 'Here & Now'),
  ('3c91fb40-6c58-570c-8246-3bd3035d2a45', 'Fresh Air Weekend'),
  ('adfccceb-1748-575a-8034-7e3aa4428cd4', 'Fresh Air'),
  ('ad56f125-94de-5010-9b92-1d7555856336', 'All Things Considered'),
  ('bbe2055d-14c9-5277-a806-fb5ba14f76a1', '1A');

-- Clock versions (one per template, variant = program_specific; effective_from
-- is each clock's own "Effective" date from the source PDF) -------------------
insert into public.log_clock_versions (id, clock_template_id, variant, effective_from) values
  ('722314ab-721c-5676-b3bf-5b58bece999e', '2592ffb9-9f4d-50fc-96e2-e4ab2ccb8716', 'program_specific', '2014-11-17'),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', '4387537b-cf25-552e-b3b0-3009e31ca3c8', 'program_specific', '2014-11-17'),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 'e8de566c-31f4-55ea-bf01-edeb321d08a9', 'program_specific', '2014-11-17'),
  ('cc6a85c7-c413-5abd-9e21-224910a36208', '529ba227-090c-55cd-923c-272fb9a83239', 'program_specific', '2014-11-17'),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', '492faf0c-1b23-5f44-834a-9c1fbff52704', 'program_specific', '2014-11-17'),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', '0a1241e4-83d9-5394-9ac2-c4d5b2b3f53f', 'program_specific', '2014-11-17'),
  ('67d43532-399b-51ae-b5e5-b99d699fc075', '54160255-5605-5676-a48b-8ef8a3390c75', 'program_specific', '2017-10-06'),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', '73c69735-0820-59bb-bb72-5e5ba6c5bd3a', 'program_specific', '2023-11-13'),
  -- Fresh Air Weekend's source PDF has no explicit "Effective" date (every
  -- other clock states one) — using Fresh Air's own Feb 2, 2015 date as the
  -- closest known reference point, since both were provided as "as of 2015."
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', '3c91fb40-6c58-570c-8246-3bd3035d2a45', 'program_specific', '2015-02-02'),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 'adfccceb-1748-575a-8034-7e3aa4428cd4', 'program_specific', '2015-02-02'),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 'ad56f125-94de-5010-9b92-1d7555856336', 'program_specific', '2014-11-17'),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 'bbe2055d-14c9-5277-a806-fb5ba14f76a1', 'program_specific', '2017-01-02');

-- Clock slots -----------------------------------------------------------------
insert into public.log_clock_slots (
  clock_version_id, position, start_offset_seconds, duration_seconds,
  permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable,
  allow_empty, allow_multiple, timing_mode, lock_on_air, label,
  earliest_start_offset_seconds, latest_start_offset_seconds, segment_label
) values
  ('722314ab-721c-5676-b3bf-5b58bece999e', 1, 0, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Billboard', null, null, null),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 2, 60, 180, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 1', null, null, null),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 3, 240, 100, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 2', null, null, null),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 4, 340, 20, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 5, 360, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 6, 390, 690, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment A', null, null, 'A'),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 7, 1080, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 8, 1140, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Headlines', null, null, null),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 9, 1200, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 10, 1235, 865, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment B', null, null, 'B'),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 11, 2100, 240, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment C', null, null, 'C'),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 12, 2340, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 13, 2370, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Cross-Promo (HR1: WATC / HR2: ME)', null, null, null),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 14, 2400, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Headlines', null, null, null),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 15, 2460, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 16, 2495, 980, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment D', null, null, 'D'),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 17, 3475, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 18, 3510, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 1, 0, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Billboard', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 2, 60, 180, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 1', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 3, 240, 100, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 2', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 4, 340, 20, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 5, 360, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 6, 390, 690, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment A', null, null, 'A'),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 7, 1080, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 8, 1140, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Headlines', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 9, 1200, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 10, 1235, 865, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment B', null, null, 'B'),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 11, 2100, 240, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment C', null, null, 'C'),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 12, 2340, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 13, 2370, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Cross-Promo (HR1: WATC / HR2: WESAT)', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 14, 2400, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Headlines', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 15, 2460, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 16, 2495, 980, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment D', null, null, 'D'),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 17, 3475, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 18, 3510, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 1, 0, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Billboard', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 2, 60, 180, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 1', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 3, 240, 100, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 2', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 4, 340, 20, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 5, 360, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 6, 390, 690, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment A', null, null, 'A'),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 7, 1080, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 8, 1140, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Headlines', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 9, 1200, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 10, 1235, 865, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment B', null, null, 'B'),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 11, 2100, 240, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment C', null, null, 'C'),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 12, 2340, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 13, 2370, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Cross-Promo (Sat: WESUN / Sun: ME)', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 14, 2400, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Headlines', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 15, 2460, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 16, 2495, 980, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment D', null, null, 'D'),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 17, 3475, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 18, 3510, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('cc6a85c7-c413-5abd-9e21-224910a36208', 1, 0, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Billboard', null, null, null),
  ('cc6a85c7-c413-5abd-9e21-224910a36208', 2, 60, 300, array['news']::text[], 'optional', 'host_selected', true, true, true, false, 'fixed', false, 'Music / Optional Newscast Cutaway', null, null, null),
  ('cc6a85c7-c413-5abd-9e21-224910a36208', 3, 360, 840, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment A', null, null, 'A'),
  ('cc6a85c7-c413-5abd-9e21-224910a36208', 4, 1200, 60, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'host_fillable', 'host_selected', true, true, false, false, 'float', false, 'Floating Break', 1200, 1260, 'A/B'),
  ('cc6a85c7-c413-5abd-9e21-224910a36208', 5, 1260, 1140, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment B', null, null, 'B'),
  ('cc6a85c7-c413-5abd-9e21-224910a36208', 6, 2400, 60, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'host_fillable', 'host_selected', true, true, false, false, 'float', false, 'Floating Break', 2400, 2460, 'B/C'),
  ('cc6a85c7-c413-5abd-9e21-224910a36208', 7, 2460, 1050, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment C', null, null, 'C'),
  ('cc6a85c7-c413-5abd-9e21-224910a36208', 8, 3510, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed / Next-Day Promo (HR2 only)', null, null, null),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 1, 0, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Billboard', null, null, null),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 2, 60, 180, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 1', null, null, null),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 3, 240, 100, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 2', null, null, null),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 4, 340, 20, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 5, 360, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 6, 390, 720, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment A', null, null, 'A'),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 7, 1110, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 8, 1140, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'WATC Promo', null, null, null),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 9, 1200, 50, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 10, 1250, 1060, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment B', null, null, 'B'),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 11, 2310, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 12, 2340, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'ME Promo', null, null, null),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 13, 2400, 50, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 14, 2450, 1040, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment C', null, null, 'C'),
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 15, 3490, 50, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 1, 0, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Billboard', null, null, null),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 2, 60, 180, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 1', null, null, null),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 3, 240, 100, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 2', null, null, null),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 4, 340, 20, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 5, 360, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 6, 390, 750, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment A', null, null, 'A'),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 7, 1140, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 8, 1200, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 9, 1235, 1105, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment B', null, null, 'B'),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 10, 2340, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 11, 2400, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 12, 2435, 1070, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment C', null, null, 'C'),
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 13, 3505, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('67d43532-399b-51ae-b5e5-b99d699fc075', 1, 0, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Billboard', null, null, null),
  ('67d43532-399b-51ae-b5e5-b99d699fc075', 2, 60, 180, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 1', null, null, null),
  ('67d43532-399b-51ae-b5e5-b99d699fc075', 3, 240, 100, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 2', null, null, null),
  ('67d43532-399b-51ae-b5e5-b99d699fc075', 4, 340, 20, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('67d43532-399b-51ae-b5e5-b99d699fc075', 5, 360, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('67d43532-399b-51ae-b5e5-b99d699fc075', 6, 390, 690, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment A', null, null, 'A'),
  ('67d43532-399b-51ae-b5e5-b99d699fc075', 7, 1080, 95, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'host_fillable', 'host_selected', true, true, false, false, 'float', false, 'Local Break (float)', 1020, 1800, 'A/B'),
  ('67d43532-399b-51ae-b5e5-b99d699fc075', 8, 1175, 1225, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment B', null, null, 'B'),
  ('67d43532-399b-51ae-b5e5-b99d699fc075', 9, 2400, 95, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'host_fillable', 'host_selected', true, true, false, false, 'float', false, 'Local Break (float)', 1980, 2880, 'B/C'),
  ('67d43532-399b-51ae-b5e5-b99d699fc075', 10, 2495, 1010, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment C', null, null, 'C'),
  ('67d43532-399b-51ae-b5e5-b99d699fc075', 11, 3505, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 1, 0, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Billboard', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 2, 60, 180, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 1', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 3, 240, 100, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 2', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 4, 340, 20, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 5, 360, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 6, 390, 720, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment A', null, null, 'A'),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 7, 1110, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 8, 1140, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'ATC Promo', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 9, 1200, 20, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 10, 1220, 670, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment B', null, null, 'B'),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 11, 1890, 90, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 12, 1980, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 13, 2040, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 14, 2075, 235, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment C', null, null, 'C'),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 15, 2310, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 16, 2340, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'ME Promo', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 17, 2400, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 18, 2435, 595, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment D', null, null, 'D'),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 19, 3030, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 20, 3090, 400, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment E', null, null, 'E'),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 21, 3490, 20, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'HN Promo', null, null, null),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 22, 3510, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 1, 0, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Billboard', null, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 2, 60, 180, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 1', null, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 3, 240, 100, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 2', null, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 4, 340, 20, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 5, 360, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 6, 390, 690, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment A', null, null, 'A'),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 7, 1080, 41, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'host_fillable', 'host_selected', true, true, false, false, 'float', false, 'Floating Break 1 (+ adjacent funder)', 1080, 1500, 'A'),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 8, 1500, 775, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment B', null, null, 'B'),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 9, 2275, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 10, 2310, 90, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 11, 2400, 1105, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment C', null, null, 'C'),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 12, 3505, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 1, 0, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Billboard', null, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 2, 60, 180, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 1', null, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 3, 240, 100, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 2', null, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 4, 340, 20, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 5, 360, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 6, 390, 510, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment A', null, null, 'A'),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 7, 900, 30, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'host_fillable', 'host_selected', true, true, false, false, 'float', false, 'Floating Break 1', 900, 1320, 'A/B'),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 8, 930, 810, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment B', null, null, 'B'),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 9, 1740, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 10, 1800, 420, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment C', null, null, 'C'),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 11, 2220, 35, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'host_fillable', 'host_selected', true, true, false, false, 'float', false, 'Floating Break 2 (+ adjacent funder)', 2220, 2820, 'C/D'),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 12, 2285, 475, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment D', null, null, 'D'),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 13, 2760, 60, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'host_fillable', 'host_selected', true, true, false, false, 'float', false, 'Floating Break 3', 2760, 3299, 'D/E'),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 14, 2820, 655, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment E', null, null, 'E'),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 15, 3475, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 16, 3510, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 1, 0, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Billboard', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 2, 60, 180, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 1', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 3, 240, 100, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 2', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 4, 340, 20, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 5, 360, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 6, 390, 690, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment A', null, null, 'A'),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 7, 1080, 94, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 8, 1174, 26, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 9, 1200, 504, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment B', null, null, 'B'),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 10, 1704, 36, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 11, 1740, 90, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 3', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 12, 1830, 120, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 13, 1950, 90, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 4', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 14, 2040, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 15, 2100, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 16, 2135, 505, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment C', null, null, 'C'),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 17, 2640, 34, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Return', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 18, 2674, 119, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 19, 2793, 87, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Cross-Promo (Mon-Th: ME / Fri: WESAT+WATC)', null, null, null),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 20, 2880, 120, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment D', null, null, 'D'),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 21, 3000, 490, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment E', null, null, 'E'),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 22, 3490, 49, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 1, 0, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Billboard', null, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 2, 60, 180, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 1', null, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 3, 240, 100, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 2', null, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 4, 340, 20, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 5, 360, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 6, 390, 720, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment A', null, null, 'A'),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 7, 1110, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 8, 1140, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Vertical Promo (Hour 1 -> Hour 2, Hour 2 -> ATC)', null, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 9, 1200, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 10, 1235, 1075, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment B', null, null, 'B'),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 11, 1890, 120, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'optional', 'host_selected', true, true, true, false, 'float', false, 'Cutaway (fundraising / by request)', 1890, 2010, 'B'),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 12, 2310, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 13, 2340, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Horizontal Promo (same hour, following day)', null, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 14, 2400, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 15, 2435, 1040, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment C', null, null, 'C'),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 16, 3060, 120, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'optional', 'host_selected', true, true, true, false, 'float', false, 'Cutaway (fundraising / by request)', 3060, 3180, 'C'),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 17, 3475, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 18, 3510, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null);

-- Programs -----------------------------------------------------------------
insert into public.log_programs (id, name, kind) values
  ('59e22de6-f8fe-5058-9deb-8ba0da619e5b', 'Weekend Edition Sunday', 'recurring'),
  ('dd74c392-8ee1-5469-9a09-f261138b46e2', 'Weekend Edition Saturday', 'recurring'),
  ('55b5b441-fb29-50b3-8c6f-2d2595a3b5b4', 'All Things Considered (Weekends)', 'recurring'),
  ('1ab226a8-8902-5931-b0f1-80ff5b614470', 'World Cafe', 'recurring'),
  ('6224c9f3-0f84-5802-8c69-c63c9789d89b', 'Wait Wait... Don''t Tell Me!', 'recurring'),
  ('10b7a563-80db-5232-8518-c101951f0514', 'TED Radio Hour', 'recurring'),
  ('e5f53ba8-1a20-581f-9153-97eab1c11e8f', 'Hidden Brain', 'recurring'),
  ('00417d34-8168-511c-be0a-8b751ba9df40', 'Here & Now', 'recurring'),
  ('4a0b5961-db8b-57ac-899e-96af8f2a938d', 'Fresh Air Weekend', 'recurring'),
  ('0aa96623-1722-5d1d-8f4f-8dc582c15b5f', 'Fresh Air', 'recurring'),
  ('4f9d0b1a-1596-5933-bc43-a82ab29865dc', 'All Things Considered', 'recurring'),
  ('da284752-6240-5232-adbc-68783aa2d0f9', '1A', 'recurring');

-- Schedule ------------------------------------------------------------------
-- See the file header for the Fresh Air Weekend / TED Radio Hour / Here & Now
-- / World Cafe notes.
insert into public.log_schedule (program_id, clock_template_id, entry_type, days_of_week, start_date, effective_from, air_time, duration_minutes, notes) values
  ('4f9d0b1a-1596-5933-bc43-a82ab29865dc', 'ad56f125-94de-5010-9b92-1d7555856336', 'recurring', array[1,2,3,4,5]::integer[], '2026-08-03', '2026-08-03', '15:00', 120, null),
  ('59e22de6-f8fe-5058-9deb-8ba0da619e5b', '2592ffb9-9f4d-50fc-96e2-e4ab2ccb8716', 'recurring', array[0]::integer[], '2026-08-03', '2026-08-03', '07:00', 180, null),
  ('dd74c392-8ee1-5469-9a09-f261138b46e2', '4387537b-cf25-552e-b3b0-3009e31ca3c8', 'recurring', array[6]::integer[], '2026-08-03', '2026-08-03', '07:00', 180, null),
  ('55b5b441-fb29-50b3-8c6f-2d2595a3b5b4', 'e8de566c-31f4-55ea-bf01-edeb321d08a9', 'recurring', array[0,6]::integer[], '2026-08-03', '2026-08-03', '16:00', 60, null),
  ('1ab226a8-8902-5931-b0f1-80ff5b614470', '529ba227-090c-55cd-923c-272fb9a83239', 'recurring', array[1,2,3]::integer[], '2026-08-03', '2026-08-03', '19:00', 120, null),
  ('1ab226a8-8902-5931-b0f1-80ff5b614470', '529ba227-090c-55cd-923c-272fb9a83239', 'recurring', array[4]::integer[], '2026-08-03', '2026-08-03', '20:00', 60, 'Shorter Thursday block: RadioLive/RadioLive Encores occupy 18:00-20:00 that day.'),
  ('6224c9f3-0f84-5802-8c69-c63c9789d89b', '492faf0c-1b23-5f44-834a-9c1fbff52704', 'recurring', array[6]::integer[], '2026-08-03', '2026-08-03', '13:00', 60, null),
  ('10b7a563-80db-5232-8518-c101951f0514', '0a1241e4-83d9-5394-9ac2-c4d5b2b3f53f', 'recurring', array[2]::integer[], '2026-08-03', '2026-08-03', '12:00', 60, null),
  ('10b7a563-80db-5232-8518-c101951f0514', '0a1241e4-83d9-5394-9ac2-c4d5b2b3f53f', 'recurring', array[6]::integer[], '2026-08-03', '2026-08-03', '14:00', 60, null),
  ('e5f53ba8-1a20-581f-9153-97eab1c11e8f', '54160255-5605-5676-a48b-8ef8a3390c75', 'recurring', array[6]::integer[], '2026-08-03', '2026-08-03', '10:00', 60, null),
  ('00417d34-8168-511c-be0a-8b751ba9df40', '73c69735-0820-59bb-bb72-5e5ba6c5bd3a', 'recurring', array[1,2,3,4]::integer[], '2026-08-03', '2026-08-03', '13:00', 120, null),
  ('00417d34-8168-511c-be0a-8b751ba9df40', '73c69735-0820-59bb-bb72-5e5ba6c5bd3a', 'recurring', array[5]::integer[], '2026-08-03', '2026-08-03', '12:00', 60, 'Shorter Friday block: Science Friday occupies 13:00-15:00 that day.');
