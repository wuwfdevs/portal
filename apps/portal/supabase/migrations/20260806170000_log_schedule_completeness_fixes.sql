-- Log: three schedule-completeness fixes to the seed from
-- 20260806150000_log_seed_npr_clocks.sql, all caught by the station
-- reviewing what actually landed.
--
--   1. Morning Edition's clock was entirely missing. It was fully
--      transcribed and reasoned through while building the original seed,
--      but never made it into that migration's generation script — a
--      transcription-to-SQL slip, not a gap in the source material. Added
--      here in full (23 slots), plus its program row and its Mon-Fri
--      5:00-9:00am schedule entry.
--   2. 1A and Fresh Air both already had a clock template, version, slots,
--      and a program row from the original seed — but no log_schedule row,
--      so neither ever appeared on the Today screen or the Programs
--      schedule list despite having real clock data. Added their missing
--      schedule entries here (both Mon-Fri, matching the corrected weekly
--      schedule).
--   3. Every other program on the station's corrected weekly schedule that
--      does NOT yet have a detailed network clock (BBC World, Marketplace,
--      Echoes, the various jazz/classical/syndicated shows, etc.) is added
--      as a real log_programs + log_schedule row now, so the schedule is
--      complete, rather than waiting for a clock PDF per program before it
--      shows up anywhere. Each points at ONE shared placeholder clock
--      template ("Unspecified (awaiting network clock)") with a single
--      full-hour "Program Content" slot — explicitly not a claim about that
--      program's actual internal structure, just a placeholder to satisfy
--      log_schedule.clock_template_id's not-null FK until a real clock is
--      provided. Swapping a program onto its own real clock template later
--      is a normal log_schedule update (that table, unlike log_clock_versions/
--      log_clock_slots, is not insert-only) — no migration required.

