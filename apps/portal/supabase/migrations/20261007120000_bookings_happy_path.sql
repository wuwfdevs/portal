-- Bookings: refinement pass, slice A — the happy path (2026-10-07).
--
-- docs/bookings-design.md §18. Additive only: nothing applied earlier is
-- rewritten. A request is now created together with its priced estimate and
-- its booking plan, so the project remembers the primary window the staff
-- picked (a re-plan honors it) and whether its dates are system-planned or
-- hand-planned ("Adjust scope"); it records the system's finding that a
-- request the lead judged strategic was priced at the university rate because
-- the reserve had run out — a separate fact from the judgment itself, which is
-- never overwritten; and an expense line keeps the cost the person typed apart
-- from the rate derived from it (repriceProject() used to write the grossed-up
-- rate back into the one column, so an external project's assessment compounded
-- on every reprice).

alter table public.bk_projects
  add column event_window_start time,
  add column event_window_end time,
  add column dates_mode text not null default 'auto',
  add column reserve_depleted boolean not null default false,
  add constraint bk_projects_dates_mode check (dates_mode in ('auto', 'manual')),
  add constraint bk_projects_event_window check (
    (event_window_start is null) = (event_window_end is null)
    and (event_window_start is null or event_window_end > event_window_start)
  );

comment on column public.bk_projects.event_window_start is
  'The primary window start staff picked when the request was created ("Time of day"); null means first available. lib/bookings/booking-plan.ts honors it on a re-plan.';
comment on column public.bk_projects.dates_mode is
  'auto: the system plans and re-plans the project''s dates from its package lines and event date. manual: "Adjust scope" — staff planned them by hand and the system never regenerates them.';
comment on column public.bk_projects.reserve_depleted is
  'Set by repriceProject(): the request qualifies as strategic (qualifies_strategic = true) but was priced at the university rate because the reserve could not cover it. A finding of the system, never a change to the judgment.';

alter table public.bk_estimate_lines
  add column direct_cost numeric(12, 2);

update public.bk_estimate_lines set direct_cost = unit_rate where kind = 'expense';

alter table public.bk_estimate_lines
  add constraint bk_estimate_lines_direct_cost check (
    (kind = 'expense') = (direct_cost is not null) and (direct_cost is null or direct_cost >= 0)
  );

comment on column public.bk_estimate_lines.direct_cost is
  'An expense line''s cost each, as typed, before any assessment. unit_rate is derived from it by lib/bookings/pricing.ts and may be higher for an external project. Null for package and labor lines.';
