-- The Pools screen's inline "New pool" card (docs/ui-patterns.md; design
-- handoff 2026-09-27) creates a pool together with its Log targets in one
-- step. Two separate inserts from the Server Action — the pool, then its
-- targets — would leave a pool with no targets behind if the second failed,
-- which the screen then reads as "no Log mapping yet" and a line targeting
-- it can never find a break. This function inserts both in one transaction.
--
-- Security invoker, not definer: nothing here crosses an RLS boundary
-- (uw_inventory_pools/_targets are has_underwriting_access()-scoped already,
-- see 20260925120000_underwriting_traffic_redesign.sql). It exists for
-- atomicity, so it runs as the calling member and RLS applies exactly as if
-- they had issued the inserts directly — the same reasoning as
-- log_replace_npr_episode_cache().
--
-- Pool names are also made unique case-insensitively: uw_inventory_pools
-- already has unique (name), but "Carpool" and "carpool" are the same order
-- vocabulary, and the redesigned card reports a clash under the Name field
-- ("A pool with this name already exists.") off the unique_violation code.

create unique index uw_inventory_pools_name_ci_unique
  on public.uw_inventory_pools (lower(name));

create function public.uw_create_inventory_pool(
  p_name text,
  p_description text,
  -- Array of {program_id, window_start, window_end, days_of_week, notes};
  -- each key nullable. An empty array creates a pool with no targets.
  p_targets jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pool_id uuid;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'A pool needs a name.' using errcode = 'check_violation';
  end if;

  insert into public.uw_inventory_pools (name, description, created_by)
  values (btrim(p_name), nullif(btrim(p_description), ''), auth.uid())
  returning id into v_pool_id;

  if p_targets is not null and jsonb_array_length(p_targets) > 0 then
    insert into public.uw_inventory_pool_targets
      (pool_id, program_id, window_start, window_end, days_of_week, notes)
    select
      v_pool_id,
      nullif(item->>'program_id', '')::uuid,
      nullif(item->>'window_start', '')::time,
      nullif(item->>'window_end', '')::time,
      case
        when item->'days_of_week' is null or jsonb_typeof(item->'days_of_week') <> 'array'
          or jsonb_array_length(item->'days_of_week') = 0
        then null
        else (select array_agg(d::integer order by d::integer)
              from jsonb_array_elements_text(item->'days_of_week') as days(d))
      end,
      nullif(item->>'notes', '')
    from jsonb_array_elements(p_targets) as elems(item);
  end if;

  return v_pool_id;
end;
$$;

comment on function public.uw_create_inventory_pool(text, text, jsonb) is
  'Creates an inventory pool and its Log targets atomically (the Pools screen''s inline New pool card). Security invoker: RLS on both tables still applies.';

revoke execute on function public.uw_create_inventory_pool(text, text, jsonb) from public, anon;
grant execute on function public.uw_create_inventory_pool(text, text, jsonb) to authenticated;
