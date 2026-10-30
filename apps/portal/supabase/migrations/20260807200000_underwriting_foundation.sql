-- Underwriting & Traffic: the eighth tool on the portal foundation, and the
-- second of three splitting the WUWF Unified Broadcast Rundown and Traffic
-- System spec (see docs/broadcast-operations-strategy.md). Log owns the
-- operational spine this tool consumes and writes into; see
-- docs/underwriting-design.md for the full product and architecture
-- rationale, at the same depth as docs/log-design.md.
--
-- This migration is Slice 1 of milestone 1 ("Foundation"), covering exactly
-- Workflows A (creating/maintaining a contract) and B (managing underwriting
-- copy) from the design doc — four tables, no Log-boundary work yet. Manual
-- placement into Log's rundown (Workflow C — the two-way boundary: writing
-- log_rundown_items via a security definer function, reading
-- log_broadcast_events, and the reverse read Log needs for its own
-- mid-broadcast "move" validation), the pre/post-broadcast queues
-- (Workflows D/E), makegoods (F), and affidavits (G) all follow in later
-- slices, each with its own migration — see docs/underwriting-design.md §7
-- and CLAUDE.md's Underwriting section for the planned breakdown. Building
-- all nine of §5's tables plus the log_rundown_items columns before any of
-- that later code exists to use them would be exactly the speculative-schema
-- mistake CLAUDE.md warns against elsewhere.
--
-- What's different from Log's own Slice 1, worth knowing before extending
-- this:
--
--   1. This slice has no elevated role. docs/underwriting-design.md §6 says
--      plainly: "Ordinary traffic staff do everything else: contracts,
--      copy, placement, exception triage up to but not including a
--      waive/certify decision." Every action this slice adds — creating and
--      updating a contract, an obligation, or a piece of copy — is on that
--      "everything else" list. private.is_underwriting_manager() (the
--      elevation for waiving an obligation, certifying an affidavit, and
--      overriding expired/unapproved copy into a placement) is deliberately
--      NOT defined here — there is nothing yet for it to gate. It gets
--      added in whichever later slice adds the first privileged action that
--      actually needs it, the same discipline that keeps a nullable column
--      with no FK target out of a migration before the table it points to
--      exists.
--   2. Unlike Log's log_clock_versions/log_clock_slots, nothing here is
--      insert-only. A contract's status, an obligation's fulfillment
--      status, and a copy's approval/production status are all expected to
--      be corrected in place — ordinary update, no versioning concern, same
--      shape Log's own content library (not its clocks) uses.
--
-- Tables are prefixed uw_ per CLAUDE.md's directory conventions.

