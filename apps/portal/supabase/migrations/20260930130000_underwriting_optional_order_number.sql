-- An order that prints no order number has none (2026-09-30). The agreement
-- import used to compose "<sponsor> <start date>" to satisfy this column's
-- not-null constraint, which read as a real number on every screen and
-- affidavit. The screens now say "No order number" (lib/underwriting/
-- contract-label.ts), and the import leaves it null.
--
-- The composed numbers already written are cleared below: an imported draft
-- whose identifier is exactly its sponsor's name, a space, and its own start
-- date, and whose document reading printed none. Nothing a person typed can
-- match both.

alter table public.uw_contracts alter column contract_identifier drop not null;

comment on column public.uw_contracts.contract_identifier is
  'The order, insertion-order, contract or estimate number the order prints. Null when it prints none — never composed.';

update public.uw_contracts c
set contract_identifier = null
from public.uw_underwriters u
where u.id = c.underwriter_id
  and c.status = 'draft'
  and c.contract_identifier = u.name || ' ' || c.effective_from::text
  and c.agreement_reading is not null
  and coalesce(c.agreement_reading #>> '{output,order,contract_identifier}', '') = '';
