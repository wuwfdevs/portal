-- Seeds log_local_opportunities across the 23 clock templates that had zero
-- local-break eligibility marked before this migration (every clocked
-- program except Morning Edition, which 20260809180000_log_morning_
-- edition_opportunities_slot_based.sql already seeded). Source:
-- WUWF_broadcast_clocks_and_local_break_eligibility_VERIFIED.xlsx, a
-- program-by-program provider-clock audit completed 2026-08-10 -- the
-- workbook's "Eligible Breaks" sheet is the row-by-row source for every
-- entry below, cross-checked against this repo's own log_clock_slots for
-- every offset. Every clock_version_id below is resolved by clock
-- template NAME (current version, effective_to is null), not a hardcoded
-- id: the 11 syndicated templates (BBC World Service, Marketplace, On the
-- Media, Science Friday, The World, This American Life, Living on Earth,
-- Echoes, Jazz Happening Now, Jazz After Hours, Travel with Rick Steves)
-- were each created through the producer UI independently in preview and
-- production, so their clock_version_id/log_clock_slots.id values are
-- gen_random_uuid()-assigned per environment and genuinely differ between
-- the two projects -- confirmed directly: preview and production hold
-- byte-for-byte identical slot offsets/durations/labels for all 11, but
-- different ids. Resolving by name (rather than the hardcoded-id pattern
-- every purely migration-seeded clock in this repo has used until now)
-- is what makes this one migration file correct as-is in both projects.
--
-- One correction rides in first, in 20260810160000_log_clock_seed_swap_
-- corrections_3.sql: two more label-position swaps (same bug class as
-- 20260807190000's top-of-hour swap) found by diffing this repo's seeded
-- slots against the audit's independent structural transcription of the
-- five NPR live newsmagazines. This migration seeds onto the corrected
-- positions.
--
-- requirement is 'optional' throughout -- nothing in this audit
-- established a new 'required' local obligation the way Morning Edition's
-- own 42:30 legal-ID window already is. Silence/fill windows ("Conditional
-- ... check provider guidance" in the audit) are seeded but active=false,
-- matching the precedent already set by Morning Edition's own trailing
-- Silence opportunity -- present so a future policy change can flip them
-- on, not offered today. Rows the audit itself says not to seed without a
-- WUWF policy decision (each clock's Billboard, and Morning Edition/All
-- Things Considered/Weekend Edition/Weekend ATC's "Return" slot) are left
-- out entirely, matching Morning Edition's own precedent.
--
-- Three things the audit raised that are deliberately NOT in this
-- migration:
--   * Marketplace Morning Report isn't a separate WUWF program -- its six
--     "eligible" windows land on the exact same offsets as Morning
--     Edition's own already-seeded Music Bed opportunities (it's carried
--     inside Morning Edition's network feed), so it needed no new rows.
--     Production (but not preview) already has its own standalone
--     "Marketplace Morning Report — Morning Edition Overlay" clock
--     template, entered independently through the producer UI; it isn't
--     referenced by this migration and is left exactly as it is.
--   * Fresh Air Weekend has a clock template (from the original 13-clock
--     seed) but is not on the current WUWF schedule; held rather than
--     seeded until it airs again.
--   * Three "Music bed after [a promo]" rows -- 1A at 39:00-40:00, and Wait
--     Wait...Don't Tell Me! at both 19:00-20:00 and 39:00-40:00 -- land
--     exactly on a Promo-labeled slot in this repo's own seeded clocks,
--     the same pattern the swap-corrections migration fixed elsewhere. But
--     unlike Here & Now/Weekend Edition/Weekend ATC, 1A and Wait Wait have
--     no independent structural transcription in this audit to confirm a
--     swap (they come from single dated PDFs, not the live NPR Show
--     Clock) -- so rather than guess, these three are left unseeded
--     pending confirmation of which element is actually correct.

-- BBC World Service
with slots_bbcworldservice_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'BBC World Service' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_bbcworldservice as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_bbcworldservice_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_bbcworldservice_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_bbcworldservice where start_offset_seconds = 1770), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Cutaway between Segment A and the 29:30 funder/Billboard sequence. Source: uploaded bbc-ws-clock-revised.pdf, visually verified.', true),
    ((select id from slots_bbcworldservice where start_offset_seconds = 3540), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Cutaway at the top of the hour, before the next hour''s Billboard. Source: uploaded bbc-ws-clock-revised.pdf, visually verified.', true)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Marketplace
with slots_marketplace_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Marketplace' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_marketplace as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_marketplace_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_marketplace_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_marketplace where start_offset_seconds = 1080), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating cutaway; nominal graphic placement is 18:00-18:59 within an approximately 13:00-21:00 allowable window per the APM clock. Source: uploaded marketplace-clock.pdf, visually verified.', true),
    ((select id from slots_marketplace where start_offset_seconds = 1725), array['news', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'psa', 'legal_id', 'interview_feature', 'host_created', 'underwriting_credit', 'weather'], 'Trailing silence after the final notes/next-day promo. Not a routine avail; carried inactive per the same precedent as Morning Edition''s own trailing Silence slot. Source: uploaded marketplace-clock.pdf, visually verified.', false)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- On the Media
with slots_onthemedia_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'On the Media' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_onthemedia as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_onthemedia_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_onthemedia_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_onthemedia where start_offset_seconds = 1080), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break package 1 (funder + music bed). Only the music-bed portion may be covered locally -- the 0:34 funder immediately before it in the same package is national and protected. Source: WNYC clock graphic, visually verified.', true),
    ((select id from slots_onthemedia where start_offset_seconds = 2245), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break package 2 (funder + music bed). Only the music-bed portion may be covered locally -- the adjacent funder is protected. Source: WNYC clock graphic, visually verified.', true),
    ((select id from slots_onthemedia where start_offset_seconds = 3540), array['news', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'psa', 'legal_id', 'interview_feature', 'host_created', 'underwriting_credit', 'weather'], 'One-minute silence wedge after the 59:00 program end, before the next hour''s start. Carried inactive per the same precedent as Morning Edition''s own trailing Silence slot. Source: WNYC clock graphic, visually verified.', false)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Science Friday
with slots_sciencefriday_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Science Friday' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_sciencefriday as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_sciencefriday_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_sciencefriday_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_sciencefriday where start_offset_seconds = 60), array['news', 'interview_feature', 'host_created'], 'Newscast cutaway. Source: WNYC January 2024 clock graphic, visually verified.', true),
    ((select id from slots_sciencefriday where start_offset_seconds = 1140), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Local break with music bed. Source: WNYC January 2024 clock graphic, visually verified.', true),
    ((select id from slots_sciencefriday where start_offset_seconds = 2340), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Local break with music bed. Source: WNYC January 2024 clock graphic, visually verified.', true),
    ((select id from slots_sciencefriday where start_offset_seconds = 3540), array['news', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'psa', 'legal_id', 'interview_feature', 'host_created', 'underwriting_credit', 'weather'], 'End-of-hour music/silence fill. Carried inactive per the same precedent as Morning Edition''s own trailing Silence slot. Source: WNYC January 2024 clock graphic, visually verified.', false)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- The World
with slots_theworld_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'The World' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_theworld as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_theworld_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_theworld_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_theworld where start_offset_seconds = 60), array['news', 'interview_feature', 'host_created'], 'Newscast cutaway / music bed. Source: uploaded TheWorld_ProgramClock.1.9.25.pdf, visually verified.', true),
    ((select id from slots_theworld where start_offset_seconds = 1200), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music-filled cutaway. Source: uploaded TheWorld_ProgramClock.1.9.25.pdf, visually verified.', true),
    ((select id from slots_theworld where start_offset_seconds = 1770), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music-filled cutaway. Source: uploaded TheWorld_ProgramClock.1.9.25.pdf, visually verified.', true),
    ((select id from slots_theworld where start_offset_seconds = 1800), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Midway cutaway / music bed. Source: uploaded TheWorld_ProgramClock.1.9.25.pdf, visually verified.', true),
    ((select id from slots_theworld where start_offset_seconds = 2940), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music-filled cutaway. Source: uploaded TheWorld_ProgramClock.1.9.25.pdf, visually verified.', true),
    ((select id from slots_theworld where start_offset_seconds = 3540), array['news', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'psa', 'legal_id', 'interview_feature', 'host_created', 'underwriting_credit', 'weather'], 'Silence before the next-day promo. Carried inactive per the same precedent as Morning Edition''s own trailing Silence slot. Source: uploaded TheWorld_ProgramClock.1.9.25.pdf, visually verified.', false),
    ((select id from slots_theworld where start_offset_seconds = 3585), array['news', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'psa', 'legal_id', 'interview_feature', 'host_created', 'underwriting_credit', 'weather'], 'Silence at the top of the hour. Carried inactive per the same precedent as Morning Edition''s own trailing Silence slot. Source: uploaded TheWorld_ProgramClock.1.9.25.pdf, visually verified.', false)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- This American Life
with slots_thisamericanlife_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'This American Life' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_thisamericanlife as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_thisamericanlife_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_thisamericanlife_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_thisamericanlife where start_offset_seconds = 60), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break 1, music bed; floats between 1:00 and 15:00 per the PRX clock. Source: uploaded TAL_broadcast+clock_final+(2).pdf, visually verified.', true),
    ((select id from slots_thisamericanlife where start_offset_seconds = 2700), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break 2, music bed; floats within the 45:00-59:00 portion of the hour per the PRX clock. Source: uploaded TAL_broadcast+clock_final+(2).pdf, visually verified.', true)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Living on Earth
with slots_livingonearth_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Living on Earth' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_livingonearth as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_livingonearth_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_livingonearth_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_livingonearth where start_offset_seconds = 60), array['news', 'interview_feature', 'host_created'], 'News cutaway. Source: PRX clock graphic, visually verified.', true),
    ((select id from slots_livingonearth where start_offset_seconds = 1020), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break 1, music bed; provider gives an approximately :20 post within a 17:00-23:00 window. Source: PRX clock graphic, visually verified.', true),
    ((select id from slots_livingonearth where start_offset_seconds = 2220), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break 2, music bed; provider gives an approximately :40 post within a 37:00-43:00 window. Source: PRX clock graphic, visually verified.', true)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Echoes
with slots_echoes_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Echoes' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_echoes as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_echoes_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_echoes_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_echoes where start_offset_seconds = 7140), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Hour 2''s final music bed / optional station ID break, immediately before the next day''s Billboard. The parallel Hour 1 junction (59:00-60:00) is explicitly Protected/network content per the Clock Slots audit and is not eligible. Source: uploaded BroadcastClock_Echoes1.pdf / BroadcastClock_Echoes2.pdf, visually verified.', true)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Jazz Happening Now
with slots_jazzhappeningnow_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Jazz Happening Now' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_jazzhappeningnow as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_jazzhappeningnow_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_jazzhappeningnow_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_jazzhappeningnow where start_offset_seconds = 960), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break 1, music-filled; caption specifies a 20-second break between :16 and :20. Weekly rundown gives the exact post. Source: PRX clock graphic, visually verified.', true),
    ((select id from slots_jazzhappeningnow where start_offset_seconds = 2160), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break 2, music-filled; caption specifies a 20-second break between :36 and :40. Source: PRX clock graphic, visually verified.', true)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Jazz After Hours
with slots_jazzafterhours_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Jazz After Hours' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_jazzafterhours as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_jazzafterhours_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_jazzafterhours_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_jazzafterhours where start_offset_seconds = 3540), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement'], 'Station ID window at the top of each hour: stations may take a 20-second ID (leaving 40 seconds of network fill/talk) or the full 60 seconds. This clock template covers one hour and repeats across the 4-hour feed via the rundown builder, so a single opportunity here covers all four hourly ID windows -- not four separate ones. Source: uploaded BroadcastClock_JazzAfterHours.pdf, visually verified.', true)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Travel with Rick Steves
with slots_travelwithricksteves_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Travel with Rick Steves' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_travelwithricksteves as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_travelwithricksteves_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_travelwithricksteves_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_travelwithricksteves where start_offset_seconds = 60), array['news', 'interview_feature', 'host_created'], 'NPR or BBC newscast insert. Source: uploaded twrs-format-clock-1500.jpg, visually verified.', true),
    ((select id from slots_travelwithricksteves where start_offset_seconds = 1140), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music bed / local break. Source: uploaded twrs-format-clock-1500.jpg, visually verified.', true),
    ((select id from slots_travelwithricksteves where start_offset_seconds = 2310), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music bed / local break. Source: uploaded twrs-format-clock-1500.jpg, visually verified.', true),
    ((select id from slots_travelwithricksteves where start_offset_seconds = 3540), array['news', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'psa', 'legal_id', 'interview_feature', 'host_created', 'underwriting_credit', 'weather'], 'Trailing silence. Carried inactive per the same precedent as Morning Edition''s own trailing Silence slot. Source: uploaded twrs-format-clock-1500.jpg, visually verified.', false)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Morning Edition
with slots_morningedition_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Morning Edition' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_morningedition as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_morningedition_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_morningedition_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_morningedition where start_offset_seconds = 240), array['news', 'interview_feature', 'host_created'], 'Newscast 2 (4:00-5:40) -- an optional cutaway missed by the original slot-based reseed: "station may leave the national newscast or cut away at :04:00 for local news." Every other eligible Morning Edition window from this same audit already matches one of the 11 opportunities seeded by 20260809180000_log_morning_edition_opportunities_slot_based.sql. Source: NPR Show Clock application, retrieved 2026-08-10.', true)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Here & Now
with slots_herenow_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Here & Now' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_herenow as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_herenow_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_herenow_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_herenow where start_offset_seconds = 240), array['news', 'interview_feature', 'host_created'], 'Newscast 2 (4:00-5:40), optional cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_herenow where start_offset_seconds = 360), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music bed (6:00-6:30). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_herenow where start_offset_seconds = 1140), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music bed (19:00-20:00). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_herenow where start_offset_seconds = 1890), array['news', 'interview_feature', 'host_created'], 'Newscast 3 (31:30-33:00), optional cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_herenow where start_offset_seconds = 2340), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music bed (39:00-40:00) -- corrected position; see 20260810160000_log_clock_seed_swap_corrections_3.sql, which fixed this slot''s label being swapped with the adjacent ME Promo at 38:30-39:00 in the same audit pass. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_herenow where start_offset_seconds = 3030), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music bed (50:30-51:30). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_herenow where start_offset_seconds = 3540), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music bed (59:00-59:55). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_herenow where start_offset_seconds = 3594), array['news', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'psa', 'legal_id', 'interview_feature', 'host_created', 'underwriting_credit', 'weather'], 'Silence (59:55-60:00). Carried inactive per the same precedent as Morning Edition''s own trailing Silence slot. Source: NPR Show Clock application, retrieved 2026-08-10.', false)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- All Things Considered
with slots_allthingsconsidered_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'All Things Considered' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_allthingsconsidered as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_allthingsconsidered_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_allthingsconsidered_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_allthingsconsidered where start_offset_seconds = 240), array['news', 'interview_feature', 'host_created'], 'Newscast 2 (4:00-5:40), optional cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsidered where start_offset_seconds = 360), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Theme (6:00-6:30). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsidered where start_offset_seconds = 1080), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music break (18:00-19:34); this window''s own Funding Credit sub-element at 19:34-20:00 stays protected. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsidered where start_offset_seconds = 1770), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music break (29:30-30:00). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsidered where start_offset_seconds = 1830), array['news', 'interview_feature', 'host_created'], 'Newscast 3 (30:30-32:30), optional headlines cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsidered where start_offset_seconds = 1950), array['news', 'interview_feature', 'host_created'], 'Newscast 4 (32:30-34:00), optional headlines cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsidered where start_offset_seconds = 2040), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Theme (34:00-35:00). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsidered where start_offset_seconds = 2880), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music break (48:00-50:00). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsidered where start_offset_seconds = 3540), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music break (59:00-59:55). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsidered where start_offset_seconds = 3595), array['news', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'psa', 'legal_id', 'interview_feature', 'host_created', 'underwriting_credit', 'weather'], 'Silence (59:55-60:00). Carried inactive per the same precedent as Morning Edition''s own trailing Silence slot. Source: NPR Show Clock application, retrieved 2026-08-10.', false)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- 1A
with slots_1a_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = '1A' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_1a as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_1a_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_1a_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_1a where start_offset_seconds = 360), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Opening music bed (6:00-6:30). Source: 1A Clock as of 2017.pdf (effective 2017-01-02) -- provisional, confirm against the current provider clock before treating as current.', true),
    ((select id from slots_1a where start_offset_seconds = 1110), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music bed after Segment A (18:30-19:00). Source: 1A Clock as of 2017.pdf (effective 2017-01-02) -- provisional.', true),
    ((select id from slots_1a where start_offset_seconds = 1890), array['membership_message', 'program_promo', 'host_created'], 'Segment B fundraising cutaway; not a routine local break -- clock marks it available only during coordinated fundraising periods or by request to 1A. Floating within its own earliest/latest window. Source: 1A Clock as of 2017.pdf (effective 2017-01-02) -- provisional.', true),
    ((select id from slots_1a where start_offset_seconds = 3060), array['membership_message', 'program_promo', 'host_created'], 'Segment C fundraising cutaway; not a routine local break -- clock marks it available only during coordinated fundraising periods or by request to 1A. Floating within its own earliest/latest window. Source: 1A Clock as of 2017.pdf (effective 2017-01-02) -- provisional.', true),
    ((select id from slots_1a where start_offset_seconds = 3540), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'End-of-hour live-feed music (59:00-59:55). Source: 1A Clock as of 2017.pdf (effective 2017-01-02) -- provisional.', true)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Fresh Air
with slots_freshair_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Fresh Air' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_freshair as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_freshair_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_freshair_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_freshair where start_offset_seconds = 360), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Opening music bed (6:00-6:30). Source: Fresh Air Clock as of 2015.pdf (effective 2015-02-02) -- provisional, confirm against the current provider clock before treating as current.', true),
    ((select id from slots_freshair where start_offset_seconds = 900), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break 1, music bed; floats between 15:00 and 22:00. Weekly rundown supplies the exact post. Source: Fresh Air Clock as of 2015.pdf (effective 2015-02-02) -- provisional.', true),
    ((select id from slots_freshair where start_offset_seconds = 2220), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break 2 and its adjacent funder, as one package; only the music-bed portion may be covered locally -- do not cover the national funder. Floats between 37:00 and 47:00. Source: Fresh Air Clock as of 2015.pdf (effective 2015-02-02) -- provisional.', true),
    ((select id from slots_freshair where start_offset_seconds = 2760), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break 3, music bed; floats between 46:00 and 54:59. Weekly rundown supplies the exact post. Source: Fresh Air Clock as of 2015.pdf (effective 2015-02-02) -- provisional.', true),
    ((select id from slots_freshair where start_offset_seconds = 3510), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'End music bed (58:30-59:00). Source: Fresh Air Clock as of 2015.pdf (effective 2015-02-02) -- provisional.', true)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Wait Wait... Don't Tell Me!
with slots_waitwaitdonttellme_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Wait Wait... Don''t Tell Me!' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_waitwaitdonttellme as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_waitwaitdonttellme_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_waitwaitdonttellme_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_waitwaitdonttellme where start_offset_seconds = 360), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Opening music bed (6:00-6:30). Source: Wait Wait...Don''t Tell Me! Clock as of 2014.pdf (effective 2014-11-17) -- provisional, confirm against the current provider clock before treating as current.', true)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- TED Radio Hour
with slots_tedradiohour_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'TED Radio Hour' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_tedradiohour as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_tedradiohour_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_tedradiohour_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_tedradiohour where start_offset_seconds = 360), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Opening music bed (6:00-6:30). Source: TED Radio Hour Clock as of 2014.pdf (effective 2014-11-17) -- provisional, confirm against the current provider clock before treating as current.', true),
    ((select id from slots_tedradiohour where start_offset_seconds = 1140), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music bed after Segment A (19:00-20:00); national funder follows at 20:00. Source: TED Radio Hour Clock as of 2014.pdf (effective 2014-11-17) -- provisional.', true),
    ((select id from slots_tedradiohour where start_offset_seconds = 2340), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music bed after Segment B (39:00-40:00); national funder follows at 40:00. Source: TED Radio Hour Clock as of 2014.pdf (effective 2014-11-17) -- provisional.', true)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Hidden Brain
with slots_hiddenbrain_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Hidden Brain' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_hiddenbrain as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_hiddenbrain_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_hiddenbrain_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_hiddenbrain where start_offset_seconds = 360), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Opening music bed (6:00-6:30). Source: Hidden Brain Clock as of 2017.pdf (effective 2017-10-06) -- provisional, confirm against the current provider clock before treating as current.', true),
    ((select id from slots_hiddenbrain where start_offset_seconds = 1080), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break between Segments A and B, plus its adjacent funder, as one package; only the music-bed portion may be covered locally -- do not cover the national funder. Rundown supplies the exact post within the package''s own earliest/latest window. Source: Hidden Brain Clock as of 2017.pdf (effective 2017-10-06) -- provisional.', true),
    ((select id from slots_hiddenbrain where start_offset_seconds = 2400), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break between Segments B and C, plus its adjacent funder, as one package; only the music-bed portion may be covered locally -- do not cover the national funder. Source: Hidden Brain Clock as of 2017.pdf (effective 2017-10-06) -- provisional.', true)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- World Cafe
with slots_worldcafe_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'World Cafe' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_worldcafe as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_worldcafe_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_worldcafe_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_worldcafe where start_offset_seconds = 60), array['news', 'interview_feature', 'host_created'], 'Newscast / optional music cutaway; station may insert a newscast here or leave the network music feed running. Source: World Cafe Clock as of 2014.pdf (effective 2014-11-17) -- provisional, confirm against the current provider clock before treating as current.', true),
    ((select id from slots_worldcafe where start_offset_seconds = 1200), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break 1; clock gives a nominal 20:00 placement with no printed allowable window -- use the rundown. Source: World Cafe Clock as of 2014.pdf (effective 2014-11-17) -- provisional.', true),
    ((select id from slots_worldcafe where start_offset_seconds = 2400), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Floating break 2; clock gives a nominal 40:00 placement with no printed allowable window -- use the rundown. Source: World Cafe Clock as of 2014.pdf (effective 2014-11-17) -- provisional.', true)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Weekend Edition Saturday
with slots_weekendeditionsaturday_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Weekend Edition Saturday' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_weekendeditionsaturday as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_weekendeditionsaturday_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_weekendeditionsaturday_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_weekendeditionsaturday where start_offset_seconds = 240), array['news', 'interview_feature', 'host_created'], 'Newscast 2 (4:00-5:40), optional cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsaturday where start_offset_seconds = 360), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Theme (6:00-6:30). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsaturday where start_offset_seconds = 1080), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music break (18:00-19:00). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsaturday where start_offset_seconds = 1140), array['news', 'interview_feature', 'host_created'], 'Headlines (19:00-20:00), optional cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsaturday where start_offset_seconds = 2370), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music break (39:30-40:00) -- corrected position; see 20260810160000_log_clock_seed_swap_corrections_3.sql, which fixed this slot''s label being swapped with the adjacent cross-promo at 39:00-39:30 in the same audit pass. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsaturday where start_offset_seconds = 2400), array['news', 'interview_feature', 'host_created'], 'Headlines (40:00-41:00), optional cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsaturday where start_offset_seconds = 3510), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music break (58:30-59:55) -- corrected position; see 20260810160000_log_clock_seed_swap_corrections_3.sql, which fixed this slot''s label being swapped with the adjacent Funder at 57:55-58:30 in the same audit pass. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsaturday where start_offset_seconds = 3595), array['news', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'psa', 'legal_id', 'interview_feature', 'host_created', 'underwriting_credit', 'weather'], 'Silence (59:55-60:00). Carried inactive per the same precedent as Morning Edition''s own trailing Silence slot. Source: NPR Show Clock application, retrieved 2026-08-10.', false)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- Weekend Edition Sunday
with slots_weekendeditionsunday_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'Weekend Edition Sunday' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_weekendeditionsunday as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_weekendeditionsunday_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_weekendeditionsunday_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_weekendeditionsunday where start_offset_seconds = 240), array['news', 'interview_feature', 'host_created'], 'Newscast 2 (4:00-5:40), optional cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsunday where start_offset_seconds = 360), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Theme (6:00-6:30). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsunday where start_offset_seconds = 1080), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music break (18:00-19:00). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsunday where start_offset_seconds = 1140), array['news', 'interview_feature', 'host_created'], 'Headlines (19:00-20:00), optional cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsunday where start_offset_seconds = 2370), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music break (39:30-40:00) -- corrected position; see 20260810160000_log_clock_seed_swap_corrections_3.sql, which fixed this slot''s label being swapped with the adjacent cross-promo at 39:00-39:30 in the same audit pass. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsunday where start_offset_seconds = 2400), array['news', 'interview_feature', 'host_created'], 'Headlines (40:00-41:00), optional cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsunday where start_offset_seconds = 3510), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music break (58:30-59:55) -- corrected position; see 20260810160000_log_clock_seed_swap_corrections_3.sql, which fixed this slot''s label being swapped with the adjacent Funder at 57:55-58:30 in the same audit pass. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_weekendeditionsunday where start_offset_seconds = 3595), array['news', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'psa', 'legal_id', 'interview_feature', 'host_created', 'underwriting_credit', 'weather'], 'Silence (59:55-60:00). Carried inactive per the same precedent as Morning Edition''s own trailing Silence slot. Source: NPR Show Clock application, retrieved 2026-08-10.', false)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;

