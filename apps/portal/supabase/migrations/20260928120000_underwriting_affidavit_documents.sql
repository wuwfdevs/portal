-- Affidavits become a client-facing document (docs/underwriting-design.md
-- §6, "Affidavits are a signed PDF"). Replaces milestone 1's browser-print
-- record with a PDF that lists what aired against what was ordered, rendered
-- server-side (lib/underwriting/affidavit-pdf.tsx) and, on certification,
-- stored once in the underwriting-documents bucket, so what a client
-- received is kept exactly as it was sent.
--
-- 1. uw_contracts.account_rep — the "Sales Person" every affidavit in
--    WUWF's current template prints. Plain text, not a profile reference:
--    the rep on an order is not necessarily a portal user.
-- 2. uw_affidavits gains the certification facts the signature line prints
--    (certified_at, certifying_staff_title) and the stored document
--    (certified_document_path, certified_document_sha256 — the hash lets a
--    later reader confirm the stored file is the one certified).
-- 3. uw_guard_affidavit_certification() is widened: certifying is still
--    manager-only, and a certified affidavit is now frozen. The old guard
--    let any member edit a certified row, including flipping it back to
--    draft. Certification writes the stored document's path and hash in
--    the same update (the file is uploaded first), and a check constraint
--    holds them together, so a certified row always has its document.
--    Neither project had any affidavit rows when this was applied.

alter table public.uw_contracts
  add column account_rep text;

comment on column public.uw_contracts.account_rep is
  'The station''s salesperson on this order, as printed on the affidavit. Free text — the rep need not be a portal user.';

alter table public.uw_affidavits
  add column certified_at timestamptz,
  add column certifying_staff_title text,
  add column certified_document_path text,
  add column certified_document_sha256 text;

alter table public.uw_affidavits
  add constraint uw_affidavits_certified_document_check check (
    status <> 'certified'
    or (certified_at is not null
        and certified_document_path is not null
        and certified_document_sha256 is not null)
  );

comment on column public.uw_affidavits.certified_document_path is
  'Object path in the underwriting-documents bucket of the PDF as certified — the file the client receives. Frozen with the rest of a certified row.';
comment on column public.uw_affidavits.certified_document_sha256 is
  'Hex SHA-256 of the certified PDF, recorded alongside its path.';

create or replace function public.uw_guard_affidavit_certification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'certified' then
    if new.status is distinct from old.status
       or new.contract_id is distinct from old.contract_id
       or new.campaign_period_start is distinct from old.campaign_period_start
       or new.campaign_period_end is distinct from old.campaign_period_end
       or new.report_identifier is distinct from old.report_identifier
       -- Only the foreign key's own on-delete-set-null may clear the certifier.
       or (new.certifying_staff_id is distinct from old.certifying_staff_id
           and new.certifying_staff_id is not null)
       or new.certifying_staff_title is distinct from old.certifying_staff_title
       or new.certification_text is distinct from old.certification_text
       or new.certified_at is distinct from old.certified_at
       or new.certified_document_path is distinct from old.certified_document_path
       or new.certified_document_sha256 is distinct from old.certified_document_sha256
    then
      raise exception 'A certified affidavit cannot be changed. Generate a new one instead.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.status = 'certified'
     and not (select private.is_underwriting_manager((select auth.uid())))
  then
    raise exception 'Only an underwriting manager can certify an affidavit.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.uw_guard_affidavit_certification() from public, anon, authenticated;
