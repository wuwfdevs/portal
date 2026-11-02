-- Underwriting & Traffic: domain redesign, grounded in the real WUWF
-- Autumn Beck Blackledge underwriting agreement. See CLAUDE.md's
-- "Underwriting domain redesign" note and docs/underwriting-design.md
-- (rewritten alongside this migration) for the full account. No production
-- data exists in this tool (CLAUDE.md) — this is a clean replacement of the
-- obligation/placement model, not an incremental ALTER.
--
-- What was wrong, in order:
--   1. An underwriter existed only as free text on a contract
--      (uw_contracts.underwriter_name) — no durable identity, no reusable
--      contact info, nothing to hang a competitive-adjacency check off of.
--   2. uw_placement_obligations was a generic ad-tech obligation shape
--      (quantity_required/quantity_period/distribution_rule as free text)
--      that made staff translate a plain recurring schedule ("Monday
--      ~7:49am, Tuesday ~4:48pm, Wednesday and Thursday ~8:06am, 26 weeks")
--      into an abstract quantity + period instead of just entering the
--      schedule. uw_contract_schedule_lines replaces it: day(s) of week,
--      target time, duration, program, date range — the real shape of a
--      WUWF insertion order.
--   3. sponsorship_position (opening/closing/mid) had no basis in the real
--      agreement, no enforcement in the placement function, and no real UI
--      — removed outright.
--   4. uw_copy.production_status was a universal pending/produced field
--      that doesn't fit a live-read message at all (the real agreement's
--      two rotating messages are executed live-read or WUWF-recorded, not
--      pushed through one production pipeline) — replaced by
--      execution_kind (live_read | recorded), which is descriptive, not a
--      workflow gate.
--   5. uw_obligation_status (active/fulfilled/at_risk) was manually set by
--      staff despite the design doc itself saying fulfillment should
--      derive from placements and broadcast events — removed; fulfillment
--      is now always computed (lib/underwriting/fulfillment.ts), never
--      stored.
--   6. Underwriting-media audio upload was write-only — inspection of the
--      actual app confirmed nothing ever reads the file back (no signed
--      URL, no <audio> element, anywhere). Removed in favor of
--      cart_identifier (already existed) as the DAD/cart reference —
--      ENCO/DAD remains the playback system of record, same call as Log's.
--   7. Affidavit-required was implicit/absent — the real agreement states
--      "Affidavits Needed — NO" explicitly. uw_contracts.affidavit_required
--      makes that a real, contract-level fact.
--   8. agreement_document_url was a bare text field, not a real attachment
--      — replaced by agreement_document_path (a real Storage object, see
--      the new underwriting-documents bucket below), so the executed
--      agreement stays an authoritative reference, not a set of manually
--      copied fields with the source discarded.
--
-- This migration also finishes the Log boundary begun in
-- 20260807210000_underwriting_placement.sql, rewritten against Log's own
-- redesign (log_local_opportunities / log_rundown_breaks / the
-- multi-item-per-break log_rundown_items — see the two log_* migrations
-- immediately before this one).

-- ============================================================================
-- Drop everything downstream of the old obligation model
-- ============================================================================
-- Order matters for the explicit drops below (children before parents);
-- CASCADE catches anything not listed (indexes, the FKs from
-- uw_affidavit_line_items, etc.). The three boundary functions and
-- Slice 3/4's two broadcast-event trigger functions aren't tracked
-- dependencies of the tables they reference (plpgsql bodies aren't parsed
-- for object dependencies), so they're dropped explicitly too, then
-- redefined below against the new schema.

drop function if exists public.log_place_underwriting_credit(uuid, uuid, uuid, text) cascade;
drop function if exists public.log_clear_underwriting_credit(uuid) cascade;
drop function if exists public.log_list_placeable_rundown_items(uuid) cascade;
drop function if exists public.uw_flag_exception_from_broadcast_event() cascade;
drop function if exists public.uw_update_makegood_from_broadcast_event() cascade;

drop table if exists public.uw_affidavit_line_items cascade;
drop table if exists public.uw_affidavits cascade;
drop table if exists public.uw_makegoods cascade;
drop table if exists public.uw_exceptions cascade;
drop table if exists public.uw_scheduled_placements cascade;
drop table if exists public.uw_placement_obligations cascade;

