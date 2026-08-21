-- Adds a per-story audio duration to the cached NPR episode items.
--
-- CDS supplies no explicit air times for a program-episode's stories — only
-- each story's audio duration (on its primary audio asset) and the episode's
-- item order. Duration + order is what lib/log/npr-story-times.ts packs into
-- the program's own clock's lettered segment windows to derive the
-- *estimated* air times the rundown screen and /log/npr show (a host
-- forward-promoting "coming up after the break" needs when a story airs, not
-- just its title). Nullable because not every story has playable audio — a
-- web-only version's asset carries no duration, confirmed in the live
-- 2026-08-21 Morning Edition episode (2 of 18 items).
--
-- No backfill: cached episodes refresh wholesale on the next stale read
-- (docs/log-design.md §5's "replaced wholesale, not diffed"), so existing
-- rows pick the value up within one staleness window with no migration-side
-- parsing of stored raw JSON.

alter table public.log_npr_episode_items
  add column duration_seconds integer,
  add constraint log_npr_episode_items_duration_check
    check (duration_seconds is null or duration_seconds > 0);

comment on column public.log_npr_episode_items.duration_seconds is
  'The story''s audio duration in whole seconds, from the CDS document''s primary audio asset — null when the story has no playable audio. Input to the estimated-air-time packing in lib/log/npr-story-times.ts.';