create type public.uw_contract_status as enum ('draft', 'active', 'expired', 'terminated');
create type public.uw_quantity_period as enum ('weekly', 'monthly', 'campaign_total');
create type public.uw_sponsorship_position as enum ('opening', 'closing', 'mid');
-- Derived from scheduled placements and broadcast events once later slices
-- exist to compute it (docs/underwriting-design.md §3A: "not a field someone
-- updates by hand") — stored as a plain column for now since nothing writes
-- it yet either way; a generated/triggered column is a later slice's
-- concern once uw_scheduled_placements exists to derive it from.
create type public.uw_obligation_status as enum ('active', 'fulfilled', 'at_risk');
create type public.uw_copy_approval_status as enum ('draft', 'approved', 'expired', 'retired');
create type public.uw_copy_production_status as enum ('pending', 'produced');

-- Contracts --------------------------------------------------------------------

create table public.uw_contracts (
  id uuid primary key default gen_random_uuid(),
  underwriter_name text not null,
  contract_identifier text not null,
  agreement_document_url text,
  effective_from date not null,
  effective_to date,
  status public.uw_contract_status not null default 'draft',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uw_contracts_effective_range_check
    check (effective_to is null or effective_to >= effective_from)
);

comment on table public.uw_contracts is
  'The underwriting agreement itself (docs/underwriting-design.md §2): underwriter, identifier, effective dates, fulfillment status, notes. Never deleted — status moves to terminated instead.';

create index uw_contracts_status_idx on public.uw_contracts (status);
create index uw_contracts_underwriter_idx on public.uw_contracts (underwriter_name);

-- Placement obligations ----------------------------------------------------------

create table public.uw_placement_obligations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.uw_contracts (id) on delete cascade,
  description text not null,
  quantity_required integer not null,
  quantity_period public.uw_quantity_period not null,
  duration_seconds integer not null,
  -- uuid[] -> log_programs, same as log_content_items.eligible_program_ids:
  -- an array column has no native FK, so this is validated in application
  -- code against listPrograms(), not the database, matching that precedent.
  eligible_program_ids uuid[] not null default '{}'::uuid[],
  eligible_days_of_week integer[],
  eligible_daypart text,
  -- Spacing/clustering guidance as free text, not a rules DSL — see
  -- docs/underwriting-design.md §7 on why a structured distribution engine
  -- is deferred until real contract patterns have exercised the manual path.
  distribution_rule text,
  sponsorship_position public.uw_sponsorship_position,
  start_date date not null,
  end_date date,
  status public.uw_obligation_status not null default 'active',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint uw_placement_obligations_quantity_check check (quantity_required > 0),
  constraint uw_placement_obligations_duration_check check (duration_seconds > 0),
  constraint uw_placement_obligations_date_range_check
    check (end_date is null or end_date >= start_date)
);

comment on table public.uw_placement_obligations is
  'A distinct requirement bundled under a contract (docs/underwriting-design.md §2) — quantity, period, program/daypart eligibility, duration, sponsorship position. Each tracked separately: "12 credits a month" and "3 credits a week only during Morning Edition" are different fulfillment problems under the same contract.';

create index uw_placement_obligations_contract_idx on public.uw_placement_obligations (contract_id);
create index uw_placement_obligations_status_idx on public.uw_placement_obligations (status);

-- Copy ---------------------------------------------------------------------------

create table public.uw_copy (
  id uuid primary key default gen_random_uuid(),
  script text,
  -- Object path in the underwriting-media bucket — see Storage below.
  audio_object_path text,
  duration_seconds integer,
  cart_identifier text,
  effective_from date not null default current_date,
  effective_to date,
  approval_status public.uw_copy_approval_status not null default 'draft',
  production_status public.uw_copy_production_status not null default 'pending',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint uw_copy_duration_check check (duration_seconds is null or duration_seconds > 0),
  constraint uw_copy_effective_range_check
    check (effective_to is null or effective_to >= effective_from)
);

comment on table public.uw_copy is
  'Script/audio, duration, cart identifier, approval/production status (docs/underwriting-design.md §2). A contract''s obligation says how often; its copy says what plays. Never deleted — status moves to retired instead.';

create index uw_copy_approval_status_idx on public.uw_copy (approval_status);

create table public.uw_contract_copy (
  contract_id uuid not null references public.uw_contracts (id) on delete cascade,
  copy_id uuid not null references public.uw_copy (id) on delete cascade,
  primary key (contract_id, copy_id)
);

comment on table public.uw_contract_copy is
  'Many-to-many: a copy version can serve more than one contract (a shared underwriter umbrella campaign), and a contract can have more than one copy version in rotation.';

-- updated_at maintenance -------------------------------------------------------

create trigger set_uw_contracts_updated_at
  before update on public.uw_contracts
  for each row execute function public.set_updated_at();

-- Authorization helper ------------------------------------------------------------
-- In `private`, never `public` — see 20260724120000_private_authz_functions.sql.
-- Just membership for this slice; see file header on why
-- is_underwriting_manager() isn't defined yet.

