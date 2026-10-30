-- Corrects the All Things Considered (weekday) clock's A-to-B junction,
-- from WUWF's direct account after the official ATC Rundowns document
-- (2026-08-21) exposed Segment B starting 35 seconds early in this seed:
--
--   Music Bed        18:00–20:00  (was 18:00–19:34, 94s → 120s)
--   Funding Credit   20:00–20:35  (was 19:34–20:00, 26s → 35s)
--   Segment B        20:35–28:59  (was 20:00–28:24; duration 504s unchanged,
--                                  matching the rundown's own "08:24")
--
-- Knock-on: the furniture between Segment B's end and the Return (which
-- the rundown pins at exactly 30:00) previously occupied 28:24–30:00 (96s:
-- Music Bed 36s, Promo 30s, Music Bed 30s) and now has only 61 seconds of
-- room. The Promo keeps its 30 seconds (promos are fixed-length cuts); the
-- two music beds are squeezed to 16s and 15s. That split is an
-- APPROXIMATION pending a re-check of the ATC clock PDF — same caveat as
-- 20260806150000's documented junction approximations — but the segment
-- boundaries themselves (the part story timing and rundown breaks key off)
-- are now exact per the official rundown.
--
-- log_clock_slots is insert-only through the application; correcting a
-- migration's own seeding mistake in a migration follows the established
-- clock-seed-corrections precedent (see 20260806180000's header). Updates
-- rather than delete-and-reinsert since only offsets/durations change and
-- ATC has no local opportunities referencing these slots.

update public.log_clock_slots s
set duration_seconds = 120
from public.log_clock_versions v
join public.log_clock_templates t on t.id = v.clock_template_id
where s.clock_version_id = v.id
  and t.name = 'All Things Considered'
  and s.label = 'Music Bed'
  and s.start_offset_seconds = 1080;

update public.log_clock_slots s
set start_offset_seconds = 1235
from public.log_clock_versions v
join public.log_clock_templates t on t.id = v.clock_template_id
where s.clock_version_id = v.id
  and t.name = 'All Things Considered'
  and s.label = 'Segment B'
  and s.start_offset_seconds = 1200;

update public.log_clock_slots s
set start_offset_seconds = 1200, duration_seconds = 35
from public.log_clock_versions v
join public.log_clock_templates t on t.id = v.clock_template_id
where s.clock_version_id = v.id
  and t.name = 'All Things Considered'
  and s.label = 'Funding Credit'
  and s.start_offset_seconds = 1174;

update public.log_clock_slots s
set start_offset_seconds = 1739, duration_seconds = 16
from public.log_clock_versions v
join public.log_clock_templates t on t.id = v.clock_template_id
where s.clock_version_id = v.id
  and t.name = 'All Things Considered'
  and s.label = 'Music Bed'
  and s.start_offset_seconds = 1704;

update public.log_clock_slots s
set start_offset_seconds = 1755
from public.log_clock_versions v
join public.log_clock_templates t on t.id = v.clock_template_id
where s.clock_version_id = v.id
  and t.name = 'All Things Considered'
  and s.label like 'Promo%'
  and s.start_offset_seconds = 1740;

update public.log_clock_slots s
set start_offset_seconds = 1785, duration_seconds = 15
from public.log_clock_versions v
join public.log_clock_templates t on t.id = v.clock_template_id
where s.clock_version_id = v.id
  and t.name = 'All Things Considered'
  and s.label = 'Music Bed'
  and s.start_offset_seconds = 1770;
