-- Second pass of clock-seed corrections, covering the 3 clocks
-- (20260806180000_log_clock_seed_corrections.sql) left unverified: Fresh
-- Air, Fresh Air Weekend, and Here & Now. Re-checked against their source
-- PDFs slot-by-slot after their earlier verification agent stalled and was
-- restarted.
--
-- Same systemic missing-end-of-hour-tail bug as before (Music Bed then
-- Silence right before the next hour's Billboard) in all three. Beyond
-- that:
-- - Fresh Air: Segment B's duration was wrong (810s instead of 768s), a
--   35-second Funding Credit between Segment B and the following Music Bed
--   was missing entirely, and Floating Break 2's own duration undercounted
--   its "adjacent funder" half (35s instead of the combined Music+Funding
--   Credit's 65s the diagram's own "(+ adjacent funder)" label already
--   named it for).
-- - Fresh Air Weekend: Floating Break 1's duration was badly undercounted
--   (41s instead of 101s covering its Music+Funding Credit combo), and
--   Segment B was anchored to the floating window's *latest* bound (25:00)
--   instead of right after the break's nominal placement — leaving a real
--   379-second hole in the schedule between them that RLS's insert-only
--   history had no way to catch.
-- - Here & Now: a real, unusual structural feature this clock has and the
--   others don't — a 10-second Funding Credit before Billboard, which then
--   only runs 50s, not 60s — was flattened into a single 60-second
--   Billboard; a Promo/Music Bed pair right after Segment A had swapped
--   labels; and a 35-second Funding Credit between Segment D's trailing
--   Music Bed and Segment E was missing, so Segment E's own start/duration
--   were both off by that same 35 seconds.
--
-- Verified against the source PDFs slot-by-slot; all three clocks now sum
-- to exactly 3600 seconds. Same insert-only rationale as the first
-- corrections migration: log_clock_slots has no update/delete RLS policy
-- for producers (CLAUDE.md's "Log" section), which is a boundary on writes
-- through the app, not a reason to leave a seeding mistake in the database;
-- each affected version's slots are deleted and re-inserted here.

begin;

-- ── Fresh Air ───────────────────────────────────────────────────────────
delete from public.log_clock_slots where clock_version_id = '23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f';
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air, earliest_start_offset_seconds, latest_start_offset_seconds)
values
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 1, 'Billboard', null, 0, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 2, 'Newscast 1', null, 60, 180, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 3, 'Newscast 2', null, 240, 100, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 4, 'Music Bed', null, 340, 20, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 5, 'Funding Credit', null, 360, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 6, 'Segment A', 'A', 390, 510, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 7, 'Floating Break 1', 'A/B', 900, 30, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'host_fillable', 'host_selected', true, true, false, false, 'float', false, 900, 1320),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 8, 'Segment B', 'B', 930, 768, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 9, 'Funding Credit', null, 1698, 42, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 10, 'Music Bed', null, 1740, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 11, 'Segment C', 'C', 1800, 420, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 12, 'Floating Break 2 (+ adjacent funder)', 'C/D', 2220, 65, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'host_fillable', 'host_selected', true, true, false, false, 'float', false, 2220, 2820),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 13, 'Segment D', 'D', 2285, 475, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 14, 'Floating Break 3', 'D/E', 2760, 60, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'host_fillable', 'host_selected', true, true, false, false, 'float', false, 2760, 3299),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 15, 'Segment E', 'E', 2820, 655, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 16, 'Funding Credit', null, 3475, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 17, 'Music Bed', null, 3510, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('23aa8d46-7a27-5f8d-8828-fe6dd8b5d69f', 18, 'Silence', null, 3540, 59, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null);

-- ── Fresh Air Weekend ───────────────────────────────────────────────────
delete from public.log_clock_slots where clock_version_id = 'e279d8cd-c7f7-586a-8c3b-51e3f20c3f64';
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air, earliest_start_offset_seconds, latest_start_offset_seconds)
values
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 1, 'Billboard', null, 0, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 2, 'Newscast 1', null, 60, 180, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 3, 'Newscast 2', null, 240, 100, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 4, 'Music Bed', null, 340, 20, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 5, 'Funding Credit', null, 360, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 6, 'Segment A', 'A', 390, 690, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 7, 'Floating Break 1 (+ adjacent funder)', 'A', 1080, 101, array['legal_id','underwriting_credit','station_promo','psa']::text[], 'host_fillable', 'host_selected', true, true, false, false, 'float', false, 1080, 1500),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 8, 'Segment B', 'B', 1181, 1094, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 9, 'Funding Credit', null, 2275, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 10, 'Music Bed', null, 2310, 90, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 11, 'Segment C', 'C', 2400, 1104, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 12, 'Funding Credit', null, 3504, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null),
  ('e279d8cd-c7f7-586a-8c3b-51e3f20c3f64', 13, 'Silence', null, 3539, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true, null, null);

-- ── Here & Now ──────────────────────────────────────────────────────────
delete from public.log_clock_slots where clock_version_id = 'f5c6d57a-b646-5abf-8b57-d3b4160b2a29';
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air)
values
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 1, 'Funding Credit', null, 0, 10, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 2, 'Billboard', null, 10, 50, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 3, 'Newscast 1', null, 60, 180, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 4, 'Newscast 2', null, 240, 100, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 5, 'Music Bed', null, 340, 20, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 6, 'Funding Credit', null, 360, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 7, 'Segment A', 'A', 390, 720, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 8, 'ATC Promo', null, 1110, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 9, 'Music Bed', null, 1140, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 10, 'Funding Credit', null, 1200, 20, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 11, 'Segment B', 'B', 1220, 670, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 12, 'Newscast', null, 1890, 90, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 13, 'Music Bed', null, 1980, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 14, 'Funding Credit', null, 2040, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 15, 'Segment C', 'C', 2075, 235, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 16, 'Music Bed', null, 2310, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 17, 'ME Promo', null, 2340, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 18, 'Funding Credit', null, 2400, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 19, 'Segment D', 'D', 2435, 595, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 20, 'Music Bed', null, 3030, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 21, 'Funding Credit', null, 3090, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 22, 'Segment E', 'E', 3125, 365, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 23, 'Funding Credit', null, 3490, 20, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 24, 'HN Promo', null, 3510, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 25, 'Music Bed', null, 3540, 54, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('f5c6d57a-b646-5abf-8b57-d3b4160b2a29', 26, 'Silence', null, 3594, 6, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true);

commit;
