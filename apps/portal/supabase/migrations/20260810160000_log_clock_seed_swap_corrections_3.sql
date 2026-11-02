-- Fixes two more label-position swaps, found while cross-checking the newly
-- audited WUWF_broadcast_clocks_and_local_break_eligibility_VERIFIED.xlsx
-- (2026-08-10 provider-clock audit) against the live NPR Show Clock data
-- already seeded for the five NPR live newsmagazines. Same bug class as
-- 20260807190000_log_clock_seed_top_of_hour_swap.sql -- offsets and
-- durations were already correct, only which element sits at which offset
-- was backwards -- found this time by diffing this repo's own seeded slots
-- position-by-position against the audit's independently retranscribed
-- "NPR Clock Slots" sheet (same source: NPR Show Clock application,
-- retrieved 2026-08-10), not by re-rendering a source PDF.
--
-- Swap 1, Here & Now only: offset 2310 (30s) is currently "Music Bed" but
-- the audit's independent transcription has "ME Promo" (protected) there,
-- 38:30-39:00; offset 2340 (60s) is currently "ME Promo" but should be
-- "Music Bed" (locally eligible), 39:00-40:00. No other seeded template
-- has this pair at these offsets -- Morning Edition and All Things
-- Considered (weekday) were checked against the same audit sheet
-- position-by-position and already have this junction in the correct
-- order.
--
-- Swap 2, Weekend Edition Saturday, Weekend Edition Sunday, and All Things
-- Considered (Weekends) -- these three templates share an identical
-- structure at both junctions below, confirmed by diffing each against the
-- audit's own separate "Weekend Edition" and "Weekend All Things
-- Considered" transcriptions:
--   * offset 2340 (30s) is currently "Music Bed" but should be each
--     template's own cross-promo label (protected), 39:00-39:30; offset
--     2370 (30s) is currently that cross-promo label but should be
--     "Music Bed" (locally eligible), 39:30-40:00.
--   * offset 3475 (35s) is currently "Music Bed" but should be "Funder"
--     (protected), 57:55-58:30; offset 3510 (85s) is currently "Funding
--     Credit" but should be "Music Bed" (locally eligible), 58:30-59:55.
--
-- Each template's cross-promo label is its own (it names which programs
-- the promo is for), so the 2340/2370 swap is written per template rather
-- than as one shared case expression the way the 3475/3510 swap is.
--
-- These corrections land before 20260810170000_log_syndicated_local_
-- opportunities.sql in the same audit pass specifically so that migration
-- can seed Here & Now's 39:00-40:00 window and both weekend templates'
-- 39:30-40:00 / 58:30-59:55 windows onto their corrected (now locally-
-- eligible) positions rather than onto a promo/funder slot.

begin;

-- Swap 1: Here & Now
update public.log_clock_slots
set label = case start_offset_seconds when 2310 then 'ME Promo' when 2340 then 'Music Bed' end
where clock_version_id = 'f5c6d57a-b646-5abf-8b57-d3b4160b2a29' -- Here & Now
  and start_offset_seconds in (2310, 2340);

-- Swap 2a: the shared 3475/3510 Music Bed <-> Funder/Funding Credit pair,
-- identical text across all three weekend templates.
update public.log_clock_slots
set label = case start_offset_seconds when 3475 then 'Funder' when 3510 then 'Music Bed' end
where clock_version_id in (
  '6476a80c-e33a-5520-96e9-1c38c4ba1281', -- Weekend Edition Saturday
  '722314ab-721c-5676-b3bf-5b58bece999e', -- Weekend Edition Sunday
  'c1d3984f-2ab3-514a-a0af-7440686446e3'  -- All Things Considered (Weekends)
)
and start_offset_seconds in (3475, 3510);

-- Swap 2b: the 2340/2370 Music Bed <-> cross-promo pair. Each template's
-- own cross-promo label text is preserved, just moved to the other offset.
update public.log_clock_slots
set label = case start_offset_seconds when 2340 then 'Cross-Promo (HR1: WATC / HR2: WESAT)' when 2370 then 'Music Bed' end
where clock_version_id = '6476a80c-e33a-5520-96e9-1c38c4ba1281' -- Weekend Edition Saturday
  and start_offset_seconds in (2340, 2370);

update public.log_clock_slots
set label = case start_offset_seconds when 2340 then 'Cross-Promo (HR1: WATC / HR2: ME)' when 2370 then 'Music Bed' end
where clock_version_id = '722314ab-721c-5676-b3bf-5b58bece999e' -- Weekend Edition Sunday
  and start_offset_seconds in (2340, 2370);

update public.log_clock_slots
set label = case start_offset_seconds when 2340 then 'Cross-Promo (Sat: WESUN / Sun: ME)' when 2370 then 'Music Bed' end
where clock_version_id = 'c1d3984f-2ab3-514a-a0af-7440686446e3' -- All Things Considered (Weekends)
  and start_offset_seconds in (2340, 2370);

commit;
