-- Program-log import: hosts build a day's rundowns by uploading the
-- station's existing DAD/traffic-system Word export, before Underwriting &
-- Traffic staff have adopted their companion tool. See
-- docs/log-design.md's "Importing the daily program log" section and
-- CLAUDE.md's dated note; the parser/planner live in
-- src/lib/log/program-log-import.ts and program-log-plan.ts, the screen at
-- src/app/(portal)/log/import/.
--
-- Four connected pieces, one relationship (the export is the source of a
-- day's structure, so imported rundowns carry it directly):
--
-- 1. log_rundowns.source distinguishes an imported rundown from a
--    clock-generated one. syncRundownBreaks() and generation's
--    assignment auto-placement are generation-path concerns and skip
--    imported rundowns — an imported rundown's breaks came from the
--    export, not from the clock's local opportunities, so "catching up
--    with the clock" would only manufacture duplicates beside them.
--
-- 2. log_rundown_breaks.local_opportunity_id becomes nullable. A
--    generated break still always references the opportunity it was
--    generated from; an imported break has no opportunity behind it — the
--    export's own "UW Credit (mm:ss)" avail marker (or a directly-listed
--    content row) is its provenance, snapshotted into the same
--    label/requirement/permitted_content_types/scheduled_at/
--    available_duration_seconds columns every break already carries.
--    Downstream consumers (the timing engine, the builder screen,
--    broadcast events, Underwriting's break reads) work off those
--    snapshot columns, not the opportunity reference, so both kinds of
--    break behave identically past this point. The partial unique index
--    is the imported counterpart of the generated-path's
--    (rundown_id, local_opportunity_id, scheduled_at) constraint: one
--    imported break per instant per rundown, so re-importing a corrected
--    export is additive rather than duplicating
--    (20260808220000_log_rundown_breaks_dedup_and_unique.sql precedent).
--
-- 3. uw_copy.underwriter_id ties a copy row to its underwriter directly.
--    Until now that linkage only existed through uw_contract_copy →
--    uw_contracts.underwriter_id, which is exactly the piece a
--    hosts-first import cannot supply: the export carries the underwriter
--    name, cart, and script, but which *contract* an airing serves is
--    knowledge only the traffic office has. Import creates real
--    uw_underwriters/uw_copy rows and leaves contract attribution to
--    adoption day — a deliberate decision (recorded in
--    docs/log-design.md) over both alternatives: fabricating shell
--    contracts (invented dates/quantities in the tables affidavits and
--    fulfillment compute from) and parking credits in the Log content
--    library (a migrate-and-retire step at adoption instead of data
--    that's already real). Nullable: existing copy keeps contract-derived
--    attribution; traffic can backfill later.
--
-- 4. Imported credits are ordinary item_kind = 'underwriting_credit'
--    log_rundown_items referencing uw_copy with NO uw_scheduled_placements
--    row behind them — a state the machinery already tolerates
--    (uw_flag_exception_from_broadcast_event() returns without raising an
--    exception when no placement references the item, correct while no
--    traffic staff triages a queue). The security definer functions below
--    are the only way a Log-only session touches uw_* tables at all;
--    RLS on uw_underwriters/uw_copy stays staff-only for everything else.

-- 1. Rundown provenance ------------------------------------------------------

alter table public.log_rundowns
  add column source text not null default 'generated'
    constraint log_rundowns_source_check check (source in ('generated', 'imported'));

comment on column public.log_rundowns.source is
  'How this rundown''s breaks came to exist: generated (from the clock version''s local opportunities — Workflow E) or imported (from a DAD program-log export; breaks carry no local_opportunity_id). Generation-path catch-up (syncRundownBreaks, assignment auto-placement) skips imported rundowns.';

-- 2. Imported breaks ---------------------------------------------------------

alter table public.log_rundown_breaks
  alter column local_opportunity_id drop not null;

comment on column public.log_rundown_breaks.local_opportunity_id is
  'The local opportunity this break was generated from — null on an imported rundown''s breaks, whose provenance is the uploaded program-log export itself (log_rundowns.source = imported). Every consumer past generation reads the break''s own snapshot columns, never through this reference.';

create unique index log_rundown_breaks_imported_unique
  on public.log_rundown_breaks (rundown_id, scheduled_at)
  where local_opportunity_id is null;

-- 3. Copy → underwriter, without a contract ----------------------------------

alter table public.uw_copy
  add column underwriter_id uuid references public.uw_underwriters (id) on delete restrict;

create index uw_copy_underwriter_idx on public.uw_copy (underwriter_id);

comment on column public.uw_copy.underwriter_id is
  'Direct attribution of a copy row to its underwriter, independent of any contract — set by the program-log import (which knows the underwriter but not the contract) and nullable for pre-existing rows, whose attribution runs through uw_contract_copy → uw_contracts.underwriter_id as before.';

comment on column public.log_rundown_items.underwriting_copy_id is
  'Set only when item_kind = underwriting_credit. References uw_copy, owned by Underwriting & Traffic. Written by log_place_underwriting_credit() (a placement-backed credit) or by the program-log import (a placement-less credit — no uw_scheduled_placements row until traffic adopts and attributes it); removed only via log_clear_underwriting_credit() or log_delete_unplaced_credit_item() respectively.';

-- 4. The import's read/write boundary into uw_* ------------------------------

-- Everything a Log member needs to match the export's credits against what
-- already exists: every underwriter, every copy row with its identifying
-- fields. Deliberately a security definer read rather than an RLS policy —
-- uw_copy/uw_underwriters RLS stays staff-only, and this keeps the
-- Log-facing surface enumerable (same reasoning as
-- log_list_placeable_rundown_breaks).
create function public.log_import_list_underwriting_copy()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not private.has_log_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  return jsonb_build_object(
    'underwriters',
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) order by u.name)
        from public.uw_underwriters u
      ),
      '[]'::jsonb
    ),
    'copy',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'underwriter_id', c.underwriter_id,
            'label', c.label,
            'cart_identifier', c.cart_identifier,
            'script', c.script,
            'duration_seconds', c.duration_seconds,
            'approval_status', c.approval_status
          )
          order by c.created_at
        )
        from public.uw_copy c
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke execute on function public.log_import_list_underwriting_copy() from public, anon;
grant execute on function public.log_import_list_underwriting_copy() to authenticated;

