-- Imported copy carries its read-time estimate as its duration.
--
-- The program-log export prints every credit at its booked length (00:30
-- for a 33-word script and a 69-word one alike), so the import now plans a
-- read-aloud credit at an estimate from its word count
-- (src/lib/log/read-time.ts) and stores that estimate as the copy's
-- duration. When an import changes a copy row's script, the old duration
-- was timed or estimated for the old wording, so it's replaced along with
-- the script. Both functions are otherwise unchanged from
-- 20260922120000_log_import_copy_script_updates.sql: same guard, same
-- matching, never label, cart, approval, or attribution.

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
    return v_id;
  end if;

  insert into public.uw_copy (
    underwriter_id, label, cart_identifier, script, duration_seconds,
    execution_kind, approval_status, created_by
  ) values (
    p_underwriter_id, v_label, v_cart, v_script, v_duration,
    case when v_cart is null then 'live_read'::public.uw_copy_execution_kind
         else 'recorded'::public.uw_copy_execution_kind end,
    'approved', auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- The new parameter defaults to null so a caller still passing only
-- (p_copy_id, p_script) — the deployed app, until this branch ships —
-- resolves to this function and keeps the row's existing duration.
drop function public.log_import_update_underwriting_copy(uuid, text);

create function public.log_import_update_underwriting_copy(
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
  return v_updated > 0;
end;
$$;

revoke execute on function public.log_import_update_underwriting_copy(uuid, text, integer) from public, anon;
grant execute on function public.log_import_update_underwriting_copy(uuid, text, integer) to authenticated;