drop type if exists public.uw_sponsorship_position;
drop type if exists public.uw_obligation_status;
drop type if exists public.uw_quantity_period;
-- uw_copy_production_status is NOT dropped here: uw_copy.production_status
-- (the dependent column) isn't dropped until the "Copy (redesigned)" section
-- below, and a type can't be dropped while a column still depends on it.
-- The type drop lives right after that column drop instead.

-- ============================================================================
-- Underwriters (new — point 17)
-- ============================================================================

create table public.uw_underwriters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mailing_address text,
  contact_name text,
  email text,
  phone text,
  -- Free-ish text, but a consistent short label per underwriter is what
  -- makes the competitive-adjacency advisory (lib/underwriting/adjacency.ts)
  -- useful — see docs/underwriting-design.md §11.
  category text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.uw_underwriters is
  'A durable sponsor/underwriter entity (docs/underwriting-design.md §2) — replaces free-text underwriter_name on the contract. category supports the competitive-adjacency advisory; this is not a CRM.';

create index uw_underwriters_name_idx on public.uw_underwriters (name);
create index uw_underwriters_category_idx on public.uw_underwriters (category);

create trigger set_uw_underwriters_updated_at
  before update on public.uw_underwriters
  for each row execute function public.set_updated_at();

alter table public.uw_underwriters enable row level security;

grant select, insert, update on public.uw_underwriters to authenticated;

create policy uw_underwriters_select on public.uw_underwriters
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_underwriters_insert on public.uw_underwriters
  for insert to authenticated
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_underwriters_update on public.uw_underwriters
  for update to authenticated
  using (private.has_underwriting_access(auth.uid()))
  with check (private.has_underwriting_access(auth.uid()));

-- ============================================================================
-- Contracts (redesigned)
-- ============================================================================

alter table public.uw_contracts
  add column underwriter_id uuid references public.uw_underwriters (id) on delete restrict,
  add column agreement_document_path text,
  add column affidavit_required boolean not null default false,
  add column sponsorship_category text,
  add column sponsorship_total numeric(10, 2),
  add column preemption_policy text;

-- No production data (CLAUDE.md), but a stray test contract row can still
-- exist in either environment (confirmed one on production: underwriter_name
-- = 'Test UW', status = 'draft') — backfill a placeholder uw_underwriters row
-- per distinct underwriter_name before requiring underwriter_id not null and
-- dropping the free-text column it came from, rather than assuming the table
-- is always empty.
insert into public.uw_underwriters (name)
select distinct underwriter_name
from public.uw_contracts
where underwriter_name is not null and underwriter_id is null;

update public.uw_contracts c
set underwriter_id = u.id
from public.uw_underwriters u
where c.underwriter_id is null and u.name = c.underwriter_name;

alter table public.uw_contracts
  drop column underwriter_name,
  drop column agreement_document_url,
  alter column underwriter_id set not null;

comment on table public.uw_contracts is
  'The underwriting agreement itself (docs/underwriting-design.md §2): underwriter, identifier, effective dates, sponsorship total/category, affidavit requirement, attached agreement document, preemption policy, notes. Fulfillment is never stored here — see lib/underwriting/fulfillment.ts.';
comment on column public.uw_contracts.affidavit_required is
  'Most WUWF underwriting agreements do not require an affidavit (the real Autumn Beck Blackledge agreement states this explicitly: "Affidavits Needed — NO"). Staff can still generate one on request even when false — this only changes what the dashboard treats as an expected workflow item.';
comment on column public.uw_contracts.agreement_document_path is
  'Object path in the underwriting-documents bucket for the executed agreement/insertion order — a real attachment, not a bare URL field. The source agreement stays the authoritative reference; nothing here re-derives it.';
comment on column public.uw_contracts.preemption_policy is
  'Free text describing how a preempted spot is handled — the real agreement''s own language is "rescheduled within the program originally sponsored." Read by staff, not enforced by the schema.';

create index uw_contracts_underwriter_idx on public.uw_contracts (underwriter_id);

-- ============================================================================
-- Copy (redesigned)
-- ============================================================================

create type public.uw_copy_execution_kind as enum ('live_read', 'recorded');

alter table public.uw_copy
  drop column production_status,
  drop column audio_object_path,
  add column execution_kind public.uw_copy_execution_kind not null default 'live_read',
  add column label text not null default '';

