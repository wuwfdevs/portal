-- Copy dedicated to one schedule line (docs/underwriting-traffic-redesign.md §16).
--
-- Some orders give a message to one line rather than to the whole contract.
-- End of Line Cafe's current insertion order (2/10/2026–2/7/2027) reads
-- "For Carpool: #1 …" and "For Total Program: #2 …"; First City Art Center's
-- (9/21–11/14/2026) gives its Carpool spots their own script beside the
-- general one; Phil Hall's 2022–23 order rotated Copy 1–4 and kept a
-- separate "Carpool message". A link can already be scoped to a flight; this
-- adds the same kind of scope for one line.
--
-- The rule (rotation.ts's servesLine(), and uw_copy_serves_line() below):
--   * copy scoped to a line serves only that line;
--   * a line that has copy of its own takes only that copy;
--   * every other line takes the contract's unscoped copy, as before.
--
-- Enforcement is a trigger on uw_scheduled_placements rather than a new
-- clause in each writer, because every path that puts a message on a credit
-- — log_place_underwriting_credit() (manual, auto-fill, capability, makegood,
-- bump) and log_reassign_underwriting_credit_copy() (the rotation walk) —
-- writes that row. The TypeScript planner and rotation apply the same rule
-- first, so the trigger is the backstop, as the SQL guard is elsewhere.

alter table public.uw_contract_copy
  add column schedule_line_id uuid
    references public.uw_contract_schedule_lines (id) on delete cascade,
  add constraint uw_contract_copy_one_scope
    check (flight_id is null or schedule_line_id is null);

comment on column public.uw_contract_copy.schedule_line_id is
  'Null: serves every line of the contract that has no dedicated copy. Set: the order gives this message to one line, which then takes only its dedicated copy (uw_copy_serves_line()). A line belongs to one revision, so a revision that replaces the line leaves the scope pointing at the superseded one until staff set it again.';

create index uw_contract_copy_schedule_line_idx
  on public.uw_contract_copy (schedule_line_id)
  where schedule_line_id is not null;

-- A link's line must be one of the same contract's lines.
create or replace function public.uw_guard_contract_copy_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.schedule_line_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.uw_contract_schedule_lines
    where id = new.schedule_line_id and contract_id = new.contract_id
  ) then
    raise exception 'copy_line_other_contract'
      using hint = 'A message can only be dedicated to a line of the contract it is linked to.';
  end if;
  return new;
end;
$$;

create trigger uw_contract_copy_line_guard
  before insert or update of schedule_line_id, contract_id on public.uw_contract_copy
  for each row execute function public.uw_guard_contract_copy_line();

-- Whether a linked message may air on a line. True for a message not
-- linked at all: that is copy_not_linked, reported by the writers' own
-- checks, not this rule.
create or replace function public.uw_copy_serves_line(
  p_contract_id uuid,
  p_copy_id uuid,
  p_line_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scope uuid;
begin
  select schedule_line_id into v_scope
  from public.uw_contract_copy
  where contract_id = p_contract_id and copy_id = p_copy_id;
  if not found then
    return true;
  end if;
  if v_scope is not null then
    return v_scope = p_line_id;
  end if;
  return not exists (
    select 1 from public.uw_contract_copy
    where contract_id = p_contract_id and schedule_line_id = p_line_id
  );
end;
$$;

comment on function public.uw_copy_serves_line(uuid, uuid, uuid) is
  'Copy scoped to a line serves only that line; a line with copy of its own takes only that copy; other lines take the contract''s unscoped copy. The TypeScript twin is lib/underwriting/rotation.ts''s servesLine() — keep them in step.';

create or replace function public.uw_guard_placement_copy_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract uuid;
begin
  if new.status = 'superseded' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.copy_id is not distinct from old.copy_id
     and new.schedule_line_id is not distinct from old.schedule_line_id then
    return new;
  end if;
  select contract_id into v_contract
  from public.uw_contract_schedule_lines where id = new.schedule_line_id;
  if v_contract is not null
     and not public.uw_copy_serves_line(v_contract, new.copy_id, new.schedule_line_id) then
    raise exception 'copy_wrong_line'
      using hint = 'That message is dedicated to another line, or this line has messages of its own.';
  end if;
  return new;
end;
$$;

create trigger uw_scheduled_placements_copy_line_guard
  before insert or update of copy_id, schedule_line_id on public.uw_scheduled_placements
  for each row execute function public.uw_guard_placement_copy_line();
