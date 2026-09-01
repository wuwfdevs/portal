-- Fixes a real race in the NPR lazy-refresh cache write: lib/log/npr.ts's
-- replaceEpisodeCache() issued a delete, then a separate insert, as two
-- independent round trips (not one database transaction) — a real,
-- reader-visible gap between them where this program+date had no cached
-- episode at all. Two clients polling the same live rundown (a host and a
-- producer, say) could both see the cache cross its 15-minute staleness
-- threshold within the same moment and both call replaceEpisodeCache
-- concurrently, widening that window and risking one's insert racing the
-- other's delete. log_npr_episodes already has a unique (program_id,
-- show_date) constraint, so a genuine duplicate row was never possible —
-- but the empty-window read was, which this migration closes by making the
-- whole delete+insert(+items) sequence one atomic function call instead of
-- several separate ones.
--
-- Security invoker, not definer: nothing here needs to cross an RLS
-- boundary (log_npr_episodes/log_npr_episode_items RLS is already
-- has_log_access()-scoped to any tool member, no producer gate — see
-- 20260807140000_log_npr_cds_correction.sql) — this function exists purely
-- for atomicity, so it runs as the calling member and RLS still applies
-- exactly as if they'd issued the statements directly.

create function public.log_replace_npr_episode_cache(
  p_program_id uuid,
  p_show_date date,
  p_npr_collection_id integer,
  p_status log_npr_episode_status,
  p_npr_episode_id text,
  p_title text,
  p_raw jsonb,
  -- Array of {npr_item_id, title, teaser, duration_seconds, raw}, already in
  -- the order they should be stored — position is assigned from array order.
  p_items jsonb
)
returns public.log_npr_episodes
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_episode public.log_npr_episodes;
begin
  delete from public.log_npr_episodes
  where program_id = p_program_id and show_date = p_show_date;
  -- log_npr_episode_items.episode_id is `on delete cascade`, so the old
  -- episode's items are already gone once this delete commits.

  insert into public.log_npr_episodes
    (program_id, show_date, npr_collection_id, status, npr_episode_id, title, raw)
  values
    (p_program_id, p_show_date, p_npr_collection_id, p_status, p_npr_episode_id, p_title, p_raw)
  returning * into v_episode;

  if p_items is not null and jsonb_array_length(p_items) > 0 then
    insert into public.log_npr_episode_items
      (episode_id, position, npr_item_id, title, teaser, duration_seconds, raw)
    select
      v_episode.id,
      ordinality,
      item->>'npr_item_id',
      item->>'title',
      item->>'teaser',
      nullif(item->>'duration_seconds', '')::integer,
      item->'raw'
    from jsonb_array_elements(p_items) with ordinality as elems(item, ordinality);
  end if;

  return v_episode;
end;
$$;

revoke execute on function public.log_replace_npr_episode_cache(uuid, date, integer, log_npr_episode_status, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.log_replace_npr_episode_cache(uuid, date, integer, log_npr_episode_status, text, text, jsonb, jsonb) to authenticated;
