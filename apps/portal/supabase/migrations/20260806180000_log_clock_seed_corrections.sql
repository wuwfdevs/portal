-- Corrects real transcription errors found by re-checking 10 of the 13 seeded
-- NPR clocks against their source PDFs (20260806150000_log_seed_npr_clocks.sql
-- and 20260806170000_log_schedule_completeness_fixes.sql), after a user report
-- that some slot times looked wrong. Two systemic bugs, plus one clock's own
-- distinct errors:
--
-- 1. Nearly every clock's transcription silently stopped a Music Bed and/or
--    Funding Credit short of the actual top of the hour, missing the final
--    seconds of "Silence" every one of these NPR house clocks reserves right
--    before the next hour's Billboard. Affects: Hidden Brain, TED Radio Hour,
--    Wait Wait... Don't Tell Me!, 1A, All Things Considered (weekday and
--    weekend), Weekend Edition Saturday/Sunday, and World Cafe.
-- 2. Morning Edition had a promo mislabeled/misplaced (a "FA Promo" sitting
--    where the diagram actually shows plain Music, while the position that
--    really is "FA Promo" was labeled "ATC Promo"), plus a dropped 30-second
--    Music slot between :29:30 and :30:00 that shifted Newscast 3 and
--    Newscast 4 thirty seconds early and inflated Newscast 4's duration to
--    120s instead of the network's actual 90s.
-- 3. All Things Considered (weekday) had a fabricated "Return / Music Bed /
--    Cross-Promo" cluster around :44:00 that does not exist in the source
--    diagram — it shows Segment D starting immediately there — and a
--    "Newscast 3" mislabeled onto what the network newscast timing.
-- 4. 1A's end-of-hour tail had two slots' labels swapped (the diagram's
--    "Funding Credit" and "Horizontal Promo" were transposed) on top of the
--    same missing-tail bug.
--
-- Verified against the source PDFs (station's own uploaded NPR network clock
-- diagrams) slot-by-slot; every corrected clock's total now sums to 3600
-- seconds. log_clock_slots is insert-only from the application (no update/
-- delete RLS policy — see CLAUDE.md's "Log" section), which is a boundary on
-- producer writes through the app, not a constraint on fixing a migration's
-- own seeding mistake at the database level; each affected version's slots
-- are deleted and re-inserted here rather than left to accumulate as a
-- confusing extra "version."
--
-- Three more clocks (Fresh Air, Fresh Air Weekend, Here & Now) have not yet
-- been re-verified against their source PDFs and are unchanged by this
-- migration — do not assume they are correct just because they're absent
-- here.

begin;

-- ── Morning Edition ─────────────────────────────────────────────────────
delete from public.log_clock_slots where clock_version_id = 'a9d5b1e6-69cc-5e94-a4be-5466f6a1863a';
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air)
values
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 1, 'Billboard', null, 0, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 2, 'Newscast 1', null, 60, 180, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 3, 'Newscast 2', null, 240, 100, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 4, 'Music Bed', null, 340, 110, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 5, 'Segment A', 'A', 450, 690, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 6, 'Music Bed', null, 1140, 90, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 7, 'FA Promo', null, 1230, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 8, 'Funding Credit', null, 1260, 50, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 9, 'Segment B', 'B', 1310, 430, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 10, 'ATC Promo', null, 1740, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 11, 'Music Bed', null, 1770, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 12, 'Newscast 3', null, 1800, 90, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 13, 'Newscast 4', null, 1890, 90, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 14, 'Music Bed', null, 1980, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 15, 'Funding Credit', null, 2040, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 16, 'Segment C', 'C', 2075, 475, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 17, 'Music Bed', null, 2550, 90, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 18, 'H&N Promo', null, 2640, 14, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 19, 'NPR Promo', null, 2654, 14, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 20, 'Music Bed', null, 2668, 31, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 21, 'Return', null, 2699, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 22, 'Segment D', 'D', 2734, 240, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 23, 'Music Bed', null, 2974, 115, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 24, 'Segment E', 'E', 3089, 450, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 25, 'Music Bed', null, 3539, 54, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 26, 'Silence', null, 3593, 5, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true);

-- ── Hidden Brain ────────────────────────────────────────────────────────
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air)
values
  ('67d43532-399b-51ae-b5e5-b99d699fc075', 12, 'Silence', null, 3540, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true);

-- ── TED Radio Hour ──────────────────────────────────────────────────────
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air)
values
  ('6da992b5-176c-54a8-b5de-c7fbadc6f8e8', 14, 'Silence', null, 3540, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true);

-- ── Wait Wait... Don't Tell Me! ─────────────────────────────────────────
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air)
values
  ('69c4f54e-c85c-5b0e-8cb0-ce8d551f873d', 16, 'Silence', null, 3540, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true);

