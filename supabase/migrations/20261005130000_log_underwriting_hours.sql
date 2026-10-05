-- Hours closed to underwriting: when auto-fill may not schedule a credit.
-- Nothing before this said which hours Traffic's automation could sell
-- into — "credits only after 5 PM" was an accident of which schedule lines
-- and pool targets existed, and a line targeting Morning Edition would have
-- auto-filled into it. Automated hours are the wrong lever for this: they
-- say whether anyone is in the studio and only change which copy qualifies
-- (a DAD cut), and a break in automated hours is still a candidate.
--
-- Every hour is open unless listed, the same "only exceptions are kept"
-- shape as automated hours (20261002130000), and the same two records:
--   * log_underwriting_closed_weekly — routine closed windows, such as
--     5 AM – 5 PM every day. end_time <= start_time runs past midnight and
--     belongs to the day it starts on. Windows may overlap; their union
--     counts.
--   * log_underwriting_hour_changes — one-time changes in either direction:
--     closed (a pledge week) or open (a special inside hours that are
--     normally closed). A change wins over the weekly windows, and changes
--     never overlap each other (the exclusion constraint).
-- private.log_is_closed_to_underwriting() is the SQL twin of
-- src/lib/log/underwriting-hours.ts isClosedToUnderwriting() — keep them in
-- step.
--
-- The rule reaches automation only (docs/underwriting-traffic-redesign.md
-- §18): auto-fill, rundown provisioning and bumping refuse a closed break;
-- a traffic staffer's own manual placement and a host's relocation are not
-- automation and stay unrestricted, as under the freeze rule
-- (20260925190000). It is a programming decision about what listeners hear
-- when, so the program director owns it, in On Air beside automated hours;
-- Traffic reads it through the additive select policies below, as it
-- already reads automated hours (20261002130100).

create type public.log_underwriting_hours_mode as enum ('closed', 'open');

create table public.log_underwriting_closed_weekly (
  id uuid primary key default gen_random_uuid(),
  days_of_week integer[] not null
    check (cardinality(days_of_week) > 0 and days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]),
  start_time time not null,
  end_time time not null,
  effective_from date not null default current_date,
  effective_to date,
  reason text,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

comment on table public.log_underwriting_closed_weekly is
  'Routine hours closed to underwriting auto-fill, weekly. Open is the default and has no record. end_time <= start_time runs past midnight. The union of active windows counts; a log_underwriting_hour_changes row wins over them.';

create table public.log_underwriting_hour_changes (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode public.log_underwriting_hours_mode not null,
  reason text,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint log_underwriting_hour_changes_no_overlap
    exclude using gist (tstzrange(starts_at, ends_at) with &&) where (active)
);

comment on table public.log_underwriting_hour_changes is
  'One-time changes to the hours closed to underwriting: closed (a pledge week) or open (a special inside normally closed hours). Wins over log_underwriting_closed_weekly; active changes never overlap.';

alter table public.log_underwriting_closed_weekly enable row level security;
alter table public.log_underwriting_hour_changes enable row level security;

create policy log_underwriting_closed_weekly_select on public.log_underwriting_closed_weekly
  for select to authenticated
  using ((select private.has_log_access((select auth.uid()))));
create policy log_underwriting_closed_weekly_insert on public.log_underwriting_closed_weekly
  for insert to authenticated
  with check ((select private.is_log_producer((select auth.uid()))));
create policy log_underwriting_closed_weekly_update on public.log_underwriting_closed_weekly
  for update to authenticated
  using ((select private.is_log_producer((select auth.uid()))))
  with check ((select private.is_log_producer((select auth.uid()))));

create policy log_underwriting_hour_changes_select on public.log_underwriting_hour_changes
  for select to authenticated
  using ((select private.has_log_access((select auth.uid()))));
create policy log_underwriting_hour_changes_insert on public.log_underwriting_hour_changes
  for insert to authenticated
  with check ((select private.is_log_producer((select auth.uid()))));
create policy log_underwriting_hour_changes_update on public.log_underwriting_hour_changes
  for update to authenticated
  using ((select private.is_log_producer((select auth.uid()))))
  with check ((select private.is_log_producer((select auth.uid()))));

