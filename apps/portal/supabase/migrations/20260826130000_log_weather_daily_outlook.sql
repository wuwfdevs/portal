-- The rundown sidebar and a weather item's card only ever showed today's
-- forecast, even though NWS's /forecast endpoint (already fetched by
-- providers/weather.ts for today's high/low) returns several days of
-- day/night periods that were simply discarded past the first pair.
-- Requested directly: a "several days at a glance" view, rendered as
-- compact icon + hi/lo chips rather than another block of paragraph text.
--
-- daily_outlook holds that condensed multi-day summary, built by
-- lib/log/weather-outlook.ts's buildDailyOutlook() from the same fetch that
-- already produces every other column on this row — no second NWS request.
-- One jsonb array, not a child table: this is derived, display-only
-- summary data replaced wholesale on every refresh alongside the rest of
-- the row, never queried or filtered on its own the way a real table's rows
-- would be.

alter table public.log_weather_reading
  add column daily_outlook jsonb not null default '[]'::jsonb;

comment on column public.log_weather_reading.daily_outlook is
  'Condensed multi-day forecast (date/day_label/high/low/short_forecast/precipitation_chance/icon per day), built by lib/log/weather-outlook.ts from the same NWS /forecast periods already fetched for the current-day fields — not a second request.';
