-- Bookings: slice 6 — settlement at actual cost (2026-10-07).
--
-- docs/bookings-design.md §21 (and §20.9, which reshaped slice 6 down to this).
-- Hours confirmation and the term report already shipped; what is left is
-- Finance's record of what a delivered project actually cost and what was
-- recovered:
--
--   * bk_settlements — one per project. A *drafted* row is computed by
--     lib/bookings/settlements.ts from the approved estimate's price, the
--     hours and units production confirmed (bk_hours_used) costed at the rate
--     card's unit costs, and direct expenses at actual cost. A *posted* row is
--     frozen and carries the journal entry number Finance keyed by hand.
--   * bk_post_settlement() — posts a draft and moves the project to `settled`
--     in one transaction.
--
-- SQL never computes a price or a cost: the figures arrive from TypeScript and
-- are only checked for shape here. Additive; nothing applied earlier is rewritten
-- (bk_guard_project() is not restated — the settled-requires-a-posting rule is
-- its own trigger, below).

create type public.bk_settlement_kind as enum ('recharge', 'invoice');
create type public.bk_settlement_status as enum ('drafted', 'posted');

create table public.bk_settlements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.bk_projects (id) on delete cascade,
  -- A UWF unit is recharged to its funding index; an outside partner is invoiced (§2.3).
  kind public.bk_settlement_kind not null,
  status public.bk_settlement_status not null default 'drafted',
  -- What the partner is charged: the approved estimate's lines, with each direct
  -- expense replaced by its actual cost (plus the assessment when external).
  amount numeric not null check (amount >= 0),
  -- The approved estimate's recovery and full cost, kept so the variance is visible.
  estimated_recovery numeric not null default 0,
  estimated_full_cost numeric,
  estimated_contribution numeric,
  -- Cost as confirmed: confirmed hours and units at the card's unit costs, plus actual expenses.
  actual_labor_cost numeric not null default 0,
  actual_resource_cost numeric not null default 0,
  actual_direct_cost numeric not null default 0,
  actual_full_cost numeric not null default 0,
  wuwf_contribution numeric not null default 0,
  assessment_amount numeric not null default 0,
  external_margin numeric not null default 0,
  -- Per expense line (by estimate-line id): the actual total cost. Absent = as estimated.
  expense_actuals jsonb not null default '{}'::jsonb,
  rate_model_version_id uuid references public.bk_rate_model_versions (id) on delete set null,
  funding_index text,
  journal_entry_number text,
  notes text,
  drafted_by uuid references public.profiles (id) on delete set null,
  drafted_at timestamptz not null default now(),
  posted_by uuid references public.profiles (id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bk_settlements_costs_nonnegative check (
    actual_labor_cost >= 0 and actual_resource_cost >= 0 and actual_direct_cost >= 0
    and actual_full_cost >= 0 and wuwf_contribution >= 0 and assessment_amount >= 0 and external_margin >= 0
  ),
  constraint bk_settlements_expense_actuals_object check (jsonb_typeof(expense_actuals) = 'object'),
  -- Posted means numbered, and a recharge names the index it is charged to.
  constraint bk_settlements_posted check (
    status = 'drafted'
    or (
      posted_at is not null and posted_by is not null
      and journal_entry_number is not null and length(btrim(journal_entry_number)) > 0
      and (kind = 'invoice' or (funding_index is not null and length(btrim(funding_index)) > 0))
    )
  )
);

create index bk_settlements_status_idx on public.bk_settlements (status);

comment on table public.bk_settlements is
  'Finance''s record of a delivered project at actual cost: the amount recharged or invoiced, the cost as confirmed, WUWF''s contribution, and the journal entry Finance posted it under. Drafted by lib/bookings/settlements.ts; frozen once posted (docs/bookings-design.md §21).';
comment on column public.bk_settlements.amount is
  'What the partner is charged. Never recomputed here: lib/bookings/settlements.ts writes it.';
comment on column public.bk_settlements.expense_actuals is
  'Actual total cost per direct-expense estimate line, keyed by line id. A line with no entry settles as estimated.';
comment on column public.bk_settlements.journal_entry_number is
  'Keyed by hand by Finance after posting in the university''s own system; there is no integration (§6.6).';

create trigger set_bk_settlements_updated_at
  before update on public.bk_settlements
  for each row execute function public.set_updated_at();