-- Traffic's auto-fill, bumping and dashboard need to know which breaks fall
-- in closed hours, and an underwriting-only session can't read Log's
-- tables. These are a station schedule, not sensitive, so plain additive
-- select policies — the shape 20261002130100 chose for automated hours.
-- Writes stay with the program director.
create policy log_underwriting_closed_weekly_select_underwriting on public.log_underwriting_closed_weekly
  for select to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));
create policy log_underwriting_hour_changes_select_underwriting on public.log_underwriting_hour_changes
  for select to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));

-- ---------------------------------------------------------------------------
-- Whether an instant is closed to underwriting. Security definer like
-- private.log_is_automated(): the placement RPC runs for Traffic staff.

create function private.log_is_closed_to_underwriting(p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with here as (
    select (p_at at time zone 'America/Chicago')::date as d,
           extract(dow from (p_at at time zone 'America/Chicago'))::integer as dow,
           (p_at at time zone 'America/Chicago')::time as t
  ),
  change as (
    select c.mode
    from public.log_underwriting_hour_changes c
    where c.active and p_at >= c.starts_at and p_at < c.ends_at
    limit 1
  )
  select case
    when exists (select 1 from change) then (select mode = 'closed' from change)
    else exists (
      select 1
      from public.log_underwriting_closed_weekly w, here h
      where w.active
        and (
          -- Same-day window.
          (w.end_time > w.start_time
            and h.dow = any (w.days_of_week)
            and h.t >= w.start_time and h.t < w.end_time
            and w.effective_from <= h.d and (w.effective_to is null or w.effective_to >= h.d))
          -- Past midnight, evening part: today's window.
          or (w.end_time <= w.start_time
            and h.t >= w.start_time
            and h.dow = any (w.days_of_week)
            and w.effective_from <= h.d and (w.effective_to is null or w.effective_to >= h.d))
          -- Past midnight, early-morning part: the window that started yesterday.
          or (w.end_time <= w.start_time
            and h.t < w.end_time
            and ((h.dow + 6) % 7) = any (w.days_of_week)
            and w.effective_from <= h.d - 1 and (w.effective_to is null or w.effective_to >= h.d - 1))
        )
    )
  end;
$$;

grant execute on function private.log_is_closed_to_underwriting(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Placement: automation never adds a credit in closed hours. The body is
-- 20260925190000's with one check added after the freeze check.

create or replace function public.log_place_underwriting_credit(
  p_break_id uuid,
  p_schedule_line_id uuid,
  p_copy_id uuid,
  p_override_reason text default null,
  p_makegood_id uuid default null,
  p_automated boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_break public.log_rundown_breaks;
  v_rundown public.log_rundowns;
  v_program public.log_programs;
  v_line public.uw_contract_schedule_lines;
  v_revision public.uw_contract_revisions;
  v_contract public.uw_contracts;
  v_copy public.uw_copy;
  v_link public.uw_contract_copy;
  v_makegood public.uw_makegoods;
  v_exception public.uw_exceptions;
  v_bucket public.uw_demand_buckets;
  v_local_time time;
  v_dow integer;
  v_needs_override boolean;
  v_occupied integer;
  v_in_bucket integer;
  v_on_day integer;
  v_next_position integer;
  v_item_id uuid;
  v_placement_id uuid;
  v_block text;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- Serialize every placement against one schedule line: two staff actions
  -- (or auto-fill and a manual pick) racing for the same bucket wait here,
  -- and the second one sees the first's row in the counts below.
  select * into v_line from public.uw_contract_schedule_lines where id = p_schedule_line_id for update;
  if not found then
    return jsonb_build_object('error', 'unknown_schedule_line');
  end if;
  if v_line.status <> 'active' then
    return jsonb_build_object('error', 'line_cancelled');
  end if;

  select * into v_revision from public.uw_contract_revisions where id = v_line.revision_id;
  if v_revision.status <> 'current' then
    return jsonb_build_object('error', 'revision_not_current');
  end if;

  select * into v_contract from public.uw_contracts where id = v_line.contract_id;
  if v_contract.status <> 'active' then
    return jsonb_build_object('error', 'contract_not_active');
  end if;

  select * into v_break from public.log_rundown_breaks where id = p_break_id;
  if not found then
    return jsonb_build_object('error', 'unknown_break');
  end if;
  if not ('underwriting_credit' = any(v_break.permitted_content_types)) or v_break.local_opportunity_id is null then
    return jsonb_build_object('error', 'break_not_eligible');
  end if;

  select * into v_rundown from public.log_rundowns where id = v_break.rundown_id;
  select * into v_program from public.log_programs where id = v_rundown.program_id;

  -- Automation never writes into a live or submitted rundown, or a break
  -- that has already started. A staffer's own manual placement may.
  if p_automated then
    v_block := public.uw_automation_block(v_break, v_rundown);
    if v_block is not null then
      return jsonb_build_object('error', v_block);
    end if;
  end if;

  -- Hours closed to underwriting (20261005130000): automation never adds a
  -- credit there. Checked here, not in uw_automation_block(), because that
  -- helper also gates log_clear_underwriting_credit() and automation must
  -- still be able to clear a credit a staffer placed by hand into closed
  -- hours. Bumping's destination is covered too: it places through here.
  if p_automated and private.log_is_closed_to_underwriting(v_break.scheduled_at) then
    return jsonb_build_object('error', 'hours_closed');
  end if;

  v_local_time := public.uw_station_local_time(v_break.scheduled_at);
  v_dow := extract(dow from v_rundown.air_date)::integer;

  v_bucket := public.uw_bucket_for_date(v_line, v_rundown.air_date);
  if v_bucket.id is null then
    return jsonb_build_object('error', 'date_not_eligible');
  end if;
  if v_line.program_id is not null and v_line.program_id <> v_rundown.program_id then
    return jsonb_build_object('error', 'program_not_eligible');
  end if;
  if v_line.pool_id is not null and not public.uw_pool_matches(v_line.pool_id, v_rundown.program_id, v_local_time, v_dow) then
    return jsonb_build_object('error', 'pool_not_eligible');
  end if;
  if not public.uw_time_eligible(v_line, v_local_time) then
    return jsonb_build_object('error', case v_line.time_mode
      when 'window' then 'outside_window'
      when 'exact' then 'exact_time_mismatch'
      else 'time_not_eligible' end);
  end if;
  if not public.uw_break_position_eligible(v_line, v_break) then
    return jsonb_build_object('error', case v_line.time_mode
      when 'opening' then 'not_opening_break'
      else 'not_closing_break' end);
  end if;

  -- One credit per contract per break — the same underwriter never runs
  -- back to back, and never twice in one avail.
  if exists (
    select 1 from public.uw_scheduled_placements sp
    join public.log_rundown_items ci on ci.id = sp.log_rundown_item_id
    join public.uw_contract_schedule_lines sl on sl.id = sp.schedule_line_id
    where ci.break_id = p_break_id and sp.status <> 'superseded' and sl.contract_id = v_contract.id
  ) then
    return jsonb_build_object('error', 'same_contract_in_break');
  end if;

  if p_makegood_id is null then
    select count(*) into v_in_bucket from public.uw_scheduled_placements
    where demand_bucket_id = v_bucket.id and status <> 'superseded' and makegood_id is null;
    if v_in_bucket >= v_bucket.quantity_required then
      return jsonb_build_object('error', 'bucket_quota_met');
    end if;
  else
    select * into v_makegood from public.uw_makegoods where id = p_makegood_id;
    if not found or v_makegood.schedule_line_id <> v_line.id then
      return jsonb_build_object('error', 'unknown_makegood');
    end if;
    if v_makegood.status <> 'scheduled' or v_makegood.scheduled_placement_id is not null then
      return jsonb_build_object('error', 'makegood_already_scheduled');
    end if;
    select * into v_exception from public.uw_exceptions where id = v_makegood.exception_id;
    if v_exception.makegood_approval in ('pending', 'declined') then
      return jsonb_build_object('error', 'makegood_needs_approval');
    end if;
    -- The replacement is attributed to the bucket the order missed.
    if v_makegood.demand_bucket_id is not null then
      select * into v_bucket from public.uw_demand_buckets where id = v_makegood.demand_bucket_id;
    end if;
  end if;

  if v_line.max_per_day is not null then
    select count(*) into v_on_day from public.uw_scheduled_placements
    where schedule_line_id = v_line.id and status <> 'superseded' and placement_date = v_rundown.air_date;
    if v_on_day >= v_line.max_per_day then
      return jsonb_build_object('error', 'day_cap_met');
    end if;
  end if;

  select * into v_copy from public.uw_copy where id = p_copy_id;
  if not found then
    return jsonb_build_object('error', 'unknown_copy');
  end if;
  select * into v_link from public.uw_contract_copy
  where contract_id = v_line.contract_id and copy_id = p_copy_id;
  if not found then
    return jsonb_build_object('error', 'copy_not_linked');
  end if;
  if v_link.flight_id is not null and v_link.flight_id is distinct from v_line.flight_id then
    return jsonb_build_object('error', 'copy_wrong_flight');
  end if;

  if v_copy.duration_seconds is null then
    return jsonb_build_object('error', 'copy_duration_unknown');
  end if;
  select coalesce(sum(planned_duration_seconds), 0) into v_occupied
    from public.log_rundown_items where break_id = p_break_id;
  if v_copy.duration_seconds > (v_break.available_duration_seconds - v_occupied) then
    return jsonb_build_object('error', 'too_long');
  end if;

  v_needs_override := v_copy.approval_status <> 'approved'
    or v_copy.effective_from > v_rundown.air_date
    or (v_copy.effective_to is not null and v_copy.effective_to < v_rundown.air_date);
  if v_needs_override then
    if p_override_reason is null or trim(p_override_reason) = '' then
      return jsonb_build_object('error', 'copy_needs_override');
    end if;
    if not private.is_underwriting_manager(auth.uid()) then
      return jsonb_build_object('error', 'override_requires_manager');
    end if;
  end if;

  select coalesce(max(position), 0) + 1 into v_next_position
    from public.log_rundown_items where break_id = p_break_id;

  insert into public.log_rundown_items (
    break_id, position, item_kind, underwriting_copy_id, planned_duration_seconds, placement_status
  ) values (
    p_break_id, v_next_position, 'underwriting_credit', p_copy_id, v_copy.duration_seconds, 'replaceable'
  )
  returning id into v_item_id;

  insert into public.uw_scheduled_placements (
    schedule_line_id, copy_id, log_rundown_item_id, placement_date, scheduled_at,
    program_id, program_name, break_label, status, override_reason, created_by,
    demand_bucket_id, makegood_id
  ) values (
    p_schedule_line_id, p_copy_id, v_item_id, v_rundown.air_date, v_break.scheduled_at,
    v_rundown.program_id, v_program.name, v_break.label,
    'scheduled', case when v_needs_override then p_override_reason else null end, auth.uid(),
    v_bucket.id, p_makegood_id
  )
  returning id into v_placement_id;

  if p_makegood_id is not null then
    update public.uw_makegoods
    set scheduled_placement_id = v_placement_id, scheduled_for = v_break.scheduled_at
    where id = p_makegood_id;
  end if;

  return jsonb_build_object('ok', true, 'placement_id', v_placement_id, 'item_id', v_item_id,
    'bucket_id', v_bucket.id, 'period_start', v_bucket.period_start, 'period_end', v_bucket.period_end);
end;
$$;
revoke execute on function public.log_place_underwriting_credit(uuid, uuid, uuid, text, uuid, boolean) from public, anon;
grant execute on function public.log_place_underwriting_credit(uuid, uuid, uuid, text, uuid, boolean) to authenticated;

comment on function public.log_place_underwriting_credit(uuid, uuid, uuid, text, uuid, boolean) is
  'Places an underwriting credit into a Log break through every contractual check (docs/underwriting-traffic-redesign.md §9-§10). When p_automated, also refuses a frozen rundown, a started break (uw_automation_block), and hours closed to underwriting (private.log_is_closed_to_underwriting, 20261005130000) — a staffer''s own placement is not automation.';