-- All Things Considered (Weekends)
with slots_allthingsconsideredweeke_version as (
  select cv.id from public.log_clock_versions cv
  join public.log_clock_templates ct on ct.id = cv.clock_template_id
  where ct.name = 'All Things Considered (Weekends)' and cv.effective_to is null
  order by cv.effective_from desc limit 1
), slots_allthingsconsideredweeke as (
  select id, start_offset_seconds from public.log_clock_slots where clock_version_id = (select id from slots_allthingsconsideredweeke_version)
)
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types, notes, active)
select (select id from slots_allthingsconsideredweeke_version), seed.slot_id, 'optional'::public.log_opportunity_requirement, seed.permitted_content_types, seed.notes, seed.active
from (
  values
    ((select id from slots_allthingsconsideredweeke where start_offset_seconds = 240), array['news', 'interview_feature', 'host_created'], 'Newscast 2 (4:00-5:40), optional cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsideredweeke where start_offset_seconds = 360), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Theme (6:00-6:30). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsideredweeke where start_offset_seconds = 1080), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music break (18:00-19:00). Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsideredweeke where start_offset_seconds = 1140), array['news', 'interview_feature', 'host_created'], 'Headlines (19:00-20:00), optional cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsideredweeke where start_offset_seconds = 2370), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music break (39:30-40:00) -- corrected position; see 20260810160000_log_clock_seed_swap_corrections_3.sql, which fixed this slot''s label being swapped with the adjacent cross-promo at 39:00-39:30 in the same audit pass. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsideredweeke where start_offset_seconds = 2400), array['news', 'interview_feature', 'host_created'], 'Headlines (40:00-41:00), optional cutaway. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsideredweeke where start_offset_seconds = 3510), array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit'], 'Music break (58:30-59:55) -- corrected position; see 20260810160000_log_clock_seed_swap_corrections_3.sql, which fixed this slot''s label being swapped with the adjacent Funder at 57:55-58:30 in the same audit pass. Source: NPR Show Clock application, retrieved 2026-08-10.', true),
    ((select id from slots_allthingsconsideredweeke where start_offset_seconds = 3595), array['news', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'psa', 'legal_id', 'interview_feature', 'host_created', 'underwriting_credit', 'weather'], 'Silence (59:55-60:00). Carried inactive per the same precedent as Morning Edition''s own trailing Silence slot. Source: NPR Show Clock application, retrieved 2026-08-10.', false)
) as seed(slot_id, permitted_content_types, notes, active)
where seed.slot_id is not null
on conflict (slot_id) do nothing;
