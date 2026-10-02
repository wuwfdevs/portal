-- The DAD log (lib/log/dad-export.ts): the fixed-width traffic file ENCO
-- DAD's ListGen merges into a day's playlist, for the breaks in automated
-- hours (20261002130000). A producer releases a day; each release is a new
-- version, kept with its file and hash, never edited.
--
--   * log_rundown_items.dad_spot_number — the 12-digit spot number DAD
--     prints for a row, minted the first time the item is released and
--     kept after, so re-releasing a day doesn't renumber what DAD already
--     has. Minted from log_dad_spot_seq, starting at 400000000001 so it
--     never collides with RadioTraffic's own 3000… numbers already in DAD.
--     The row's GUID is the item's id.
--   * log_dad_exports — the release record (append-only: select + insert,
--     no update or delete policy), its file in the private log-exports
--     bucket.

create sequence public.log_dad_spot_seq start with 400000000001;

alter table public.log_rundown_items
  add column dad_spot_number bigint unique;

comment on column public.log_rundown_items.dad_spot_number is
  'The DAD log''s spot number for this item, minted on its first release (log_assign_dad_spot_numbers) and never changed.';

create table public.log_dad_exports (
  id uuid primary key default gen_random_uuid(),
  air_date date not null,
  version integer not null check (version >= 1),
  file_name text not null,
  file_path text not null,
  sha256 text not null,
  event_count integer not null,
  warnings jsonb not null default '[]'::jsonb,
  released_by uuid not null references public.profiles (id),
  released_at timestamptz not null default now(),
  unique (air_date, version)
);

comment on table public.log_dad_exports is
  'Each release of a day''s DAD log: its file (log-exports bucket), hash and row count. Append-only.';

alter table public.log_dad_exports enable row level security;

create policy log_dad_exports_select on public.log_dad_exports
  for select to authenticated
  using ((select private.has_log_access((select auth.uid()))));

create policy log_dad_exports_insert on public.log_dad_exports
  for insert to authenticated
  with check (
    (select private.is_log_producer((select auth.uid())))
    and released_by = (select auth.uid())
  );

-- Spot numbers: a producer mints them for the items about to be released.
-- Security definer because the sequence isn't granted to authenticated;
-- an item that already has one keeps it.
create function public.log_assign_dad_spot_numbers(p_item_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numbers jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.is_log_producer(auth.uid()) or not private.has_log_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  update public.log_rundown_items
     set dad_spot_number = nextval('public.log_dad_spot_seq')
   where id = any (p_item_ids)
     and dad_spot_number is null;

  select coalesce(jsonb_agg(jsonb_build_object('item_id', id, 'spot_number', dad_spot_number)), '[]'::jsonb)
    into v_numbers
    from public.log_rundown_items
   where id = any (p_item_ids);

  return jsonb_build_object('ok', true, 'numbers', v_numbers);
end;
$$;

revoke execute on function public.log_assign_dad_spot_numbers(uuid[]) from public, anon;
grant execute on function public.log_assign_dad_spot_numbers(uuid[]) to authenticated;

-- The released files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('log-exports', 'log-exports', false, 5242880, array['text/plain']);

create policy log_exports_select on storage.objects
  for select to authenticated
  using (bucket_id = 'log-exports' and (select private.has_log_access((select auth.uid()))));

create policy log_exports_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'log-exports' and (select private.is_log_producer((select auth.uid()))));
