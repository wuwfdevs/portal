-- The station's name on the screens people see before they sign in.
--
-- station_settings is readable by signed-in staff only. The login page, the request-access page, the
-- public listening page and the guest join screen are shown to people who are not signed in, and they all
-- say whose they are: "Sign in to WUWF Tools", "WUWF Public Media", "Your answers go to WUWF". This adds
-- public.station_public_profile(), which returns just the fields meant to be seen by anyone (names, call
-- sign, city, region, coverage area, the support address, the attribution line and the public notice) and
-- nothing else: not the licensee, mailing address or time zone.
--
-- Four more columns are added for what those screens and the AI prompts need and the first version of the
-- table left out:
--   coverage_area            how the station describes who it serves ("Pensacola and Northwest Florida"); the
--                            Editorial Inquiry prompt uses it, and city + region cannot be turned into it
--   public_notice_text,      the notice under every public form. WUWF's is the University of West Florida's
--   public_notice_link_label, IT-04 policy line, which is the licensee's, not the product's; a station with
--   public_notice_link_url   no such notice leaves them empty and none is shown. The link must be a path on
--                            this site or an https address (a javascript: link is refused).
--
-- Like every function reachable without signing in, this one is security definer and granted to anon. Unlike
-- the forms it is not tied to one tool, so it has no tool_is_enabled check; access-predicates.test.ts lists
-- it as the platform-level exception, with this reasoning.

alter table public.station_settings
  add column coverage_area text check (char_length(coverage_area) <= 160),
  add column public_notice_text text check (char_length(public_notice_text) <= 300),
  add column public_notice_link_label text check (char_length(public_notice_link_label) <= 160),
  add column public_notice_link_url text check (
    char_length(public_notice_link_url) <= 300 and public_notice_link_url ~ '^(/|https://)'
  );

create function public.station_public_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'display_name', s.display_name,
    'short_name', s.short_name,
    'call_sign', s.call_sign,
    'primary_city', s.primary_city,
    'region', s.region,
    'coverage_area', s.coverage_area,
    'support_email', s.support_email,
    'public_attribution', s.public_attribution,
    'public_notice_text', s.public_notice_text,
    'public_notice_link_label', s.public_notice_link_label,
    'public_notice_link_url', s.public_notice_link_url
  )
  from public.station_settings s
  where s.id;
$$;

revoke execute on function public.station_public_profile() from public;
grant execute on function public.station_public_profile() to anon, authenticated;
