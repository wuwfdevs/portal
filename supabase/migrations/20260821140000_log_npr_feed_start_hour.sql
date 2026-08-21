-- Adds the NPR feed's Eastern-time start hour to log_programs, so
-- lib/log/npr-story-times.ts can map WUWF's shift hours onto the episode's
-- own hours correctly.
--
-- NPR's multi-hour magazines alternate their episode hours on the live
-- network feed, anchored Eastern: the official Rundowns App document for
-- Morning Edition 2026-08-21 (supplied by WUWF) labels the 7:00 AM ET hour
-- "HR1" and 8:00 AM ET "HR2" — for a 5:00 AM ET feed start, odd ET hours
-- carry episode hour 1. A Central station joining at 5:00 AM CT (6:00 AM
-- ET) therefore starts on HR2, not HR1; without this anchor the derived
-- story times assigned every hour the wrong half of the episode.
--
-- Nullable: null means no confirmed anchor, and the estimation falls back
-- to assuming the shift starts on episode hour 1. Backfilled only for
-- Morning Edition, the one program whose anchor the Rundowns document
-- confirms — inventing anchors for the other programs without evidence is
-- exactly the mistake the clock-seed correction history warns about.

alter table public.log_programs
  add column npr_feed_start_hour_et smallint,
  add constraint log_programs_npr_feed_start_hour_check
    check (npr_feed_start_hour_et is null or (npr_feed_start_hour_et >= 0 and npr_feed_start_hour_et <= 23));

comment on column public.log_programs.npr_feed_start_hour_et is
  'The hour (0-23, Eastern time) at which NPR''s live network feed starts this program''s first episode hour — the anchor for mapping a WUWF shift hour onto the episode''s alternating hours (lib/log/npr-story-times.ts''s episodeHourOffset). Null = unconfirmed; estimation then assumes the shift starts on episode hour 1.';

update public.log_programs
  set npr_feed_start_hour_et = 5
  where name = 'Morning Edition';