comment on table public.uw_copy is
  'Script, duration, cart identifier, approval status, and whether a message is read live or WUWF-recorded (docs/underwriting-design.md §2). No universal production-status workflow — a live-read message has none to move through. Never deleted — status moves to retired instead.';
comment on column public.uw_copy.execution_kind is
  'live_read: the host reads the script live. recorded: played through ENCO/DAD via cart_identifier. Descriptive, not a production workflow gate — see CLAUDE.md''s "Underwriting domain redesign" note.';
comment on column public.uw_copy.label is
  'Short human label distinguishing rotating messages under one contract (e.g. "Message A", "Message B") — see docs/underwriting-design.md''s copy rotation section.';
comment on column public.uw_copy.cart_identifier is
  'Optional identifier for this copy''s recorded audio in ENCO/DAD, WUWF''s playback system of record. Only meaningful when execution_kind = recorded; the portal does not store or play the audio itself.';

drop type if exists public.uw_copy_production_status;

-- ============================================================================
-- Contract schedule lines (new — replaces uw_placement_obligations, point 20)
-- ============================================================================

create table public.uw_contract_schedule_lines (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.uw_contracts (id) on delete cascade,
  -- 0=Sunday..6=Saturday, matching log_schedule.days_of_week's own
  -- convention. A single line may name more than one day at the same
  -- target_time/duration — e.g. "Wednesday and Thursday ~8:06am" from the
  -- real agreement is one line with days_of_week = {3,4}, not two.
  days_of_week integer[] not null,
  -- Contractual/target air time. Nullable: a looser obligation ("12 credits
  -- a month during Morning Edition") has no single target time — see
  -- occurrence_count_override below for how that case still computes an
  -- expected-occurrence count.
  target_time time,
  duration_seconds integer not null,
  program_id uuid references public.log_programs (id) on delete restrict,
  start_date date not null,
  end_date date,
  -- Set only for an obligation that isn't cleanly day-of-week-recurring
  -- (docs/underwriting-design.md §7's "12 credits per month" case) — when
  -- set, expected occurrences over the line's date range is this value
  -- instead of the computed days_of_week x weeks-in-range count. See
  -- lib/underwriting/schedule-lines.ts.
  occurrence_count_override integer,
  makegood_policy text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint uw_contract_schedule_lines_duration_check check (duration_seconds > 0),
  constraint uw_contract_schedule_lines_days_check check (array_length(days_of_week, 1) > 0),
  constraint uw_contract_schedule_lines_date_range_check
    check (end_date is null or end_date >= start_date),
  constraint uw_contract_schedule_lines_occurrence_override_check
    check (occurrence_count_override is null or occurrence_count_override > 0)
);

comment on table public.uw_contract_schedule_lines is
  'A recurring contractual placement under a contract (docs/underwriting-design.md §2/§10) — the real shape of a WUWF insertion order (e.g. "Monday ~7:49am x 26 weeks"). Expected-occurrence math lives in lib/underwriting/schedule-lines.ts, pure and tested — four weekly lines x 26 weeks = 104 expected occurrences for the real Autumn Beck Blackledge agreement.';

create index uw_contract_schedule_lines_contract_idx on public.uw_contract_schedule_lines (contract_id);
create index uw_contract_schedule_lines_program_idx on public.uw_contract_schedule_lines (program_id);

alter table public.uw_contract_schedule_lines enable row level security;

grant select, insert, update on public.uw_contract_schedule_lines to authenticated;

create policy uw_contract_schedule_lines_select on public.uw_contract_schedule_lines
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_contract_schedule_lines_insert on public.uw_contract_schedule_lines
  for insert to authenticated
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_contract_schedule_lines_update on public.uw_contract_schedule_lines
  for update to authenticated
  using (private.has_underwriting_access(auth.uid()))
  with check (private.has_underwriting_access(auth.uid()));

-- ============================================================================
-- Scheduled placements (redesigned: obligation_id -> schedule_line_id)
-- ============================================================================

create table public.uw_scheduled_placements (
  id uuid primary key default gen_random_uuid(),
  schedule_line_id uuid not null references public.uw_contract_schedule_lines (id) on delete cascade,
  copy_id uuid not null references public.uw_copy (id) on delete restrict,
  log_rundown_item_id uuid not null references public.log_rundown_items (id) on delete cascade,
  placement_date date not null,
  scheduled_at timestamptz not null,
  program_id uuid not null references public.log_programs (id) on delete restrict,
  program_name text not null,
  break_label text,
  status public.uw_placement_status not null default 'scheduled',
  override_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.uw_scheduled_placements is
  'One schedule line''s occurrence slated into one Log rundown item on one date (docs/underwriting-design.md §2). Only ever written by log_place_underwriting_credit()/log_clear_underwriting_credit() — no insert/update grant to authenticated.';

create index uw_scheduled_placements_schedule_line_idx on public.uw_scheduled_placements (schedule_line_id);
create index uw_scheduled_placements_copy_idx on public.uw_scheduled_placements (copy_id);

create unique index uw_scheduled_placements_active_item_idx
  on public.uw_scheduled_placements (log_rundown_item_id)
  where status <> 'superseded';

alter table public.uw_scheduled_placements enable row level security;

grant select on public.uw_scheduled_placements to authenticated;

create policy uw_scheduled_placements_select on public.uw_scheduled_placements
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

-- The reverse read Log needs from this tool — additive to
-- uw_contract_schedule_lines_select above, same shape as the original
-- uw_placement_obligations_select_for_log.
create policy uw_contract_schedule_lines_select_for_log on public.uw_contract_schedule_lines
  for select to authenticated
  using (
    private.has_log_access(auth.uid())
    and exists (
      select 1 from public.uw_scheduled_placements sp
      where sp.schedule_line_id = uw_contract_schedule_lines.id
        and sp.status <> 'superseded'
    )
  );

-- ============================================================================
-- Exceptions (redesigned: obligation_id -> schedule_line_id)
-- ============================================================================

create table public.uw_exceptions (
  id uuid primary key default gen_random_uuid(),
  log_broadcast_event_id uuid not null references public.log_broadcast_events (id) on delete cascade,
  schedule_line_id uuid not null references public.uw_contract_schedule_lines (id) on delete cascade,
  original_scheduled_at timestamptz not null,
  host_action text not null,
  host_reason text,
  requirement_note text,
  compliance_judgment public.uw_compliance_judgment not null default 'pending',
  recommended_action text,
  resolution_status public.uw_resolution_status not null default 'open',
  resolution_action public.uw_resolution_action,
  resolution_notes text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint uw_exceptions_broadcast_event_unique unique (log_broadcast_event_id)
);

comment on table public.uw_exceptions is
  'An unresolved discrepancy between what a contract required and what actually aired (docs/underwriting-design.md §2). A missed/preempted credit stays unresolved until a valid makegood airs or staff make another valid disposition — created only by uw_flag_exception_from_broadcast_event(), never a bare insert.';

create index uw_exceptions_schedule_line_idx on public.uw_exceptions (schedule_line_id);
create index uw_exceptions_resolution_status_idx on public.uw_exceptions (resolution_status);

alter table public.uw_exceptions enable row level security;

grant select, update on public.uw_exceptions to authenticated;

create policy uw_exceptions_select on public.uw_exceptions
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_exceptions_update on public.uw_exceptions
  for update to authenticated
  using (private.has_underwriting_access(auth.uid()))
  with check (private.has_underwriting_access(auth.uid()));

create trigger uw_exceptions_guard_resolution
  before update on public.uw_exceptions
  for each row execute function public.uw_guard_exception_resolution();

create policy log_broadcast_events_select_for_underwriting on public.log_broadcast_events
  for select to authenticated
  using (
    private.has_underwriting_access(auth.uid())
    and exists (
      select 1 from public.uw_exceptions ue
      where ue.log_broadcast_event_id = log_broadcast_events.id
    )
  );

create policy log_broadcast_events_select_for_underwriting_placements on public.log_broadcast_events
  for select to authenticated
  using (
    private.has_underwriting_access(auth.uid())
    and exists (
      select 1 from public.uw_scheduled_placements sp
      where sp.log_rundown_item_id = log_broadcast_events.rundown_item_id
    )
  );

-- ============================================================================
-- Makegoods (redesigned: obligation_id -> schedule_line_id)
-- ============================================================================

create table public.uw_makegoods (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.uw_exceptions (id) on delete cascade,
  schedule_line_id uuid not null references public.uw_contract_schedule_lines (id) on delete cascade,
  scheduled_placement_id uuid references public.uw_scheduled_placements (id) on delete set null,
  status public.uw_makegood_status not null default 'scheduled',
  scheduled_for timestamptz,
  aired_log_broadcast_event_id uuid references public.log_broadcast_events (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.uw_makegoods is
  'A scheduled or aired alternate airing resolving an exception (docs/underwriting-design.md §2), per the real agreement''s own policy: a preempted spot is rescheduled within the program originally sponsored.';

create index uw_makegoods_exception_idx on public.uw_makegoods (exception_id);
create index uw_makegoods_schedule_line_idx on public.uw_makegoods (schedule_line_id);

create unique index uw_makegoods_active_placement_idx
  on public.uw_makegoods (scheduled_placement_id)
  where scheduled_placement_id is not null and status <> 'cancelled';

alter table public.uw_makegoods enable row level security;

grant select, insert, update on public.uw_makegoods to authenticated;

create policy uw_makegoods_select on public.uw_makegoods
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_makegoods_insert on public.uw_makegoods
  for insert to authenticated
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_makegoods_update on public.uw_makegoods
  for update to authenticated
  using (private.has_underwriting_access(auth.uid()))
  with check (private.has_underwriting_access(auth.uid()));

-- ============================================================================
-- Affidavits (recreated — same shape, contract_id unaffected)
-- ============================================================================

create table public.uw_affidavits (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.uw_contracts (id) on delete cascade,
  campaign_period_start date not null,
  campaign_period_end date not null,
  generated_at timestamptz not null default now(),
  generated_by uuid references public.profiles (id) on delete set null,
  certifying_staff_id uuid references public.profiles (id) on delete set null,
  certification_text text,
  report_identifier text not null,
  status public.uw_affidavit_status not null default 'draft',
  constraint uw_affidavits_period_range_check check (campaign_period_end >= campaign_period_start)
);

comment on table public.uw_affidavits is
  'A proof-of-performance document for a contract''s campaign period (docs/underwriting-design.md §2). Generating one is possible even when the contract''s affidavit_required is false — staff can always produce one on request; only the dashboard treats affidavit_required = true as an expected workflow item.';

create index uw_affidavits_contract_idx on public.uw_affidavits (contract_id);

create table public.uw_affidavit_line_items (
  affidavit_id uuid not null references public.uw_affidavits (id) on delete cascade,
  log_broadcast_event_id uuid not null references public.log_broadcast_events (id) on delete restrict,
  scheduled_placement_id uuid not null references public.uw_scheduled_placements (id) on delete restrict,
  primary key (affidavit_id, log_broadcast_event_id)
);

comment on table public.uw_affidavit_line_items is
  'The durable link between a certified affidavit and the specific airings that support it — enables both audit and regeneration without re-deriving which broadcast events counted.';

create index uw_affidavit_line_items_placement_idx on public.uw_affidavit_line_items (scheduled_placement_id);

alter table public.uw_affidavits enable row level security;
alter table public.uw_affidavit_line_items enable row level security;

grant select, insert, update on public.uw_affidavits to authenticated;
grant select, insert on public.uw_affidavit_line_items to authenticated;

create policy uw_affidavits_select on public.uw_affidavits
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_affidavits_insert on public.uw_affidavits
  for insert to authenticated
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_affidavits_update on public.uw_affidavits
  for update to authenticated
  using (private.has_underwriting_access(auth.uid()))
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_affidavit_line_items_select on public.uw_affidavit_line_items
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_affidavit_line_items_insert on public.uw_affidavit_line_items
  for insert to authenticated
  with check (private.has_underwriting_access(auth.uid()));

create trigger uw_affidavits_guard_certification
  before update on public.uw_affidavits
  for each row execute function public.uw_guard_affidavit_certification();

-- ============================================================================
-- Log boundary: widen log_rundown_items for underwriting credits
-- ============================================================================
-- Deferred from the Log migration itself per that file's own header —
-- mirrors the original 20260807210000_underwriting_placement.sql's shape.

alter table public.log_rundown_items
  add column underwriting_copy_id uuid references public.uw_copy (id) on delete restrict;

alter table public.log_rundown_items drop constraint log_rundown_items_item_kind_shape_check;
alter table public.log_rundown_items drop constraint log_rundown_items_item_kind_check;

alter table public.log_rundown_items add constraint log_rundown_items_item_kind_check
  check (item_kind in ('content', 'live_read', 'weather', 'underwriting_credit'));

alter table public.log_rundown_items add constraint log_rundown_items_item_kind_shape_check check (
  (item_kind = 'content' and content_item_id is not null and live_read_title is null and underwriting_copy_id is null)
  or
  (item_kind = 'live_read' and content_item_id is null and live_read_title is not null and underwriting_copy_id is null)
  or
  (item_kind = 'weather' and content_item_id is null and live_read_title is null and underwriting_copy_id is null)
  or
  (item_kind = 'underwriting_credit' and content_item_id is null and live_read_title is null and underwriting_copy_id is not null)
);

comment on column public.log_rundown_items.underwriting_copy_id is
  'Set only when item_kind = underwriting_credit. References uw_copy, owned by Underwriting & Traffic. Only ever set by log_place_underwriting_credit() — never a bare update through RLS.';

-- Underwriting-credit items are excluded from the plain delete grant's
-- practical use — log_clear_underwriting_credit() is the only path that
-- removes one, so it can also mark the placement superseded atomically.
-- (The RLS delete policy itself stays permissive at the row-security layer,
-- matching clearRundownItem's existing item_kind = 'content' scoping in
-- application code rather than a second, narrower policy.)

-- The host must never be told to "go to Underwriting" to read a credit's
-- script (point 14 of the redesign) — Log needs a real read of uw_copy for
-- exactly the copy rows it can already see referenced from a
-- log_rundown_items row, the same "reverse read" shape as the schedule
-- lines policy above. Underwriting remains the source of truth; this is a
-- read, never a write.
create policy uw_copy_select_for_log on public.uw_copy
  for select to authenticated
  using (
    private.has_log_access(auth.uid())
    and exists (
      select 1 from public.log_rundown_items lri
      where lri.underwriting_copy_id = uw_copy.id
    )
  );

-- ============================================================================
-- Boundary functions (rewritten for breaks/items + schedule lines)
-- ============================================================================

create or replace function public.log_list_placeable_rundown_breaks(p_schedule_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.uw_contract_schedule_lines;
  v_breaks jsonb;
begin
  if auth.uid() is null or not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_line from public.uw_contract_schedule_lines where id = p_schedule_line_id;
  if not found then
    return jsonb_build_object('error', 'unknown_schedule_line');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'break_id', b.id,
    'rundown_id', lr.id,
    'air_date', lr.air_date,
    'scheduled_at', b.scheduled_at,
    'label', b.label,
    'program_name', lp.name,
    'remaining_seconds', b.available_duration_seconds - coalesce(occupied.total, 0)
  ) order by b.scheduled_at), '[]'::jsonb)
  into v_breaks
  from public.log_rundown_breaks b
  join public.log_rundowns lr on lr.id = b.rundown_id
  join public.log_programs lp on lp.id = lr.program_id
  left join lateral (
    select sum(i.planned_duration_seconds) as total
    from public.log_rundown_items i
    where i.break_id = b.id
  ) occupied on true
  where 'underwriting_credit' = any(b.permitted_content_types)
    and (b.allow_multiple or coalesce((
      select count(*) from public.log_rundown_items i2 where i2.break_id = b.id
    ), 0) = 0)
    and lr.air_date >= v_line.start_date
    and (v_line.end_date is null or lr.air_date <= v_line.end_date)
    and (v_line.program_id is null or lr.program_id = v_line.program_id)
    and extract(dow from lr.air_date)::integer = any(v_line.days_of_week);

  return jsonb_build_object('ok', true, 'breaks', v_breaks);
end;
$$;

comment on function public.log_list_placeable_rundown_breaks(uuid) is
  'Every currently-open Log rundown break eligible for this schedule line (permits underwriting_credit, has remaining capacity, within the line''s program/day-of-week/date eligibility). Security definer: the caller may have no Log access at all.';

revoke execute on function public.log_list_placeable_rundown_breaks(uuid) from public, anon;
grant execute on function public.log_list_placeable_rundown_breaks(uuid) to authenticated;

create or replace function public.log_place_underwriting_credit(
  p_break_id uuid,
  p_schedule_line_id uuid,
  p_copy_id uuid,
  p_override_reason text default null
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
  v_contract public.uw_contracts;
  v_copy public.uw_copy;
  v_linked boolean;
  v_needs_override boolean;
  v_occupied integer;
  v_item_count integer;
  v_next_position integer;
  v_item_id uuid;
  v_placement_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_break from public.log_rundown_breaks where id = p_break_id;
  if not found then
    return jsonb_build_object('error', 'unknown_break');
  end if;
  if not ('underwriting_credit' = any(v_break.permitted_content_types)) then
    return jsonb_build_object('error', 'break_not_eligible');
  end if;

  select count(*), coalesce(sum(planned_duration_seconds), 0)
    into v_item_count, v_occupied
    from public.log_rundown_items where break_id = p_break_id;

  if v_item_count > 0 and not v_break.allow_multiple then
    return jsonb_build_object('error', 'break_occupied');
  end if;

  select * into v_rundown from public.log_rundowns where id = v_break.rundown_id;
  select * into v_program from public.log_programs where id = v_rundown.program_id;

  select * into v_line from public.uw_contract_schedule_lines where id = p_schedule_line_id;
  if not found then
    return jsonb_build_object('error', 'unknown_schedule_line');
  end if;

  select * into v_contract from public.uw_contracts where id = v_line.contract_id;
  if v_contract.status <> 'active' then
    return jsonb_build_object('error', 'contract_not_active');
  end if;

  if v_line.program_id is not null and v_line.program_id <> v_rundown.program_id then
    return jsonb_build_object('error', 'program_not_eligible');
  end if;

  select * into v_copy from public.uw_copy where id = p_copy_id;
  if not found then
    return jsonb_build_object('error', 'unknown_copy');
  end if;

  select exists(
    select 1 from public.uw_contract_copy
    where contract_id = v_line.contract_id and copy_id = p_copy_id
  ) into v_linked;
  if not v_linked then
    return jsonb_build_object('error', 'copy_not_linked');
  end if;

  if v_copy.duration_seconds is null then
    return jsonb_build_object('error', 'copy_duration_unknown');
  end if;
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
    program_id, program_name, break_label, status, override_reason, created_by
  ) values (
    p_schedule_line_id, p_copy_id, v_item_id, v_rundown.air_date, v_break.scheduled_at,
    v_rundown.program_id, v_program.name, v_break.label,
    'scheduled', case when v_needs_override then p_override_reason else null end, auth.uid()
  )
  returning id into v_placement_id;

  return jsonb_build_object('ok', true, 'placement_id', v_placement_id, 'item_id', v_item_id);
end;
$$;

comment on function public.log_place_underwriting_credit(uuid, uuid, uuid, text) is
  'The only path that ever creates an item_kind = underwriting_credit row. Security definer so the guard (a permitted break with room; an active contract; program-eligible schedule line; linked, eligible copy; an explicit manager-checked override otherwise) lives in one place instead of a blanket RLS policy.';

revoke execute on function public.log_place_underwriting_credit(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.log_place_underwriting_credit(uuid, uuid, uuid, text) to authenticated;

create or replace function public.log_clear_underwriting_credit(p_placement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placement public.uw_scheduled_placements;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_placement from public.uw_scheduled_placements where id = p_placement_id;
  if not found then
    return jsonb_build_object('error', 'unknown_placement');
  end if;
  if v_placement.status = 'superseded' then
    return jsonb_build_object('error', 'already_cleared');
  end if;

  delete from public.log_rundown_items where id = v_placement.log_rundown_item_id;

  update public.uw_scheduled_placements
  set status = 'superseded'
  where id = p_placement_id;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.log_clear_underwriting_credit(uuid) is
  'Undoes a placement: deletes the underwriting-credit rundown item (an ordinary item removal, now that a break can hold several) and marks the placement superseded, never deleted, matching log_broadcast_events'' append-only precedent for as-planned history.';

revoke execute on function public.log_clear_underwriting_credit(uuid) from public, anon;
grant execute on function public.log_clear_underwriting_credit(uuid) to authenticated;

-- log_list_programs: the human-readable program picker (point 22) —
-- Underwriting staff have no RLS access to log_programs at all, so naming
-- eligible programs on a schedule line needs the same security-definer
-- read every other cross-tool lookup here uses.

create or replace function public.log_list_programs()
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
    else jsonb_build_object('ok', true, 'programs', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name)
      from public.log_programs
    ), '[]'::jsonb))
  end;
$$;

comment on function public.log_list_programs() is
  'Human-readable program list for pickers outside Log (point 22 of the redesign: no raw UUID entry anywhere in staff-facing UI). Security definer: an Underwriting-only caller has no RLS access to log_programs.';

revoke execute on function public.log_list_programs() from public, anon;
grant execute on function public.log_list_programs() to authenticated;

-- ============================================================================
-- Broadcast-event triggers (redefined against the new schedule_line model)
-- ============================================================================

create or replace function public.uw_flag_exception_from_broadcast_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.log_rundown_items;
  v_placement public.uw_scheduled_placements;
begin
  if new.outcome = 'aired_as_scheduled' then
    return new;
  end if;

  select * into v_item from public.log_rundown_items where id = new.rundown_item_id;
  if not found or v_item.item_kind <> 'underwriting_credit' then
    return new;
  end if;

  select * into v_placement
  from public.uw_scheduled_placements
  where log_rundown_item_id = new.rundown_item_id
    and status <> 'superseded'
  order by created_at desc
  limit 1;
  if not found then
    return new;
  end if;

  insert into public.uw_exceptions (
    log_broadcast_event_id, schedule_line_id, original_scheduled_at, host_action, host_reason
  ) values (
    new.id, v_placement.schedule_line_id, v_placement.scheduled_at, new.outcome::text, new.reason::text
  )
  on conflict (log_broadcast_event_id) do nothing;

  return new;
end;
$$;

comment on function public.uw_flag_exception_from_broadcast_event() is
  'Replaces a job queue this repo doesn''t have: every underwriting-kind broadcast event whose outcome is not aired_as_scheduled gets an open uw_exceptions row the moment a host records it. A missed credit is never silently treated as fulfilled — see lib/underwriting/fulfillment.ts.';

revoke execute on function public.uw_flag_exception_from_broadcast_event() from public, anon, authenticated;

create trigger uw_flag_exception_after_broadcast_event
  after insert on public.log_broadcast_events
  for each row execute function public.uw_flag_exception_from_broadcast_event();

create or replace function public.uw_update_makegood_from_broadcast_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placement_id uuid;
begin
  if new.outcome <> 'aired_as_scheduled' then
    return new;
  end if;

  select sp.id into v_placement_id
  from public.uw_scheduled_placements sp
  where sp.log_rundown_item_id = new.rundown_item_id
    and sp.status <> 'superseded'
  order by sp.created_at desc
  limit 1;

  if v_placement_id is null then
    return new;
  end if;

  update public.uw_makegoods
  set status = 'aired',
      aired_log_broadcast_event_id = new.id
  where scheduled_placement_id = v_placement_id
    and status = 'scheduled';

  return new;
end;
$$;

comment on function public.uw_update_makegood_from_broadcast_event() is
  'Flips a scheduled makegood to aired the moment its own placement''s rundown item is confirmed aired as scheduled.';

revoke execute on function public.uw_update_makegood_from_broadcast_event() from public, anon, authenticated;

create trigger uw_makegoods_update_from_broadcast_event
  after insert on public.log_broadcast_events
  for each row execute function public.uw_update_makegood_from_broadcast_event();

-- ============================================================================
-- Storage: remove underwriting-media's policies (write-only, point 27), add
-- underwriting-documents (real attachment, point 19)
-- ============================================================================
-- The bucket row itself can't be dropped from a migration — Supabase's
-- storage.protect_delete() trigger rejects a direct DELETE against
-- storage.objects/storage.buckets ("Use the Storage API instead"),
-- confirmed while applying this migration (same finding as Log's own
-- log-media removal, 20260808140000_log_content_dad_and_media_removal.sql).
-- Dropping the policies alone fully locks it down — RLS defaults to deny
-- with no policy present. Removing the inert row is a follow-up via the
-- dashboard or `supabase storage rm`, not a migration statement.

drop policy if exists underwriting_media_select on storage.objects;
drop policy if exists underwriting_media_insert on storage.objects;
drop policy if exists underwriting_media_update on storage.objects;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'underwriting-documents',
  'underwriting-documents',
  false,
  52428800, -- 50 MiB — a signed insertion order/agreement, not media
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy underwriting_documents_select on storage.objects
  for select to authenticated
  using (bucket_id = 'underwriting-documents' and private.has_underwriting_access(auth.uid()));

create policy underwriting_documents_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'underwriting-documents' and private.has_underwriting_access(auth.uid()));

create policy underwriting_documents_update on storage.objects
  for update to authenticated
  using (bucket_id = 'underwriting-documents' and private.has_underwriting_access(auth.uid()))
  with check (bucket_id = 'underwriting-documents' and private.has_underwriting_access(auth.uid()));
