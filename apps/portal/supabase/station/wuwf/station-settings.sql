-- WUWF's own station settings: who the station is, as the screens and the AI prompts say it.
--
-- This is station data, not schema, so it is not a migration and a fresh install of the Portal does not
-- run it (a new station fills these in at /admin/station, or with its own script). WUWF applies it by hand
-- to the preview and production projects and records the dates in supabase/migrations/APPLIED.md, under
-- "Station data scripts". It only updates the one row that 20261105200000_station_settings.sql created,
-- so it is safe to run again after an edit.
--
-- Every value here was already in the code (the login page, the listening page, the affidavit letterhead,
-- the Editorial Inquiry prompt, the IT-04 notice, the weather client's coordinates and alert counties)
-- before it moved into the row.

update public.station_settings set
  display_name = 'WUWF Public Media',
  short_name = 'WUWF',
  call_sign = 'WUWF-FM',
  licensee = 'University of West Florida',
  mailing_address = E'11000 University Pkwy, Bldg 88\nPensacola, FL 32514',
  primary_city = 'Pensacola',
  region = 'Florida',
  coverage_area = 'Pensacola and Northwest Florida',
  support_email = 'tools-support@wuwf.org',
  public_attribution = '— WUWF Public Media, Pensacola, FL',
  public_notice_text = 'This page is provided by the University of West Florida under its',
  public_notice_link_label = 'Information Security and Privacy Policy (IT-04)',
  public_notice_link_url = '/policies/it-04-information-security-and-privacy.pdf',
  latitude = 30.5433,
  longitude = -87.2169,
  alert_counties = E'Escambia:012033\nSanta Rosa:012113\nOkaloosa:012091\nMobile:001097'
where id;