-- Find-or-create an underwriter by name (case-insensitive), so re-importing
-- the same export — or two hosts importing the same morning — never mints a
-- duplicate. Creation only; never updates an existing row's fields.
create function public.log_import_underwriter(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  if auth.uid() is null or not private.has_log_access(auth.uid()) then
    raise exception 'forbidden';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'underwriter name is required';
  end if;

  select id into v_id
  from public.uw_underwriters
  where lower(name) = lower(v_name)
  order by created_at
  limit 1;
  if found then
    return v_id;
  end if;

  insert into public.uw_underwriters (name, created_by)
  values (v_name, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.log_import_underwriter(text) from public, anon;
grant execute on function public.log_import_underwriter(text) to authenticated;

-- Find-or-create one copy row under an underwriter. Identity for the
-- find-or-create is (underwriter, cart, label) — the DAD cart number plus
-- the export's own copy label ("Copy 1", "expo 2") is how the station
-- itself distinguishes rotating messages. Approval status is 'approved':
-- this copy is transcribed from the station's own air log, not drafted
-- here. execution_kind mirrors what the export shows — a cart number means
-- DAD plays a produced spot ('recorded'); no cart means an announcer reads
-- it ('live_read').
create function public.log_import_underwriting_copy(
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
begin
  if auth.uid() is null or not private.has_log_access(auth.uid()) then
    raise exception 'forbidden';
  end if;

  v_label := btrim(coalesce(p_label, ''));
  v_cart := nullif(btrim(coalesce(p_cart_identifier, '')), '');
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
    return v_id;
  end if;

  insert into public.uw_copy (
    underwriter_id, label, cart_identifier, script, duration_seconds,
    execution_kind, approval_status, created_by
  ) values (
    p_underwriter_id, v_label, v_cart, nullif(btrim(coalesce(p_script, '')), ''),
    case when p_duration_seconds > 0 then p_duration_seconds end,
    case when v_cart is null then 'live_read'::public.uw_copy_execution_kind
         else 'recorded'::public.uw_copy_execution_kind end,
    'approved', auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.log_import_underwriting_copy(uuid, text, text, text, integer) from public, anon;
grant execute on function public.log_import_underwriting_copy(uuid, text, text, text, integer) to authenticated;

-- The removal path for a placement-less credit item. A placement-backed
-- credit must go through log_clear_underwriting_credit() (which marks its
-- placement superseded atomically); this function refuses to touch one —
-- including via a superseded placement's surviving reference — so the two
-- paths can never race each other into an orphaned placement.
create function public.log_delete_unplaced_credit_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.log_rundown_items;
begin
  if auth.uid() is null or not private.has_log_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_item from public.log_rundown_items where id = p_item_id;
  if not found then
    return jsonb_build_object('error', 'That item no longer exists.');
  end if;
  if v_item.item_kind <> 'underwriting_credit' then
    return jsonb_build_object('error', 'Not an underwriting credit.');
  end if;
  if exists (
    select 1 from public.uw_scheduled_placements
    where log_rundown_item_id = p_item_id
  ) then
    return jsonb_build_object(
      'error',
      'This credit was placed by Underwriting & Traffic — clear it from there instead.'
    );
  end if;

  delete from public.log_rundown_items where id = p_item_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.log_delete_unplaced_credit_item(uuid) from public, anon;
grant execute on function public.log_delete_unplaced_credit_item(uuid) to authenticated;

-- 5. Log's first audit_events insert policy ----------------------------------
-- No Log action has logged an audit event until now (the tool's MCP writes
-- go through audit_events_insert_mcp), so no member-scoped policy existed
-- and a logAuditEvent() from a Log session would be silently dropped by
-- RLS. The import is a bulk write worth a durable trace — the same
-- reasoning as underwriting.schedule_line.auto_filled's audit event. Same
-- shape as audit_events_insert_underwriting.
create policy audit_events_insert_log on public.audit_events
  for insert to authenticated
  with check (private.has_log_access(auth.uid()) and actor_id = auth.uid());
