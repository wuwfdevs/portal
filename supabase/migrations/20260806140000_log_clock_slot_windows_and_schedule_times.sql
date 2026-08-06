-- Log: two schema gaps surfaced while transcribing real NPR network clocks
-- (Hidden Brain, Fresh Air, Fresh Air Weekend, World Cafe, 1A) and WUWF's
-- actual weekly schedule for seeding — see the migration right after this one.
-- Both tables are still empty in both environments, so this is a clean
-- additive change with no backfill.
--
--   1. A "floating break" is a real, current feature of five of the clocks
--      being seeded, not a hypothetical one: Hidden Brain's own clock states
--      "Break between Segments A & B starts between 17:00 – 30:00" outright,
--      and Fresh Air/Fresh Air Weekend/World Cafe/1A all have the same
--      shape (a local avail whose exact position within a window is the
--      station's call, not the network's). log_clock_slots.start_offset_seconds
--      is a single value — it cannot express a range. earliest_/
--      latest_start_offset_seconds add that range, populated only for
--      timing_mode = 'float' (start_offset_seconds keeps holding the nominal/
--      diagram-shown position for fixed slots and for float slots alike, so a
--      float slot still renders somewhere sensible before a producer decides
--      exactly where its rundown item lands).
--      segment_label rides along for the same reason ep_pitches keeps
--      free-text provenance fields: every one of these clocks is published by
--      NPR with its own lettered segments (A/B/C/...), and a producer
--      comparing the seeded data against the original PDF benefits from the
--      same letters, not a renumbering.
--   2. log_schedule had no notion of *when in the day* a program airs or for
--      how long — an oversight in the original design doc, not something
--      deferred on purpose (see docs/log-design.md §5, which lists
--      start_date/end_date/days_of_week but nothing else). That's fine for
--      "is this program scheduled on this date" but not enough to generate a
--      rundown, which needs to know what time to start tiling the clock
--      template's hour(s) across. air_time + duration_minutes close that gap.

alter table public.log_clock_slots
  add column earliest_start_offset_seconds integer,
  add column latest_start_offset_seconds integer,
  add column segment_label text;

alter table public.log_clock_slots add constraint log_clock_slots_float_window_check check (
  (timing_mode = 'float' and earliest_start_offset_seconds is not null
    and latest_start_offset_seconds is not null
    and latest_start_offset_seconds >= earliest_start_offset_seconds)
  or
  (timing_mode = 'fixed' and earliest_start_offset_seconds is null
    and latest_start_offset_seconds is null)
);

comment on column public.log_clock_slots.earliest_start_offset_seconds is
  'Earliest permitted start, in seconds from the top of the clock. Set only when timing_mode = ''float'' — the window a floating local break may land in, per the network clock (e.g. Hidden Brain: "starts between 17:00 & 30:00").';
comment on column public.log_clock_slots.latest_start_offset_seconds is
  'Latest permitted start, in seconds from the top of the clock. Set only when timing_mode = ''float''.';
comment on column public.log_clock_slots.segment_label is
  'The network clock''s own segment letter (A, B, C, ...) this slot falls within, for cross-referencing the original NPR clock diagram. Purely descriptive — nothing in the schema enforces or interprets it.';

-- No rows exist yet in either environment, so both new columns can go
-- straight to not null with no backfill step.
alter table public.log_schedule
  add column air_time time not null,
  add column duration_minutes integer not null;

alter table public.log_schedule add constraint log_schedule_duration_check
  check (duration_minutes > 0);

comment on column public.log_schedule.air_time is
  'Time of day this schedule entry''s air block starts (station-local time). Combined with duration_minutes, this is what rundown generation tiles the clock template''s hour(s) across.';
comment on column public.log_schedule.duration_minutes is
  'Total length of this program''s air block, in minutes — may span multiple hours (e.g. Morning Edition''s 240-minute weekday block), each repeating the same clock template.';
