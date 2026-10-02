-- An import that changes a copy row's wording keeps how it airs in step
-- with the new wording. Before this, both import update paths
-- (log_import_underwriting_copy()'s matched-row branch and
-- log_import_update_underwriting_copy()) changed only the script and
-- duration: wording that turned from a read-aloud credit into "please play
-- the # 2 spot" stayed a live read with its Portal cut, so the DAD log
-- would have played the old recording instead of the spot the script names
-- (and the reverse left a read-aloud credit with no cut to record under).
--
-- private.uw_reconcile_imported_copy() runs after either update and acts
-- only on a change of kind, so a cut staff chose for copy whose kind didn't
-- change is never touched:
--   * now plays a recording: recorded, and a Portal cut (NNNNNA) is cleared
--     so staff pick the existing spot — the copy list's "Needs a DAD cut";
--   * now read aloud: live_read, and it gets the next Portal cut unless it
--     already has one.
-- Both functions keep their signatures and are replaced in place.

create function private.uw_reconcile_imported_copy(p_copy_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plays boolean;
begin
  select private.uw_script_plays_recording(script) into v_plays
  from public.uw_copy where id = p_copy_id;
  if v_plays is null then
    return;
  end if;

  update public.uw_copy
  set execution_kind = case when v_plays
        then 'recorded'::public.uw_copy_execution_kind
        else 'live_read'::public.uw_copy_execution_kind end,
      dad_cut = case
        when v_plays and dad_cut like '%A' then null
        when not v_plays and (dad_cut is null or dad_cut not like '%A')
          then private.uw_next_dad_cut()
        else dad_cut
      end
  where id = p_copy_id
    and execution_kind is distinct from (case when v_plays
        then 'recorded'::public.uw_copy_execution_kind
        else 'live_read'::public.uw_copy_execution_kind end);
end;
$$;

create or replace function public.log_import_underwriting_copy(
  p_underwriter_id uuid,
  p_label text,
  p_cart_identifier text,
  p_script text,
  p_duration_seconds integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_label text;
  v_cart text;
  v_script text;
  v_duration integer;
  v_updated integer;
begin
  if auth.uid() is null or not private.has_log_access(auth.uid()) then
    raise exception 'forbidden';
  end if;

  v_label := btrim(coalesce(p_label, ''));
  v_cart := nullif(btrim(coalesce(p_cart_identifier, '')), '');
  v_script := nullif(btrim(coalesce(p_script, '')), '');
  v_duration := case when p_duration_seconds > 0 then p_duration_seconds end;
  if v_label = '' then
    raise exception 'copy label is required';
  end if;
  if not exists (select 1 from public.uw_underwriters where id = p_underwriter_id) then
    raise exception 'unknown underwriter';
  end if;

  select id into v_id
  from public.uw_copy
  where underwriter_id = p_underwriter_id
    and label = v_label
    and cart_identifier is not distinct from v_cart
  order by created_at
  limit 1;
  if found then
    update public.uw_copy
    set duration_seconds = case
          when v_script is not null and script is distinct from v_script
            then coalesce(v_duration, duration_seconds)
          else coalesce(duration_seconds, v_duration)
        end,
        script = coalesce(v_script, script)
    where id = v_id
      and (
        (v_script is not null and script is distinct from v_script)
        or (duration_seconds is null and v_duration is not null)
      );
    get diagnostics v_updated = row_count;
    if v_updated > 0 then
      perform private.uw_reconcile_imported_copy(v_id);
    end if;
    return v_id;
  end if;

  insert into public.uw_copy (
    underwriter_id, label, cart_identifier, script, duration_seconds,
    execution_kind, approval_status, created_by
  ) values (
    p_underwriter_id, v_label, v_cart, v_script, v_duration,
    case when private.uw_script_plays_recording(v_script)
         then 'recorded'::public.uw_copy_execution_kind
         else 'live_read'::public.uw_copy_execution_kind end,
    'approved', auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.log_import_update_underwriting_copy(
  p_copy_id uuid,
  p_script text,
  p_duration_seconds integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_script text;
  v_updated integer;
begin
  if auth.uid() is null or not private.has_log_access(auth.uid()) then
    raise exception 'forbidden';
  end if;

  v_script := nullif(btrim(coalesce(p_script, '')), '');
  if v_script is null then
    return false;
  end if;

  update public.uw_copy
  set script = v_script,
      duration_seconds = coalesce(
        case when p_duration_seconds > 0 then p_duration_seconds end,
        duration_seconds
      )
  where id = p_copy_id
    and script is distinct from v_script;
  get diagnostics v_updated = row_count;
  if v_updated > 0 then
    perform private.uw_reconcile_imported_copy(p_copy_id);
  end if;
  return v_updated > 0;
end;
$$;
