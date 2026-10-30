-- Bookings: refinement pass, slice B — cost transparency (2026-10-07).
--
-- docs/bookings-design.md §19. Every estimate computes and stores its full
-- economic cost, what the partner pays, what WUWF contributes, and the market
-- benchmark as it stood when priced, so the term report can total them. SQL
-- never computes any of it: lib/bookings/economics.ts does, from the card
-- snapshot, and repriceProject() writes the result. Additive.
--
-- The card snapshot gains the exact (unrounded) costs the economics read; a
-- snapshot written before this migration has none, is reported stale by
-- snapshotMatchesCard(), and "Record for estimates" rewrites it.

alter table public.bk_rate_card_lines
  add column labor_cost numeric,
  add column resource_cost numeric,
  add column exact_cost numeric;

comment on column public.bk_rate_card_lines.labor_cost is
  'A package line: the exact (unrounded) labor cost of one unit — every class''s hours at its loaded hourly cost. Null for a labor line.';
comment on column public.bk_rate_card_lines.resource_cost is
  'A package line: the exact (unrounded) resource cost of one unit — every pool''s units at its cost per unit. Null for a labor line.';
comment on column public.bk_rate_card_lines.exact_cost is
  'A labor line: the class''s exact (unrounded) loaded hourly cost. Null for a package line.';

alter table public.bk_projects
  add column labor_cost numeric,
  add column resource_cost numeric,
  add column direct_expense_cost numeric,
  add column full_economic_cost numeric,
  add column partner_recovery numeric,
  add column wuwf_contribution numeric,
  add column external_margin numeric,
  add column external_assessment numeric,
  add column market_benchmarks jsonb not null default '[]'::jsonb,
  add column economics jsonb,
  add constraint bk_projects_benchmarks_array check (jsonb_typeof(market_benchmarks) = 'array'),
  add constraint bk_projects_contribution_nonnegative check (
    wuwf_contribution is null or wuwf_contribution >= 0
  );

comment on column public.bk_projects.full_economic_cost is
  'Modeled labor + modeled resources + direct expenses, exact. Excludes margin, assessment and overhead (docs/bookings-design.md, Definitions).';
comment on column public.bk_projects.partner_recovery is
  'What the partner pays: the sum of the estimate''s line amounts.';
comment on column public.bk_projects.wuwf_contribution is
  'max(0, full_economic_cost - partner_recovery). External margin and assessment are never a negative contribution.';
comment on column public.bk_projects.external_margin is
  'External only: max(0, recovery - assessment - full cost). Zero otherwise.';
comment on column public.bk_projects.external_assessment is
  'External only: the assessment share of what the partner pays (of cost, for an expense). Zero otherwise.';
comment on column public.bk_projects.market_benchmarks is
  'One entry per package line: its market floor, ceiling and reference note as they stood when priced, and the rate charged.';
comment on column public.bk_projects.economics is
  'The per-line breakdown the Show calculation panel prints: labor, resource and direct cost and the amount, per line.';