-- Morning Edition's clock template ------------------------------------------
insert into public.log_clock_templates (id, name) values ('c7a64faf-d1c0-504e-b7e5-6c736bb20e8e', 'Morning Edition');
insert into public.log_clock_versions (id, clock_template_id, variant, effective_from) values ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 'c7a64faf-d1c0-504e-b7e5-6c736bb20e8e', 'program_specific', '2019-10-21');
insert into public.log_clock_slots (
  clock_version_id, position, start_offset_seconds, duration_seconds,
  permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable,
  allow_empty, allow_multiple, timing_mode, lock_on_air, label,
  earliest_start_offset_seconds, latest_start_offset_seconds, segment_label
) values
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 1, 0, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Billboard', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 2, 60, 180, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 1', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 3, 240, 100, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 2', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 4, 340, 89, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'FA Promo', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 5, 429, 711, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment A', null, null, 'A'),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 6, 1140, 90, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 7, 1230, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'ATC Promo', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 8, 1260, 50, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 9, 1310, 430, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment B', null, null, 'B'),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 10, 1740, 30, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 11, 1770, 90, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 3', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 12, 1860, 120, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Newscast 4', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 13, 1980, 60, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 14, 2040, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Funding Credit', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 15, 2075, 475, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment C', null, null, 'C'),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 16, 2550, 90, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 17, 2640, 14, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'H&N Promo', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 18, 2654, 14, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'NPR Promo', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 19, 2668, 31, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 20, 2699, 35, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Return', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 21, 2734, 240, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment D', null, null, 'D'),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 22, 2974, 115, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Music Bed', null, null, null),
  ('a9d5b1e6-69cc-5e94-a4be-5466f6a1863a', 23, 3089, 450, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Segment E', null, null, 'E');
insert into public.log_programs (id, name, kind) values ('15bd1db3-012c-5b52-b82b-84ecd3694649', 'Morning Edition', 'recurring');

-- Schedule entries missing for programs whose clock/program rows already existed --
insert into public.log_schedule (program_id, clock_template_id, entry_type, days_of_week, start_date, effective_from, air_time, duration_minutes, notes) values
  ('15bd1db3-012c-5b52-b82b-84ecd3694649', 'c7a64faf-d1c0-504e-b7e5-6c736bb20e8e', 'recurring', array[1,2,3,4,5]::integer[], '2026-08-03', '2026-08-03', '05:00', 240, null),
  ('da284752-6240-5232-adbc-68783aa2d0f9', 'bbe2055d-14c9-5277-a806-fb5ba14f76a1', 'recurring', array[1,2,3,4,5]::integer[], '2026-08-03', '2026-08-03', '09:00', 120, null),
  ('0aa96623-1722-5d1d-8f4f-8dc582c15b5f', 'adfccceb-1748-575a-8034-7e3aa4428cd4', 'recurring', array[1,2,3,4,5]::integer[], '2026-08-03', '2026-08-03', '11:00', 60, null);

-- One shared placeholder clock template, used by every program below until
-- its real NPR/network clock is provided. Each is a single 'Program Content'
-- slot for the full hour -- not a claim about the program's actual structure.
insert into public.log_clock_templates (id, name, description) values ('3806fe6d-0f22-5510-8d0c-094c491be8dd', 'Unspecified (awaiting network clock)', 'Shared placeholder for any program whose real clock has not been provided yet. One slot, the full hour, fill_mode=required/assignment_mode=automatic -- not a claim about actual internal structure. Replace by creating a new version on this program''s own template once real clock detail exists.');
insert into public.log_clock_versions (id, clock_template_id, variant, effective_from) values ('8ef08d8c-28e5-5041-a705-764aa22fedce', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'program_specific', '2026-08-03');
insert into public.log_clock_slots (
  clock_version_id, position, start_offset_seconds, duration_seconds,
  permitted_content_types, fill_mode, assignment_mode, replaceable, shortenable,
  allow_empty, allow_multiple, timing_mode, lock_on_air, label,
  earliest_start_offset_seconds, latest_start_offset_seconds, segment_label
) values
  ('8ef08d8c-28e5-5041-a705-764aa22fedce', 1, 0, 3540, '{}'::text[], 'required', 'automatic', false, false, false, false, 'fixed', true, 'Program Content (clock detail not yet provided)', null, null, null);

-- Programs -------------------------------------------------------------------
insert into public.log_programs (id, name, kind) values
  ('889023f7-33f7-5bdb-b6ad-a1ec04a7026c', 'BBC World', 'recurring'),
  ('34f99db0-21b4-57a6-a47a-c40ae692e775', 'On the Media', 'recurring'),
  ('7145de69-283d-53cb-ad12-42600327472a', 'Marketplace', 'recurring'),
  ('dbb76ca7-6791-57a6-a5cc-7e3d90afa740', 'The World', 'recurring'),
  ('e1996943-03fc-505b-94de-9461592695a1', 'Jazz Happening Now', 'recurring'),
  ('1b292bed-c409-5aeb-b3b3-92f13f8cbd7f', 'Jazz Night in America', 'recurring'),
  ('b33eac8f-ba77-5da1-900d-802cc6e237c3', 'Jazz with Dale Riegle', 'recurring'),
  ('642da855-210b-5ebc-b101-53befb626df5', 'Echoes', 'recurring'),
  ('2ebfb797-94ee-5a63-b18d-94350934242a', 'This American Life', 'recurring'),
  ('570fce35-dd49-5479-8fe9-1c81754f2a12', 'Living on Earth', 'recurring'),
  ('de10cac0-98ee-5973-a9d4-84c964e74bda', 'Florida Frontiers', 'recurring'),
  ('fa5813ec-0f9e-5775-8f3b-44e04d3dd532', 'RadioLive', 'recurring'),
  ('be079030-0d2a-561b-8c2d-8f392ea38f3c', 'RadioLive Encores', 'recurring'),
  ('ddf4aa23-1385-5537-85b8-07323387695b', 'Science Friday', 'recurring'),
  ('e9b557f6-f4c8-5325-a2d7-85f944ba5b35', 'Capital Report', 'recurring'),
  ('77fdc701-33ed-5920-98bd-fdf9e37dbdcc', 'The Florida Roundup', 'recurring'),
  ('532972bc-0da4-5055-8b8d-7ae99809269f', 'Putumayo World Music Hour', 'recurring'),
  ('ccf8896a-6a86-5239-95ba-4d2bc5367aa8', '14/59', 'recurring'),
  ('304606d8-efce-5cdd-a3c8-f4b72b715bd5', 'Jazz After Hours', 'recurring'),
  ('15861f7c-c112-5057-9c74-dbf70bf8ce06', 'Travel with Rick Steves', 'recurring'),
  ('7ece6af3-b42e-58ef-963a-a5ba9b5f867c', 'Mountain Stage', 'recurring'),
  ('6c7a5576-768a-5640-b817-989fa76919d0', 'Five Corners', 'recurring'),
  ('54eb7186-ea04-5b2e-ad5c-fa3ff5a94423', 'Big Bands & Jazz', 'recurring'),
  ('3b7c4457-f86d-5348-9f52-71089773790c', 'American Routes', 'recurring'),
  ('d86ec720-bcf4-537d-a7fd-6a1a2faafd33', 'Open to Debate', 'recurring'),
  ('6ad5b19b-7cee-5326-a2b9-fea3cb077190', 'eTown', 'recurring'),
  ('43d5c93b-ac52-5e4e-a32c-b2d6512cb40c', 'Acoustic Interlude', 'recurring'),
  ('1935d8c3-cb04-5c70-b515-cfaa2363eb97', 'Selected Shorts', 'recurring'),
  ('279491b9-cf4c-59e5-bef2-e888b2c04c70', 'Le Show', 'recurring'),
  ('9f180ede-f94b-52f6-8b49-acd4efc3e778', 'Musical Gumbo', 'recurring'),
  ('f28e05ac-3763-5a78-bbdc-a08b6eb19daf', 'Hearts of Space', 'recurring'),
  ('ff19a494-063d-5d7c-bf12-90098ac0923a', 'CLOUDS with Dale Riegle', 'recurring');

-- Schedule ---------------------------------------------------------------------
insert into public.log_schedule (program_id, clock_template_id, entry_type, days_of_week, start_date, effective_from, air_time, duration_minutes, notes) values
  ('889023f7-33f7-5bdb-b6ad-a1ec04a7026c', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[1,2,3,4,5,6]::integer[], '2026-08-03', '2026-08-03', '00:00', 300, null),
  ('34f99db0-21b4-57a6-a47a-c40ae692e775', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[1]::integer[], '2026-08-03', '2026-08-03', '12:00', 60, null),
  ('34f99db0-21b4-57a6-a47a-c40ae692e775', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[6]::integer[], '2026-08-03', '2026-08-03', '15:00', 60, null),
  ('7145de69-283d-53cb-ad12-42600327472a', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[1,2,3,4,5]::integer[], '2026-08-03', '2026-08-03', '17:00', 30, null),
  ('dbb76ca7-6791-57a6-a5cc-7e3d90afa740', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[1,2,3]::integer[], '2026-08-03', '2026-08-03', '18:00', 60, null),
  ('e1996943-03fc-505b-94de-9461592695a1', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[1]::integer[], '2026-08-03', '2026-08-03', '21:00', 60, null),
  ('1b292bed-c409-5aeb-b3b3-92f13f8cbd7f', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[2]::integer[], '2026-08-03', '2026-08-03', '21:00', 60, null),
  ('b33eac8f-ba77-5da1-900d-802cc6e237c3', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[3,4]::integer[], '2026-08-03', '2026-08-03', '21:00', 60, null),
  ('642da855-210b-5ebc-b101-53befb626df5', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[1,2,3,4,5]::integer[], '2026-08-03', '2026-08-03', '22:00', 120, null),
  ('2ebfb797-94ee-5a63-b18d-94350934242a', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[3,6]::integer[], '2026-08-03', '2026-08-03', '12:00', 60, null),
  ('570fce35-dd49-5479-8fe9-1c81754f2a12', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[4]::integer[], '2026-08-03', '2026-08-03', '12:00', 60, null),
  ('570fce35-dd49-5479-8fe9-1c81754f2a12', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[0]::integer[], '2026-08-03', '2026-08-03', '06:00', 60, null),
  ('de10cac0-98ee-5973-a9d4-84c964e74bda', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[4]::integer[], '2026-08-03', '2026-08-03', '17:30', 30, null),
  ('fa5813ec-0f9e-5775-8f3b-44e04d3dd532', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[4]::integer[], '2026-08-03', '2026-08-03', '18:00', 90, null),
  ('be079030-0d2a-561b-8c2d-8f392ea38f3c', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[4]::integer[], '2026-08-03', '2026-08-03', '19:30', 30, null),
  ('ddf4aa23-1385-5537-85b8-07323387695b', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[5]::integer[], '2026-08-03', '2026-08-03', '13:00', 120, null),
  ('ddf4aa23-1385-5537-85b8-07323387695b', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[6]::integer[], '2026-08-03', '2026-08-03', '05:00', 120, null),
  ('e9b557f6-f4c8-5325-a2d7-85f944ba5b35', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[5]::integer[], '2026-08-03', '2026-08-03', '17:30', 30, null),
  ('77fdc701-33ed-5920-98bd-fdf9e37dbdcc', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[5]::integer[], '2026-08-03', '2026-08-03', '18:00', 60, null),
  ('532972bc-0da4-5055-8b8d-7ae99809269f', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[5]::integer[], '2026-08-03', '2026-08-03', '19:00', 60, null),
  ('ccf8896a-6a86-5239-95ba-4d2bc5367aa8', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[5]::integer[], '2026-08-03', '2026-08-03', '20:00', 60, null),
  ('304606d8-efce-5cdd-a3c8-f4b72b715bd5', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[5]::integer[], '2026-08-03', '2026-08-03', '21:00', 60, null),
  ('304606d8-efce-5cdd-a3c8-f4b72b715bd5', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[0]::integer[], '2026-08-03', '2026-08-03', '00:00', 360, null),
  ('15861f7c-c112-5057-9c74-dbf70bf8ce06', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[6]::integer[], '2026-08-03', '2026-08-03', '11:00', 60, null),
  ('7ece6af3-b42e-58ef-963a-a5ba9b5f867c', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[6]::integer[], '2026-08-03', '2026-08-03', '17:00', 120, null),
  ('6c7a5576-768a-5640-b817-989fa76919d0', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[6]::integer[], '2026-08-03', '2026-08-03', '19:00', 60, null),
  ('54eb7186-ea04-5b2e-ad5c-fa3ff5a94423', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[0,6]::integer[], '2026-08-03', '2026-08-03', '20:00', 120, null),
  ('3b7c4457-f86d-5348-9f52-71089773790c', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[6]::integer[], '2026-08-03', '2026-08-03', '22:00', 120, null),
  ('d86ec720-bcf4-537d-a7fd-6a1a2faafd33', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[0]::integer[], '2026-08-03', '2026-08-03', '10:00', 60, null),
  ('6ad5b19b-7cee-5326-a2b9-fea3cb077190', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[0]::integer[], '2026-08-03', '2026-08-03', '11:00', 60, null),
  ('43d5c93b-ac52-5e4e-a32c-b2d6512cb40c', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[0]::integer[], '2026-08-03', '2026-08-03', '12:00', 240, null),
  ('1935d8c3-cb04-5c70-b515-cfaa2363eb97', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[0]::integer[], '2026-08-03', '2026-08-03', '17:00', 60, null),
  ('279491b9-cf4c-59e5-bef2-e888b2c04c70', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[0]::integer[], '2026-08-03', '2026-08-03', '18:00', 60, null),
  ('9f180ede-f94b-52f6-8b49-acd4efc3e778', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[0]::integer[], '2026-08-03', '2026-08-03', '19:00', 60, null),
  ('f28e05ac-3763-5a78-bbdc-a08b6eb19daf', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[0]::integer[], '2026-08-03', '2026-08-03', '22:00', 60, null),
  ('ff19a494-063d-5d7c-bf12-90098ac0923a', '3806fe6d-0f22-5510-8d0c-094c491be8dd', 'recurring', array[0]::integer[], '2026-08-03', '2026-08-03', '23:00', 60, null);
