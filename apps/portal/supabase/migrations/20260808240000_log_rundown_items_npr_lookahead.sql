-- Log: NPR "look-ahead" provenance on rundown items.
--
-- A host planning a break routinely writes a bit of live-read copy that
-- teases an upcoming NPR story after the break ("coming up, a look at...") —
-- deliberately not always the very next story CDS lists, since NPR's own
-- host often promos that one immediately on rejoin and a host doesn't want
-- to repeat it. That's still an ordinary item_kind = 'live_read' row (its
-- own duration counts in the break's timing math exactly like any other
-- item) — this migration doesn't add a new item_kind for it. It only adds
-- two nullable columns so a live-read created from an NPR story remembers
-- which one, for exactly one purpose: NPR's own episode cache is deleted
-- and reinserted wholesale on every refresh (log_npr.ts's
-- replaceEpisodeCache — "not diffed... not a change history"), so a real
-- story substitution between planning and air time means the story a host
-- built a look-ahead around may no longer exist in the current episode.
-- Comparing source_npr_item_id (CDS's own stable item id, unaffected by the
-- cache's own row churn) against whatever's currently cached is a plain
-- read-time presence check the rundown screen already has the data for —
-- no new query, no diffing of text, no auto-rewrite. Just a visible flag,
-- the same "flag it, a human decides" precedent the weather/NPR staleness
-- handling already uses elsewhere in this tool.

alter table public.log_rundown_items
  add column source_npr_item_id text,
  add column source_npr_item_title text;

comment on column public.log_rundown_items.source_npr_item_id is
  'CDS''s own stable item id for the NPR story this live-read was built as a look-ahead for, if any. Compared against the currently-cached episode''s items at read time to flag a possible story substitution — never a foreign key, since log_npr_episode_items rows are deleted and reinserted wholesale on every refresh (see lib/log/npr.ts) and this id must survive that churn to be useful.';
comment on column public.log_rundown_items.source_npr_item_title is
  'The NPR story''s title at the moment this look-ahead was created, captured for display — never re-read from log_npr_episode_items, which may no longer have a matching row by air time.';

alter table public.log_rundown_items
  add constraint log_rundown_items_npr_source_check
  check (source_npr_item_id is null or item_kind = 'live_read');
