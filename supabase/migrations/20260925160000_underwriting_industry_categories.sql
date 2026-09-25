-- Underwriting & Traffic: a typed industry category on underwriters.
--
-- uw_underwriters.category was free text ("Real Estate Services") and the
-- competitive-adjacency rule — the reference agreement's "does not run
-- adjacent to a business with similar services or products", enforced by
-- auto-fill within a break and advisory on the manual placement form —
-- compared those strings for equality. Two staffers typing "Lawyers" and
-- "Legal services" for two firms would never be caught. Requested directly
-- (2026-09-25): the category is a table, the underwriter references it, and
-- adjacency keys on the id.
--
-- Both projects held no category text at all (40 underwriters in
-- production, every category null; preview the same), so there is nothing
-- to backfill — the column is replaced outright. The starter rows below
-- are the industries the audited orders actually name (the Autumn Beck
-- agreement's "Lawyers" conflict category, pest control, real estate, a
-- utility, arts organizations, a school district's health department…);
-- staff extend the list on /underwriting/underwriters.

create table public.uw_industry_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uw_industry_categories_name_unique unique (name)
);

comment on table public.uw_industry_categories is
  'The industry an underwriter is in, for the competitive-adjacency rule: two underwriters sharing a category never run back to back in one break (auto-fill), and a manual placement near one is warned about. A typed list, not free text, so "Lawyers" and "Legal services" cannot be two spellings of one industry. Deactivate rather than delete.';

create trigger set_uw_industry_categories_updated_at
  before update on public.uw_industry_categories
  for each row execute function public.set_updated_at();

alter table public.uw_industry_categories enable row level security;
grant select, insert, update on public.uw_industry_categories to authenticated;

create policy uw_industry_categories_select on public.uw_industry_categories
  for select to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_industry_categories_insert on public.uw_industry_categories
  for insert to authenticated
  with check ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_industry_categories_update on public.uw_industry_categories
  for update to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))))
  with check ((select private.has_underwriting_access((select auth.uid()))));

alter table public.uw_underwriters
  drop column category,
  add column category_id uuid references public.uw_industry_categories (id) on delete restrict;

comment on column public.uw_underwriters.category_id is
  'The underwriter''s industry (uw_industry_categories) — the key the competitive-adjacency rule compares. Null: no category, nothing to compare.';

create index uw_underwriters_category_idx on public.uw_underwriters (category_id);

insert into public.uw_industry_categories (name, description) values
  ('Legal services', 'Attorneys and law firms — the reference agreement''s own "Lawyers" conflict category.'),
  ('Real estate', 'Brokers, agents, property management.'),
  ('Financial services', 'Banks, credit unions, advisors, insurance.'),
  ('Health care', 'Hospitals, clinics, practices, public health.'),
  ('Home services', 'Pest control, windows, roofing, HVAC, landscaping.'),
  ('Arts and culture', 'Orchestras, theatres, festivals, museums, arts councils.'),
  ('Education', 'Schools, colleges, tutoring, educational programs.'),
  ('Retail', 'Stores and specialty retailers.'),
  ('Restaurants and food', 'Restaurants, markets, producers.'),
  ('Utilities and energy', 'Power, water, telecommunications.'),
  ('Media and publishing', 'Publishers, authors, publications.'),
  ('Government and public agencies', 'Departments, agencies, public services.'),
  ('Nonprofit and community', 'Foundations, associations, community organizations.'),
  ('Automotive', 'Dealers, service, parts.'),
  ('Manufacturing and industry', 'Mills, plants, industrial employers.'),
  ('Events and entertainment', 'Concert promoters, venues, attractions.')
on conflict (name) do nothing;
