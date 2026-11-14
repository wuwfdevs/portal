-- Two values that were environment variables and are station settings: the public website's address (where a table's link, a facilitator's
-- after-page link and an organizer's link point) and the one shared mailbox that gets Audience Listening's reminders. An administrator
-- sets both at Administration > Station; the environment variables WEBSITE_ORIGIN and AUDIENCE_LISTENING_NOTIFY_EMAIL are still read
-- when the setting is empty, so a deployment that has them keeps working.
--
-- The staff sign-in handoff to the website keeps reading WEBSITE_ORIGIN from the environment and not this column: it sends a signed
-- identity token to that address, and who may change where that goes should stay a deploy-time decision.
--
-- station_settings already has table-level grants (select, update to authenticated) and an administrator-only update policy, so the new
-- columns need neither.

alter table public.station_settings
  add column website_origin text,
  add column listening_notify_email text,
  add constraint station_settings_website_origin_check
    check (website_origin is null or (
      char_length(website_origin) <= 200
      and (website_origin ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'
           or website_origin ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$')
    )),
  add constraint station_settings_listening_notify_email_check
    check (listening_notify_email is null or (
      char_length(listening_notify_email) <= 320
      and listening_notify_email ~ '^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$'
    ));

comment on column public.station_settings.website_origin is
  'The public website''s origin (https, host and optional port, no path), used for the links Audience Listening emails and prints. Empty: the WEBSITE_ORIGIN environment variable.';
comment on column public.station_settings.listening_notify_email is
  'One shared mailbox (not a person) for Audience Listening''s host-request notice, weekly purge reminder and daily digest. Empty: the AUDIENCE_LISTENING_NOTIFY_EMAIL environment variable.';