-- Guards ---------------------------------------------------------------------------------------------------
-- RLS admits Finance's writes; which transitions are legal is decided here, in the
-- shape of bk_guard_version_transition() — so the boundary holds however the table is written.

create function public.bk_guard_settlement()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_project public.bk_projects;
begin
  if tg_op = 'INSERT' then
    select * into v_project from public.bk_projects where id = new.project_id;
    if v_project.id is null or v_project.stage <> 'delivered' or v_project.disposition is not null then
      raise exception 'A settlement is drafted for a delivered project.' using errcode = 'check_violation';
    end if;
    if new.status <> 'drafted' then
      raise exception 'A settlement is drafted first; posting is a separate step.' using errcode = 'check_violation';
    end if;
    new.drafted_by := coalesce(new.drafted_by, auth.uid());
    return new;
  end if;

  if old.status = 'posted' then
    raise exception 'A posted settlement is final; a correction is a note on the project.' using errcode = 'check_violation';
  end if;
  if new.project_id is distinct from old.project_id then
    raise exception 'A settlement stays with its project.' using errcode = 'check_violation';
  end if;
  if new.status = 'posted' then
    if not private.is_bookings_finance(auth.uid()) then
      raise exception 'Only Finance can post a settlement.' using errcode = 'check_violation';
    end if;
    new.posted_at := coalesce(new.posted_at, now());
    new.posted_by := coalesce(new.posted_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger bk_settlements_guard
  before insert or update on public.bk_settlements
  for each row execute function public.bk_guard_settlement();

-- A project is settled only by a posted settlement, so the stage can never run ahead of the record.
create function public.bk_guard_project_settled()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stage = 'settled' and old.stage is distinct from 'settled'
     and not exists (
       select 1 from public.bk_settlements s where s.project_id = new.id and s.status = 'posted'
     ) then
    raise exception 'A project is settled by posting its settlement.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger bk_projects_guard_settled
  before update on public.bk_projects
  for each row execute function public.bk_guard_project_settled();

-- Posting --------------------------------------------------------------------------------------------------

/**
 * Post a drafted settlement and settle its project, together. Finance only (the guard
 * says so too). A recharge needs the funding index it is charged to; either kind needs
 * the journal entry number.
 */
create function public.bk_post_settlement(
  p_settlement_id uuid,
  p_journal_entry_number text,
  p_funding_index text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_settlement public.bk_settlements;
  v_project public.bk_projects;
  v_index text := nullif(btrim(coalesce(p_funding_index, '')), '');
begin
  if p_journal_entry_number is null or length(btrim(p_journal_entry_number)) = 0 then
    return jsonb_build_object('error', 'journal_entry_required');
  end if;
  select * into v_settlement from public.bk_settlements where id = p_settlement_id for update;
  if v_settlement.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if v_settlement.status = 'posted' then return jsonb_build_object('error', 'already_posted'); end if;
  select * into v_project from public.bk_projects where id = v_settlement.project_id for update;
  if v_project.stage <> 'delivered' or v_project.disposition is not null then
    return jsonb_build_object('error', 'wrong_stage');
  end if;
  v_index := coalesce(v_index, v_settlement.funding_index);
  if v_settlement.kind = 'recharge' and v_index is null then
    return jsonb_build_object('error', 'funding_index_required');
  end if;

  update public.bk_settlements
     set status = 'posted', journal_entry_number = btrim(p_journal_entry_number), funding_index = v_index
   where id = p_settlement_id;
  update public.bk_projects set stage = 'settled' where id = v_settlement.project_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.bk_post_settlement(uuid, text, text) from public, anon;
grant execute on function public.bk_post_settlement(uuid, text, text) to authenticated;

-- RLS ------------------------------------------------------------------------------------------------------
-- Everyone in the tool reads (a member with no role reads everything, §6.1). Finance drafts,
-- edits and posts; nothing is deleted — a draft is replaced by drafting again.

alter table public.bk_settlements enable row level security;
grant select, insert, update on public.bk_settlements to authenticated;

create policy bk_settlements_select on public.bk_settlements for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_settlements_insert on public.bk_settlements for insert to authenticated
  with check ((select private.is_bookings_finance((select auth.uid()))));
create policy bk_settlements_update on public.bk_settlements for update to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))));