create function private.has_underwriting_access(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tool_access ta
    join public.tools t on t.id = ta.tool_id
    join public.profiles p on p.id = uid
    where ta.user_id = uid
      and t.key = 'underwriting'
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

revoke execute on function private.has_underwriting_access(uuid) from public, anon;
grant execute on function private.has_underwriting_access(uuid) to authenticated;

-- Row Level Security ------------------------------------------------------------
-- Member-level throughout — see file header. No delete grant on any table,
-- matching the deactivate-don't-delete precedent every other tool's
-- reference data (ep_criteria, log_content_items, etc.) already follows.

alter table public.uw_contracts enable row level security;
alter table public.uw_placement_obligations enable row level security;
alter table public.uw_copy enable row level security;
alter table public.uw_contract_copy enable row level security;

grant select, insert, update on public.uw_contracts to authenticated;
grant select, insert, update on public.uw_placement_obligations to authenticated;
grant select, insert, update on public.uw_copy to authenticated;
grant select, insert, delete on public.uw_contract_copy to authenticated;

create policy uw_contracts_select on public.uw_contracts
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_contracts_insert on public.uw_contracts
  for insert to authenticated
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_contracts_update on public.uw_contracts
  for update to authenticated
  using (private.has_underwriting_access(auth.uid()))
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_placement_obligations_select on public.uw_placement_obligations
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_placement_obligations_insert on public.uw_placement_obligations
  for insert to authenticated
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_placement_obligations_update on public.uw_placement_obligations
  for update to authenticated
  using (private.has_underwriting_access(auth.uid()))
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_copy_select on public.uw_copy
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_copy_insert on public.uw_copy
  for insert to authenticated
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_copy_update on public.uw_copy
  for update to authenticated
  using (private.has_underwriting_access(auth.uid()))
  with check (private.has_underwriting_access(auth.uid()));

-- uw_contract_copy gets a delete grant (unlike everything else here) because
-- unlinking a copy from a contract isn't a lifecycle event worth a status
-- column — it's an ordinary join-row removal, same as any other plain
-- many-to-many link in this schema.
create policy uw_contract_copy_select on public.uw_contract_copy
  for select to authenticated
  using (private.has_underwriting_access(auth.uid()));

create policy uw_contract_copy_insert on public.uw_contract_copy
  for insert to authenticated
  with check (private.has_underwriting_access(auth.uid()));

create policy uw_contract_copy_delete on public.uw_contract_copy
  for delete to authenticated
  using (private.has_underwriting_access(auth.uid()));

-- Storage -------------------------------------------------------------------------
-- Private bucket for copy audio, same trust model and fixed-object-path/
-- upsert:true convention as log-media (see 20260806160000_log_content_
-- library.sql) — uniform membership access, no per-row ownership.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'underwriting-media',
  'underwriting-media',
  false,
  536870912, -- 512 MiB — spot audio, not full-length interviews
  array['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy underwriting_media_select on storage.objects
  for select to authenticated
  using (bucket_id = 'underwriting-media' and private.has_underwriting_access(auth.uid()));

create policy underwriting_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'underwriting-media' and private.has_underwriting_access(auth.uid()));

create policy underwriting_media_update on storage.objects
  for update to authenticated
  using (bucket_id = 'underwriting-media' and private.has_underwriting_access(auth.uid()))
  with check (bucket_id = 'underwriting-media' and private.has_underwriting_access(auth.uid()));

-- Registry row ------------------------------------------------------------------
-- Upsert rather than update, per the audience-listening/remote-interview
-- lesson: a bare update silently no-ops on a project whose seed never ran.

insert into public.tools (key, name, description, route, status, enabled, default_access, sort_order)
values (
  'underwriting',
  'Underwriting & Traffic',
  'Contracts, copy, and credit placement for on-air underwriting obligations.',
  '/underwriting',
  'available',
  true,
  'invite_only',
  8
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  route = excluded.route,
  status = excluded.status,
  enabled = excluded.enabled;