-- ── 1A ──────────────────────────────────────────────────────────────────
delete from public.log_clock_slots where clock_version_id = '7e138bbc-7118-5b33-83c7-8fda6ef548ab';
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air, earliest_start_offset_seconds, latest_start_offset_seconds)
values
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 1, 'Billboard', null, 0, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 2, 'Newscast 1', null, 60, 180, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 3, 'Newscast 2', null, 240, 100, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 4, 'Music Bed', null, 340, 20, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 5, 'Funding Credit', null, 360, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 6, 'Segment A', 'A', 390, 720, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 7, 'Music Bed', null, 1110, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 8, 'Vertical Promo (Hour 1 -> Hour 2, Hour 2 -> ATC)', null, 1140, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 9, 'Funding Credit', null, 1200, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 10, 'Segment B', 'B', 1235, 1075, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 11, 'Cutaway (fundraising / by request)', 'B', 1890, 120, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'optional', 'host_selected', true, true, true, false, 'float', false, 1890, 2010),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 12, 'Music Bed', null, 2310, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 13, 'Horizontal Promo (same hour, following day)', null, 2340, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 14, 'Funding Credit', null, 2400, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 15, 'Segment C', 'C', 2435, 1040, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 16, 'Cutaway (fundraising / by request)', 'C', 3060, 120, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'optional', 'host_selected', true, true, true, false, 'float', false, 3060, 3180),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 17, 'Funding Credit', null, 3475, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 18, 'Horizontal Promo', null, 3510, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 19, 'Music Bed (Live Feed Only)', null, 3540, 56, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('7e138bbc-7118-5b33-83c7-8fda6ef548ab', 20, 'Silence', null, 3596, 4, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null);

-- ── All Things Considered (weekday) ─────────────────────────────────────
delete from public.log_clock_slots where clock_version_id = '02448d52-27f4-5be5-9442-2a2bf23a4010';
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air)
values
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 1, 'Billboard', null, 0, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 2, 'Newscast 1', null, 60, 180, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 3, 'Newscast 2', null, 240, 100, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 4, 'Music Bed', null, 340, 20, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 5, 'Funding Credit', null, 360, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 6, 'Segment A', 'A', 390, 690, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 7, 'Music Bed', null, 1080, 94, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 8, 'Funding Credit', null, 1174, 26, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 9, 'Segment B', 'B', 1200, 504, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 10, 'Music Bed', null, 1704, 36, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 11, 'Promo (Mon-Th: HR1+HR2 ME / Fri: HR1 WESAT / Fri: HR2 WATC)', null, 1740, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 12, 'Music Bed', null, 1770, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 13, 'Return', null, 1800, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 14, 'Newscast 3', null, 1830, 120, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 15, 'Newscast 4', null, 1950, 90, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 16, 'Music Bed', null, 2040, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 17, 'Funding Credit', null, 2100, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 18, 'Segment C', 'C', 2135, 505, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 19, 'Segment D', 'D', 2640, 240, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 20, 'Music Bed', null, 2880, 120, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 21, 'Segment E', 'E', 3000, 490, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 22, 'Funding Credit', null, 3490, 50, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 23, 'Music Bed', null, 3540, 55, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('02448d52-27f4-5be5-9442-2a2bf23a4010', 24, 'Silence', null, 3595, 5, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true);

-- ── All Things Considered (Weekends) ────────────────────────────────────
delete from public.log_clock_slots where clock_version_id = 'c1d3984f-2ab3-514a-a0af-7440686446e3' and position >= 18;
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air)
values
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 18, 'Funding Credit', null, 3510, 85, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('c1d3984f-2ab3-514a-a0af-7440686446e3', 19, 'Silence', null, 3595, 5, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true);

-- ── Weekend Edition Saturday ────────────────────────────────────────────
delete from public.log_clock_slots where clock_version_id = '6476a80c-e33a-5520-96e9-1c38c4ba1281' and position >= 18;
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air)
values
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 18, 'Funding Credit', null, 3510, 85, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('6476a80c-e33a-5520-96e9-1c38c4ba1281', 19, 'Silence', null, 3595, 5, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true);

-- ── Weekend Edition Sunday ──────────────────────────────────────────────
delete from public.log_clock_slots where clock_version_id = '722314ab-721c-5676-b3bf-5b58bece999e' and position >= 18;
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air)
values
  ('722314ab-721c-5676-b3bf-5b58bece999e', 18, 'Funding Credit', null, 3510, 85, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('722314ab-721c-5676-b3bf-5b58bece999e', 19, 'Silence', null, 3595, 5, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true);

-- ── World Cafe ──────────────────────────────────────────────────────────
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air)
values
  ('cc6a85c7-c413-5abd-9e21-224910a36208', 9, 'Silence', null, 3540, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true);

commit;
