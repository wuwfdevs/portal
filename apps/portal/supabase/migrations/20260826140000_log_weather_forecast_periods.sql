-- Requested directly: more visual distinction between "Today" and "Tonight"
-- in the live-read summary wherever it's shown (the weather page, the
-- rundown sidebar's Full forecast disclosure, a weather item's card). The
-- 20260824... fix labeled the two halves inline ("Today: ... Tonight: ..."),
-- but as one flat string there was no way for the UI to style each half
-- differently.
--
-- forecast_periods holds those same two halves as separate {label, text}
-- entries so the UI can set them apart (a bold label, its own block).
-- live_read_text is untouched and still the single flat string it always
-- was — the "Edit for this airing" override form prefills its textarea from
-- it and needs a plain string, not structured data, for that.

alter table public.log_weather_reading
  add column forecast_periods jsonb not null default '[]'::jsonb;

comment on column public.log_weather_reading.forecast_periods is
  'The live-read text''s own day/night halves, kept separate as [{label, text}, ...] (see lib/log/weather-outlook.ts''s ForecastPeriodSummary) so the UI can render Today and Tonight visually apart instead of one run-on string. live_read_text remains the flat concatenation of the same two halves, used to prefill the per-airing override textarea.';
