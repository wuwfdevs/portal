-- The weather widget on the rundown screen should lead with the current
-- temperature and conditions (requested directly), but log_weather_reading
-- only ever stored forecast-period fields — NWS's /forecast endpoint gives
-- the day period's high and the night period's low, never an observed
-- "right now." These two columns hold the latest station observation
-- (api.weather.gov's /stations/{id}/observations/latest), fetched
-- best-effort by providers/weather.ts alongside the forecast: nullable
-- because the observations endpoint failing — or a reading predating this
-- column — must never block a usable forecast reading, the same posture
-- the hazards fetch already takes.

alter table public.log_weather_reading
  add column current_temp integer,
  add column current_conditions text;

comment on column public.log_weather_reading.current_temp is
  'Latest observed temperature (°F) from the nearest NWS observation station at fetch time — best-effort, null when the observation was unavailable.';
comment on column public.log_weather_reading.current_conditions is
  'Latest observed conditions text ("Partly Cloudy") from the same observation — best-effort, null when unavailable.';
