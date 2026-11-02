-- Program-log import: the export's script prevails over the library's.
--
-- Until Underwriting & Traffic staff maintain copy in their own tool, the
-- traffic system (DAD) is the real source of truth for what a credit says,
-- and the daily export is the only place that text reaches this database.
-- The import had been reusing a matched uw_copy row untouched and only
-- flagging "script differs from the library's" on the preview — a flag
-- with no consequence — which left rows damaged by earlier importer bugs
-- (words glued across line breaks by the old Word extractor, two credits
-- merged into one script by the pre-AI parser) as what a host reads on air
-- from every rundown that reuses them, import after import. Two changes,
-- both gated on has_log_access like the rest of this boundary:
--
--   1. log_import_underwriting_copy() now updates a matched row's script
--      when the import carries a different one (and fills a null duration),
--      instead of returning the existing id untouched.
--   2. log_import_update_underwriting_copy() updates one copy row's script
--      by id, for a credit the import already resolved to an existing row.
--
-- Neither touches label, cart, approval, or attribution — only the words.
-- There is no copy version history; the library holds the current wording,
-- and a rundown item that already references the row reads the corrected
-- text too, which is the point.

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
begin
  if auth.uid() is null or not private.has_log_access(auth.uid()) then
    raise exception 'forbidden';
  end if;

  v_label := btrim(coalesce(p_label, ''));
  v_cart := nullif(btrim(coalesce(p_cart_identifier, '')), '');
  v_script := nullif(btrim(coalesce(p_script, '')), '');
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
    set script = coalesce(v_script, script),
        duration_seconds = coalesce(duration_seconds, case when p_duration_seconds > 0 then p_duration_seconds end)
    where id = v_id
      and (
        (v_script is not null and script is distinct from v_script)
        or (duration_seconds is null and p_duration_seconds > 0)
      );
    return v_id;
  end if;

  insert into public.uw_copy (
    underwriter_id, label, cart_identifier, script, duration_seconds,
    execution_kind, approval_status, created_by
  ) values (
    p_underwriter_id, v_label, v_cart, v_script,
    case when p_duration_seconds > 0 then p_duration_seconds end,
    case when v_cart is null then 'live_read'::public.uw_copy_execution_kind
         else 'recorded'::public.uw_copy_execution_kind end,
    'approved', auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.log_import_update_underwriting_copy(
  p_copy_id uuid,
  p_script text
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
  set script = v_script
  where id = p_copy_id
    and script is distinct from v_script;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke execute on function public.log_import_update_underwriting_copy(uuid, text) from public, anon;
grant execute on function public.log_import_update_underwriting_copy(uuid, text) to authenticated;
