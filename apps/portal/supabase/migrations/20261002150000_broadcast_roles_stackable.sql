-- Broadcast roles that stack (docs/broadcast-roles.md).
--
-- A grant held one free-text tool_role, so one person could hold one role
-- per tool. The broadcast tools' roles are functional and orthogonal —
-- program director, traffic, production — and at WUWF one person holds all
-- three, so a grant now carries a list:
--
--   * tool_access.tool_roles text[] is the source of truth. tool_role stays
--     as its first element, kept in step by a trigger, so the single-role
--     tools (Editorial Planning, Roadmap, Academic Partnerships, Resources)
--     and anything still writing tool_role keep working unchanged.
--   * On Air (key `log`): `program_director` replaces `producer` and keeps
--     every producer gate (clocks, schedule, programs, automated hours) —
--     private.is_log_producer() now answers "is program director" so no
--     clock or schedule policy changes. New `traffic`: station ID pins
--     (with the program director) and the DAD log release (alone).
--   * Traffic (key `underwriting`): `manager` unchanged; new `production`
--     (marks copy recorded in DAD, 20261002150100).
--
-- Backfill: a Log `producer` held both jobs, so it becomes
-- {program_director, traffic}; an Underwriting `manager` gains `production`
-- so no one loses anything they could do (there is one of each, the same
-- person).

alter table public.tool_access
  add column tool_roles text[] not null default '{}';

update public.tool_access
set tool_roles = array[lower(btrim(tool_role))]
where tool_role is not null and btrim(tool_role) <> '';

update public.tool_access ta
set tool_roles = array['program_director', 'traffic']
from public.tools t
where t.id = ta.tool_id and t.key = 'log' and ta.tool_roles = array['producer'];

update public.tool_access ta
set tool_roles = array['manager', 'production']
from public.tools t
where t.id = ta.tool_id and t.key = 'underwriting' and ta.tool_roles = array['manager'];

-- tool_role mirrors tool_roles[1]. A write that sets only tool_role (older
-- code) is taken as a one-role list.
create function public.tool_access_sync_roles()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if cardinality(new.tool_roles) = 0 and nullif(btrim(coalesce(new.tool_role, '')), '') is not null then
      new.tool_roles := array[lower(btrim(new.tool_role))];
    end if;
  elsif new.tool_roles is not distinct from old.tool_roles
        and new.tool_role is distinct from old.tool_role then
    new.tool_roles := case
      when nullif(btrim(coalesce(new.tool_role, '')), '') is null then '{}'::text[]
      else array[lower(btrim(new.tool_role))] end;
  end if;
  new.tool_roles := array(
    select distinct lower(btrim(r)) from unnest(new.tool_roles) as r where btrim(r) <> ''
    order by 1
  );
  new.tool_role := new.tool_roles[1];
  return new;
end;
$$;

create trigger tool_access_sync_roles
  before insert or update on public.tool_access
  for each row execute function public.tool_access_sync_roles();

-- Bring tool_role in line with the backfilled lists.
update public.tool_access set tool_roles = tool_roles where tool_role is distinct from tool_roles[1];

-- The role checks. Each is a non-revoked grant on the tool, an active
-- profile, and the role in tool_roles — or an administrator.

create function private.has_tool_role(uid uuid, p_tool_key text, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tool_access ta
    join public.tools t on t.id = ta.tool_id
    join public.profiles p on p.id = uid
    where ta.user_id = uid
      and t.key = p_tool_key
      and ta.revoked_at is null
      and p_role = any (ta.tool_roles)
      and p.account_status = 'active'
  ) or private.is_administrator(uid);
$$;

grant execute on function private.has_tool_role(uuid, text, text) to authenticated;

-- Kept by name so every clock, schedule, program and automated-hours policy
-- stays as it is; it now means "is program director".
create or replace function private.is_log_producer(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.has_tool_role(uid, 'log', 'program_director');
$$;

create function private.is_log_traffic(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.has_tool_role(uid, 'log', 'traffic');
$$;

grant execute on function private.is_log_traffic(uuid) to authenticated;

create or replace function private.is_underwriting_manager(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.has_tool_role(uid, 'underwriting', 'manager');
$$;

create function private.is_underwriting_production(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.has_tool_role(uid, 'underwriting', 'production');
$$;

grant execute on function private.is_underwriting_production(uuid) to authenticated;

-- Station ID pins: program director or traffic.
alter policy log_opportunity_assignments_insert on public.log_opportunity_assignments
  with check (
    (select private.is_log_producer((select auth.uid())))
    or (select private.is_log_traffic((select auth.uid())))
  );

alter policy log_opportunity_assignments_update on public.log_opportunity_assignments
  using (
    (select private.is_log_producer((select auth.uid())))
    or (select private.is_log_traffic((select auth.uid())))
  )
  with check (
    (select private.is_log_producer((select auth.uid())))
    or (select private.is_log_traffic((select auth.uid())))
  );

-- The DAD log release: traffic.
alter policy log_dad_exports_insert on public.log_dad_exports
  with check (
    (select private.is_log_traffic((select auth.uid())))
    and released_by = (select auth.uid())
  );

alter policy log_exports_insert on storage.objects
  with check (bucket_id = 'log-exports' and (select private.is_log_traffic((select auth.uid()))));

create or replace function public.log_assign_dad_spot_numbers(p_item_ids uuid[])
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
  if not private.is_log_traffic(auth.uid()) or not private.has_log_access(auth.uid()) then
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
