-- Log: corrects Slice 3's NPR integration to NPR's real Content Distribution
-- Service (CDS) model, replacing the hypothetical "rundown feed" prototype
-- 20260807130000_log_npr_weather.sql shipped. That migration is already
-- applied, so per this repo's migration discipline this is a corrective
-- migration, not a rewrite of it.
--
-- What was wrong (see CLAUDE.md for the full account): the prototype assumed
-- NPR exposes a generic `{ segments: [...] }` feed keyed by Log's own
-- log_programs.id, with Log-invented fields (forward_promo_copy, a
-- draft/edited/revised/withdrawn status) and no concept of a dated episode —
-- just one undifferentiated "current rundown" per program. NPR CDS actually
-- identifies programs as *collections* (a stable integer id, e.g. Morning
-- Edition = 3), and a rundown is a dated `program-episode` document
-- containing an ordered `items` collection of stories. Date is part of the
-- episode's identity — "today's Morning Edition" and "yesterday's" are
-- different documents, not one row that gets overwritten.
--
-- This migration:
--   1. Adds log_programs.npr_collection_id — the stable link from a local
--      program to its NPR CDS collection. Nullable: most of this station's
--      45 seeded programs are local or have no known CDS mapping (see the
--      backfill below, which only sets the 9 collection IDs actually known
--      — never guessed).
--   2. Drops log_npr_rundown_cache and the log_npr_status enum outright —
--      not deprecated in place, since nothing about the CDS model is
--      compatible with them, and no rows exist in production or preview to
--      migrate (the prototype was hours old).
--   3. Adds log_npr_episodes (one row per program+show_date, mirroring a CDS
--      program-episode document — found or not_found, with raw CDS metadata
--      preserved) and log_npr_episode_items (that episode's ordered story
--      items, each with a stable NPR item id, title, teaser, and raw
--      metadata). Replaced wholesale per (program_id, show_date) on refresh,
--      same "not diffed" rule as before, but now scoped to one dated episode
--      instead of nuking every date a program has ever cached.

-- Local-to-NPR identity link -------------------------------------------------

alter table public.log_programs add column npr_collection_id integer;

comment on column public.log_programs.npr_collection_id is
  'NPR Content Distribution Service collection id for this program (e.g. Morning Edition = 3), if it is a mapped NPR network program. Null for local programs and any network program without a known mapping — never assume every program has one.';

-- Backfill only the collection IDs actually known (docs/log-design.md §5) —
-- exact name match, nothing guessed. "All Things Considered (Weekends)" is a
-- distinct program row from the weekday "All Things Considered" and is
-- deliberately left unmapped: only one ATC collection id was ever given.
update public.log_programs set npr_collection_id = 2 where name = 'All Things Considered';
update public.log_programs set npr_collection_id = 3 where name = 'Morning Edition';
update public.log_programs set npr_collection_id = 7 where name = 'Weekend Edition Saturday';
update public.log_programs set npr_collection_id = 10 where name = 'Weekend Edition Sunday';
update public.log_programs set npr_collection_id = 13 where name = 'Fresh Air';
update public.log_programs set npr_collection_id = 35 where name = 'Wait Wait... Don''t Tell Me!';
update public.log_programs set npr_collection_id = 57 where name = 'TED Radio Hour';
update public.log_programs set npr_collection_id = 60 where name = 'Here & Now';
update public.log_programs set npr_collection_id = 65 where name = '1A';

-- Drop the prototype ----------------------------------------------------------

drop table public.log_npr_rundown_cache;
drop type public.log_npr_status;

-- Dated NPR episode cache ------------------------------------------------------

create type public.log_npr_episode_status as enum ('found', 'not_found');

create table public.log_npr_episodes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.log_programs (id) on delete cascade,
  show_date date not null,
  npr_collection_id integer not null,
  status public.log_npr_episode_status not null,
  -- Null exactly when status = 'not_found' — see the check constraint below.
  npr_episode_id text,
  title text,
  -- The CDS program-episode document as returned, preserved so a field this
  -- migration didn't anticipate isn't lost — see the file header and
  -- docs/log-design.md §5.
  raw jsonb,
  retrieved_at timestamptz not null default now(),
  constraint log_npr_episodes_found_has_id check (
    (status = 'found' and npr_episode_id is not null) or
    (status = 'not_found' and npr_episode_id is null)
  ),
  unique (program_id, show_date)
);

comment on table public.log_npr_episodes is
  'One row per (program, show_date): the last successful CDS lookup for that dated NPR program-episode, found or explicitly not_found. Replaced wholesale (delete + insert) per program+date on refresh, never diffed — same rule log_npr_rundown_cache had, now scoped to one dated episode instead of a whole program. See lib/log/npr.ts.';

create index log_npr_episodes_program_date_idx on public.log_npr_episodes (program_id, show_date);

create table public.log_npr_episode_items (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.log_npr_episodes (id) on delete cascade,
  position integer not null,
  -- The CDS document id for this story/item — stable NPR identity, never a
  -- title. See docs/log-design.md §5.
  npr_item_id text not null,
  title text not null,
  teaser text,
  raw jsonb,
  constraint log_npr_episode_items_position_check check (position > 0),
  unique (episode_id, npr_item_id)
);

comment on table public.log_npr_episode_items is
  'The ordered story/content items within one cached NPR program-episode (CDS''s transcluded `items` collection) — the network story sequence Log surfaces to hosts. Deleted and reinserted with its parent episode row, never updated in place.';

create index log_npr_episode_items_episode_idx on public.log_npr_episode_items (episode_id, position);

-- Row Level Security ------------------------------------------------------------
-- Any tool member — no producer gate, same reasoning as the rest of Slice 3.

alter table public.log_npr_episodes enable row level security;
alter table public.log_npr_episode_items enable row level security;

grant select, insert, delete on public.log_npr_episodes to authenticated;
-- No delete grant on items: a parent episode delete cascades to its items at
-- the database level, which Postgres exempts from RLS re-checks (row
-- security is not applied when enforcing a foreign key's cascade action) —
-- see 20260806120000_academic_partnerships_delete.sql's ap_submission_events
-- for the same precedent in this repo.
grant select, insert on public.log_npr_episode_items to authenticated;

create policy log_npr_episodes_select on public.log_npr_episodes
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_npr_episodes_insert on public.log_npr_episodes
  for insert to authenticated
  with check (private.has_log_access(auth.uid()));

create policy log_npr_episodes_delete on public.log_npr_episodes
  for delete to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_npr_episode_items_select on public.log_npr_episode_items
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_npr_episode_items_insert on public.log_npr_episode_items
  for insert to authenticated
  with check (private.has_log_access(auth.uid()));
