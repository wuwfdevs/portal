-- Fixes a real error in Morning Edition's top-of-hour slots found by a user
-- report ("the 5:40 break doesn't actually start until 6:00") after the two
-- prior clock-correction passes. The 20260806180000 migration had merged
-- Newscast 2's trailing gap and the following Music Bed into a single
-- 110-second "Music Bed" starting at 5:40 (340s) — but a maximum-resolution
-- re-render of the source PDF shows a genuine, separately-colored (red =
-- Funding Credit, per the clock's own legend) 20-second wedge from 5:40 to
-- 6:00, distinct from the visible teal "Music" wedge that only starts at
-- 6:00 and runs to 7:30 (90s, confirmed against the diagram's own duration
-- labels). The red double-headed arrow drawn over that boundary is (as
-- established for every other clock's identical annotation) just a note
-- about the network newscast's run-time tolerance — the wedge underneath it
-- is a real, separately-bounded slot, not decoration.
--
-- Same insert-only rationale as the two prior corrections migrations:
-- deletes and re-inserts this version's slots rather than leaving the
-- earlier mistake in place.

begin;

delete from public.log_clock_slots where clock_version_id = 'a9d5b1e6-69cc-5e94-a4be-5466f6a1863a';
insert into public.log_clock_slots
  (clock_version_id, position, label, segment_label, start_offset_seconds, duration_seconds, permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable, allow_empty, allow_multiple, timing_mode, lock_on_air)
values
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 1, 'Billboard', null, 0, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 2, 'Newscast 1', null, 60, 180, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 3, 'Newscast 2', null, 240, 100, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 4, 'Funding Credit', null, 340, 20, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 5, 'Music Bed', null, 360, 90, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 6, 'Segment A', 'A', 450, 690, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 7, 'Music Bed', null, 1140, 90, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 8, 'FA Promo', null, 1230, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 9, 'Funding Credit', null, 1260, 50, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 10, 'Segment B', 'B', 1310, 430, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 11, 'ATC Promo', null, 1740, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 12, 'Music Bed', null, 1770, 30, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 13, 'Newscast 3', null, 1800, 90, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 14, 'Newscast 4', null, 1890, 90, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 15, 'Music Bed', null, 1980, 60, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 16, 'Funding Credit', null, 2040, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 17, 'Segment C', 'C', 2075, 475, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 18, 'Music Bed', null, 2550, 90, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 19, 'H&N Promo', null, 2640, 14, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 20, 'NPR Promo', null, 2654, 14, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 21, 'Music Bed', null, 2668, 31, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 22, 'Return', null, 2699, 35, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 23, 'Segment D', 'D', 2734, 240, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 24, 'Music Bed', null, 2974, 115, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 25, 'Segment E', 'E', 3089, 450, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 26, 'Music Bed', null, 3539, 54, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 27, 'Silence', null, 3593, 5, '{}', 'required', 'automatic', false, false, false, false, 'fixed', true);

commit;
