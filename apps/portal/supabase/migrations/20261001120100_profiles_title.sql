-- A person's job title, on their profile (docs/underwriting-traffic-
-- redesign.md §17). The affidavit signing form pre-fills it; a change made
-- while signing applies to that affidavit only (uw_affidavits keeps its own
-- certifying_staff_title, frozen with the signed PDF).
--
-- Free text, set by administrators on the user's edit screen — the
-- existing profiles_update_admin_only policy already covers it, and
-- profiles_select_own_or_admin already lets the signer read their own, so
-- no new policy.

alter table public.profiles
  add column title text
  constraint profiles_title_length_check check (title is null or char_length(title) <= 120);

comment on column public.profiles.title is
  'Job title, e.g. "Director". Pre-fills the signature line on an Underwriting affidavit.';
