-- Weighted copy rotation (docs/underwriting-traffic-redesign.md §13.2).
--
-- A contract's messages rotate as one cycle; this lets an order say one
-- message airs more often than another. The weight is a property of the
-- *link* (uw_contract_copy), not of uw_copy: one message can serve several
-- contracts and each order sets its own ratio. Default 1 for every row, so
-- existing contracts rotate exactly as before. The ordering itself is
-- computed in TypeScript (lib/underwriting/rotation.ts) — SQL stores the
-- weight and nothing else, and log_reassign_underwriting_credit_copy()
-- re-checks eligibility only, so no function changes here. The update
-- policy needed to edit it already exists (20260927160000).

alter table public.uw_contract_copy
  add column weight integer not null default 1
    constraint uw_contract_copy_weight_range check (weight between 1 and 20);

comment on column public.uw_contract_copy.weight is
  'The message''s share of its rotation group (the contract''s general cycle, or one line''s dedicated messages): airs weight/sum(weights) of the spots. Equal weights are the plain cycle. 1 to 20.';
