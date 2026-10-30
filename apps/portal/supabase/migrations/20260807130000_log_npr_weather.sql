-- Log: Slice 3 (NPR + weather) — Workflow D from docs/log-design.md §3/§5/§6.
-- Adds log_npr_rundown_cache and log_weather_reading, the two integration
-- caches that let a host "read NPR and weather in context." Both are
-- refreshed lazily at read time, not on a schedule (§6's "no job queue"
-- architecture note) — this migration only adds the tables and RLS; the
-- actual fetch-and-replace logic lives in lib/log/npr.ts, lib/log/weather.ts,
-- and their provider adapters in lib/log/providers/.
--
-- Like Slice 2's content library, both tables are open to any tool member —
-- private.has_log_access() alone, no is_log_producer() branch — because
-- reading/refreshing NPR and weather is an ordinary host duty (§3D), not a
-- producer-only privilege the way clocks/programs/schedule are.
--
-- The two tables replace data differently, per their own lifecycle in §5:
--
--   * log_npr_rundown_cache: "Rows are replaced wholesale on each successful
--     retrieval, not diffed — the point is 'what did we last successfully
--     get,' not a change history." So the app deletes a program's existing
--     rows and inserts a fresh set on every refresh — RLS grants
--     select/insert/delete, no update.
--   * log_weather_reading: "one current live-read... prior rows are the
--     revision history §8.1 asks for." So the app never deletes; it flips
--     the previous current row's is_current to false and inserts a new one
--     — RLS grants select/insert/update, no delete. A partial unique index
--     enforces at most one current row at a time.

create type public.log_npr_status as enum ('draft', 'edited', 'revised', 'withdrawn');

-- NPR rundown cache --------------------------------------------------------

create table public.log_npr_rundown_cache (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.log_programs (id) on delete cascade,
  segment_order integer not null,
  story_title text not null,
  story_description text,
  forward_promo_copy text,
  status public.log_npr_status not null default 'draft',
  advisory_text text,
  retrieved_at timestamptz not null default now(),
  constraint log_npr_rundown_cache_segment_order_check check (segment_order > 0)
);

comment on table public.log_npr_rundown_cache is
  'The most recently retrieved NPR segment order for one program (docs/log-design.md §5) — an integration cache, never edited locally. Replaced wholesale (delete + insert) on each successful retrieval, never diffed; see lib/log/npr.ts.';

create index log_npr_rundown_cache_program_idx
  on public.log_npr_rundown_cache (program_id, segment_order);

-- Weather reading -----------------------------------------------------------

create table public.log_weather_reading (
  id uuid primary key default gen_random_uuid(),
  forecast_area text not null,
  source text not null,
  live_read_text text not null,
  condensed_text text not null,
  high_temp integer,
  low_temp integer,
  conditions_summary text not null,
  precipitation_notes text,
  hazards text,
  last_updated_at timestamptz not null default now(),
  valid_through_at timestamptz not null,
  is_current boolean not null default false
);

comment on table public.log_weather_reading is
  'One current live-read plus revision history (docs/log-design.md §5, §8) — every weather slot references whichever row has is_current = true. Refresh flips the old current row false and inserts a new one; see lib/log/weather.ts.';

-- At most one current reading at a time. A plain unique constraint can''t
-- express "unique among true values only" — this is the same partial-index
-- shape sw_document_processing_runs uses for its own single-in-flight-run
-- invariant.
create unique index log_weather_reading_one_current_idx
  on public.log_weather_reading (is_current)
  where is_current;

create index log_weather_reading_last_updated_idx on public.log_weather_reading (last_updated_at desc);

-- Row Level Security ----------------------------------------------------------
-- Any tool member — no producer gate, same reasoning as Slice 2's content
-- library (see file header).

alter table public.log_npr_rundown_cache enable row level security;
alter table public.log_weather_reading enable row level security;

grant select, insert, delete on public.log_npr_rundown_cache to authenticated;
grant select, insert, update on public.log_weather_reading to authenticated;

create policy log_npr_rundown_cache_select on public.log_npr_rundown_cache
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_npr_rundown_cache_insert on public.log_npr_rundown_cache
  for insert to authenticated
  with check (private.has_log_access(auth.uid()));

create policy log_npr_rundown_cache_delete on public.log_npr_rundown_cache
  for delete to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_weather_reading_select on public.log_weather_reading
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_weather_reading_insert on public.log_weather_reading
  for insert to authenticated
  with check (private.has_log_access(auth.uid()));

create policy log_weather_reading_update on public.log_weather_reading
  for update to authenticated
  using (private.has_log_access(auth.uid()))
  with check (private.has_log_access(auth.uid()));
