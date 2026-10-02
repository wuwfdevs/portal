-- Copy carries the DAD cut it plays from, and imported copy is labeled by
-- how it airs, not by whether it has a cart number.
--
-- 1. execution_kind. log_import_underwriting_copy() (last replaced in
--    20260924120000) labeled new copy `recorded` whenever it had a cart
--    number. RadioTraffic numbers every message, live reads included, so 63
--    of the 66 "recorded" rows in production were read-aloud scripts. The
--    script decides now: an instruction to play a spot ("Please play the
--    # 2 spot…") is recorded, anything read aloud is a live read — the same
--    question the import model's plays_recording answers. The cart is never
--    consulted. The function keeps its signature and is replaced in place
--    (a drop and recreate hangs through the Supabase MCP). The
--    same rule repairs the existing rows; their durations are already
--    read-time estimates (20260924120000's backfill) and stay as they are.
--
-- 2. dad_cut. The Portal replaces RadioTraffic and owns DAD cut numbering,
--    in the format RadioTraffic's ENCO export writes: five digits and "A"
--    (cart 13 -> 00013A). RadioTraffic only reformatted its cart number;
--    nothing ever kept DAD's cuts in step with it, and WUWF's DAD library has
--    no lettered cuts. So every message gets its own cut here:
--      * new copy takes the next number from uw_dad_cut_seq (never reused,
--        so a cut can't point at an old recording still in DAD);
--      * existing copy adopts its old cart number where that number belongs
--        to one active message, so anything already recorded under it
--        lines up; otherwise it takes a fresh number;
--      * copy whose script plays an existing DAD spot (Dauphin Island, TLC
--        Learning Minutes) gets none: its recording is already in DAD under
--        an ordinary five-digit cut (Dauphin 2 is 00065), which staff pick.
--    cart_identifier stays, unshown, because the two transitional importers
--    match on it.
--
-- 3. log_search_dad_cuts(): the DAD library (log_content_items) for the
--    copy form's "Existing DAD spot" picker. Underwriting-only staff have no
--    RLS access to Log's tables, so this is the same security-definer
--    boundary as log_list_programs().

-- ---------------------------------------------------------------------------
-- The play-instruction rule, the SQL twin of playsRecording()
-- (src/lib/underwriting/legacy-copy.ts).

create function private.uw_script_plays_recording(p_script text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_script ~* '\mplease\s+(the\s+)?play\M', false);
$$;

grant execute on function private.uw_script_plays_recording(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. execution_kind

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
    case when private.uw_script_plays_recording(v_script)
         then 'recorded'::public.uw_copy_execution_kind
         else 'live_read'::public.uw_copy_execution_kind end,
    'approved', auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

update public.uw_copy
set execution_kind = 'live_read'
where execution_kind = 'recorded'
  and script is not null
  and not private.uw_script_plays_recording(script);

-- ---------------------------------------------------------------------------
-- 2. dad_cut

alter table public.uw_copy add column dad_cut text;

alter table public.uw_copy
  add constraint uw_copy_dad_cut_format check (dad_cut ~ '^[0-9]{5}A?$');

-- A Portal-assigned cut belongs to one message. An existing DAD spot can be
-- named by more than one (two versions of copy that play the same spot).
create unique index uw_copy_dad_cut_key on public.uw_copy (dad_cut) where dad_cut like '%A';

comment on column public.uw_copy.dad_cut is
  'The DAD cut this message plays from: its recording, or a live read''s recorded version for automated hours. NNNNNA is assigned by the Portal (uw_dad_cut_seq); a plain NNNNN is an existing DAD spot picked from the library. Null on copy that plays an existing spot nobody has picked yet.';

create sequence public.uw_dad_cut_seq minvalue 1 maxvalue 99999 no cycle;

grant usage on sequence public.uw_dad_cut_seq to authenticated;

-- The next Portal cut nobody holds. A manually entered NNNNNA can sit ahead
-- of the sequence, so it skips taken numbers rather than failing the insert.
create function private.uw_next_dad_cut()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cut text;
begin
  loop
    v_cut := lpad(nextval('public.uw_dad_cut_seq')::text, 5, '0') || 'A';
    exit when not exists (select 1 from public.uw_copy where dad_cut = v_cut);
  end loop;
  return v_cut;
end;
$$;

grant execute on function private.uw_next_dad_cut() to authenticated;

create function public.uw_copy_assign_dad_cut()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.dad_cut is null and not private.uw_script_plays_recording(new.script) then
    new.dad_cut := private.uw_next_dad_cut();
  end if;
  return new;
end;
$$;

-- Backfill before the trigger exists, so the sequence starts past every
-- cart that could be adopted.
select setval(
  'public.uw_dad_cut_seq',
  greatest(1, coalesce((
    select max(cart_identifier::integer)
    from public.uw_copy
    where cart_identifier ~ '^[0-9]{1,5}$'
  ), 0)),
  (select count(*) > 0 from public.uw_copy where cart_identifier ~ '^[0-9]{1,5}$')
);

do $$
declare
  v_today date := public.uw_station_today();
  v_row record;
  v_candidate text;
  v_shared boolean;
begin
  for v_row in
    select c.id, c.cart_identifier,
           (c.effective_to is null or c.effective_to >= v_today) as active
    from public.uw_copy c
    where not private.uw_script_plays_recording(c.script)
    order by (c.effective_to is null or c.effective_to >= v_today) desc, c.created_at
  loop
    v_candidate := null;
    if v_row.cart_identifier ~ '^[0-9]{1,5}$' then
      -- A cart shared by more than one active message belongs to none of
      -- them; an expired message never takes a cart an active one uses.
      select exists (
        select 1 from public.uw_copy o
        where o.id <> v_row.id
          and o.cart_identifier = v_row.cart_identifier
          and (o.effective_to is null or o.effective_to >= v_today)
      ) into v_shared;
      if not v_shared then
        v_candidate := lpad(v_row.cart_identifier::integer::text, 5, '0') || 'A';
        if exists (select 1 from public.uw_copy where dad_cut = v_candidate) then
          v_candidate := null;
        end if;
      end if;
    end if;
    update public.uw_copy
    set dad_cut = coalesce(v_candidate, private.uw_next_dad_cut())
    where id = v_row.id;
  end loop;
end;
$$;

create trigger uw_copy_assign_dad_cut
  before insert on public.uw_copy
  for each row execute function public.uw_copy_assign_dad_cut();

-- ---------------------------------------------------------------------------
-- 3. log_search_dad_cuts

create function public.log_search_dad_cuts(p_query text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select case
    when auth.uid() is null or not (
      private.has_underwriting_access(auth.uid()) or private.has_log_access(auth.uid())
    ) then jsonb_build_object('error', 'forbidden')
    else jsonb_build_object('ok', true, 'cuts', coalesce((
      select jsonb_agg(jsonb_build_object('cut', cut, 'title', title, 'group', dad_group) order by cut)
      from (
        select i.dad_cart_number as cut, i.title, i.dad_group
        from public.log_content_items i
        where i.dad_cart_number is not null
          and (
            nullif(btrim(coalesce(p_query, '')), '') is null
            or i.dad_cart_number ilike '%' || btrim(p_query) || '%'
            or i.title ilike '%' || btrim(p_query) || '%'
          )
        order by i.dad_cart_number
        limit 20
      ) matches
    ), '[]'::jsonb))
  end;
$$;

comment on function public.log_search_dad_cuts(text) is
  'DAD library cuts (log_content_items.dad_cart_number) matching a cut number or title, for the copy form''s existing-spot picker. Security definer: an Underwriting-only caller has no RLS access to log_content_items.';

revoke execute on function public.log_search_dad_cuts(text) from public, anon;
grant execute on function public.log_search_dad_cuts(text) to authenticated;
