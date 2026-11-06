-- Where the station is, for the weather on air.
--
-- The weather reading and the weather alerts were pinned to WUWF in the code: the studio's coordinates
-- (30.5433, -87.2169), the forecast area ("Pensacola, FL"), the four counties whose alerts matter
-- (Escambia, Santa Rosa, Okaloosa and Mobile, by their SAME codes) and the two states the regional alert
-- query asked NWS about (FL and AL). For any other station that is not a missing label, it is the wrong
-- place's forecast read on the air. They are the station's settings now.
--
--   latitude, longitude   the studio, in decimal degrees; both or neither
--   alert_counties        the counties whose NWS alerts the station relays, one per line as
--                         "County name:SAME code" (six digits: 0, two-digit state, three-digit county),
--                         in the order they should be listed. The regional query's states come from the
--                         codes, so there is no second list to keep in step.
--
-- A station that has set neither gets no weather reading and no regional alerts, with a message saying so,
-- not a neighbour's. Staff-only (station_public_profile does not return them).

alter table public.station_settings
  add column latitude numeric(8, 5) check (latitude between -90 and 90),
  add column longitude numeric(8, 5) check (longitude between -180 and 180),
  add column alert_counties text check (
    char_length(alert_counties) <= 1000
    and alert_counties ~ '^[^:\n]+:[0-9]{6}(\n[^:\n]+:[0-9]{6})*$'
  ),
  add constraint station_settings_location_pair check ((latitude is null) = (longitude is null));
