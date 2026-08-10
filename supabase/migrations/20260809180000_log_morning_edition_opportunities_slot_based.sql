-- Log: re-seeds Morning Edition's 5 real local opportunities under the new
-- slot-keyed model — the previous migration
-- (20260809170000_log_local_opportunities_slot_based.sql) necessarily wiped
-- every existing log_local_opportunities row (slot_id had to be populated
-- before it could be required, and there was no way to backfill it for rows
-- authored under the old independent-time-range shape). Unlike that
-- migration's other deletions (generated rundowns, scheduled placements —
-- disposable scaffolding with zero broadcast history), these 5 opportunities
-- are the confirmed real reference data the whole domain redesign has been
-- built and checked against (20260808210000_log_morning_edition_
-- opportunities.sql) — worth reconstructing exactly, not leaving gone.
--
-- Resolves each opportunity's slot_id by (clock_version_id,
-- start_offset_seconds) rather than a hardcoded id: log_clock_slots.id is
-- gen_random_uuid()-assigned at insert time, so the actual slot ids differ
-- between the preview and production projects even though both were seeded
-- from the same deterministic clock_version_id and the same offsets —
-- confirmed directly (a first attempt at this migration, hardcoding
-- preview's own slot ids, failed its FK constraint immediately on
-- production with a different set of ids for the identical clock).
--
-- Mapping, derived directly from Morning Edition's actual clock slots:
--
--   1. Old: start_offset_seconds=360, duration_seconds=90 ("post-newscast
--      music bed"). Matches exactly one slot: position 5, "Music Bed",
--      offset 360, duration 90.
--   2. Old: start_offset_seconds=1140, duration_seconds=90 ("Segment A
--      music bed"). Matches exactly one slot: position 7, "Music Bed",
--      offset 1140, duration 90.
--   3. Old: start_offset_seconds=1770, duration_seconds=270 (the ~29:30-
--      34:00 story window, "spans the tail of the ATC cross-promo, a Music
--      Bed, and both Newscast 3 and Newscast 4" — four network slots for
--      one WUWF opportunity, per CLAUDE.md). The numeric range 1770-2040
--      matches exactly four consecutive slots summing to 270s: position 12
--      "Music Bed" (1770-1800), position 13 "Newscast 3" (1800-1890),
--      position 14 "Newscast 4" (1890-1980), position 15 "Music Bed"
--      (1980-2040) — this is the concrete case Design A's "several
--      separate slot-keyed rows, one per slot" replaces a single custom
--      range with.
--   4. Old: start_offset_seconds=2975, duration_seconds=115 ("Lands almost
--      exactly on the Music Bed at :49:34-:51:29"). Matches one slot:
--      position 24, "Music Bed", offset 2974, duration 115 (the 1s
--      difference is the same ~1s rounding noise CLAUDE.md's clock
--      corrections already note throughout this seed).
--   5. Old: start_offset_seconds=2550, duration_seconds=90 (the required
--      legal ID / announcement window). Matches one slot: position 18,
--      "Music Bed", offset 2550, duration 90.
--
-- requirement/permitted_content_types/notes are carried over unchanged from
-- the original seed; timing_mode/offsets/duration/label are no longer
-- authored here at all — they're always whichever slot each row references.

with morning_edition_slots as (
  select id, start_offset_seconds
  from public.log_clock_slots
  where clock_version_id = 'a9d5b1e6-69cc-5e94-a4be-5466f6a1863a'
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes)
select
  'a9d5b1e6-69cc-5e94-a4be-5466f6a1863a',
  seed.slot_id,
  seed.requirement::public.log_opportunity_requirement,
  seed.permitted_content_types,
  seed.notes
from (
  values
    (
      (select id from morning_edition_slots where start_offset_seconds = 360), -- position 5, Music Bed, 6:00
      'optional',
      array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'],
      'Short avail over the Music Bed following the 5:40 newscast/funding-credit pair. Left unused, NPR''s own music continues — a normal, resolved state.'
    ),
    (
      (select id from morning_edition_slots where start_offset_seconds = 1140), -- position 7, Music Bed, 19:00
      'optional',
      array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'],
      'Short avail over the Music Bed following Segment A.'
    ),
    (
      (select id from morning_edition_slots where start_offset_seconds = 1770), -- position 12, Music Bed (tail of ATC Promo), part 1/4 of the story window
      'optional',
      array['news', 'interview_feature', 'host_created'],
      'Part of the ~29:30-34:00 local story window (1 of 4 slots it spans — see this migration''s header). WUWF''s call to run a longer local story or feature across all four in place of that network material. Some days nothing local is ready and NPR''s own material runs unmodified.'
    ),
    (
      (select id from morning_edition_slots where start_offset_seconds = 1800), -- position 13, Newscast 3, part 2/4
      'optional',
      array['news', 'interview_feature', 'host_created'],
      'Part of the ~29:30-34:00 local story window (2 of 4 slots it spans — see this migration''s header).'
    ),
    (
      (select id from morning_edition_slots where start_offset_seconds = 1890), -- position 14, Newscast 4, part 3/4
      'optional',
      array['news', 'interview_feature', 'host_created'],
      'Part of the ~29:30-34:00 local story window (3 of 4 slots it spans — see this migration''s header).'
    ),
    (
      (select id from morning_edition_slots where start_offset_seconds = 1980), -- position 15, Music Bed, part 4/4
      'optional',
      array['news', 'interview_feature', 'host_created'],
      'Part of the ~29:30-34:00 local story window (4 of 4 slots it spans — see this migration''s header).'
    ),
    (
      (select id from morning_edition_slots where start_offset_seconds = 2974), -- position 24, Music Bed, ~49:35-51:30
      'optional',
      array['news', 'interview_feature', 'host_created'],
      'Lands almost exactly on the Music Bed at :49:34-:51:29 — WUWF''s second common story-substitution point.'
    ),
    (
      (select id from morning_edition_slots where start_offset_seconds = 2550), -- position 18, Music Bed, 42:30
      'required',
      array['legal_id', 'university_announcement'],
      'A genuine local obligation, unlike the other windows above — left unfilled, this is flagged unresolved rather than treated as "carrying network."'
    )
) as seed(slot_id, requirement, permitted_content_types, notes)
where seed.slot_id is not null
on conflict (slot_id) do nothing;
