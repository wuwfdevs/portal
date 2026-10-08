-- Structured weather alerts on the current weather reading.
--
-- log_weather_reading.hazards has been a flat string of NWS headlines joined
-- with "; ", in NWS's own order, with no severity: a Hurricane Warning sat in
-- the middle of rip-current statements and read as one run-on line. The alerts
-- panel under the forecast strip (CLAUDE.md, Log) needs each alert's tier,
-- timing and text, and needs to tell "no alerts" from "couldn't check".
--
--   * alerts: the ranked active alerts as jsonb (lib/log/weather-alerts.ts's
--     WeatherAlert shape). hazards stays, now a plain list of event names, for
--     readings and surfaces that still read the string.
--   * alerts_checked_at: the last SUCCESSFUL check; null if none ever succeeded.
--   * alerts_attempted_at: the last attempt of any outcome — the alerts' own
--     5-minute staleness clock keys on this, so a failing check retries on
--     schedule rather than on every page render.
--   * alerts_check_failed: the latest attempt errored; the stored alerts are
--     then the last good ones, shown labelled with alerts_checked_at.
--
-- Additive; existing rows read as an empty, never-checked list, which the
-- panel treats as "unknown" until the next refresh. No policy change:
-- log_weather_reading's existing select/insert/update policies cover it.

alter table public.log_weather_reading
  add column alerts jsonb not null default '[]'::jsonb,
  add column alerts_checked_at timestamptz,
  add column alerts_attempted_at timestamptz,
  add column alerts_check_failed boolean not null default false;

comment on column public.log_weather_reading.alerts is
  'Ranked active NWS alerts (lib/log/weather-alerts.ts WeatherAlert[]). On a failed check these are the last good ones.';
comment on column public.log_weather_reading.alerts_checked_at is
  'Last successful alerts check; null if none has ever succeeded.';
comment on column public.log_weather_reading.alerts_attempted_at is
  'Last alerts check attempt, whatever its outcome; the alerts staleness clock.';
comment on column public.log_weather_reading.alerts_check_failed is
  'True when the most recent alerts check errored.';
