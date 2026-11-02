-- Underwriting & Traffic: the model's reading of an uploaded agreement,
-- kept on the contract it created (docs/underwriting-traffic-redesign.md
-- §12).
--
-- A contract can now be created from its signed agreement: the order step
-- takes the document, one model call reads it, the draft contract is
-- created with the order's facts, and every schedule line that compiles is
-- saved as an ordinary draft line — reviewable, editable and removable on
-- the schedule step exactly like a hand-entered one. What that flow needs
-- to keep is the part that could NOT be saved: a line whose reading the
-- schedule-line parser refused, an instruction the model could not express
-- as a line, and its notes (a date that falls on the wrong weekday, copy
-- printed on the order). The schedule step lists those from this column,
-- with "Enter" prefilling the editor from the reading, so a partly-right
-- line is corrected rather than retyped.
--
-- It is the raw model answer plus per-line outcomes and the document path
-- it was read from, as JSON — an audit of what the model said, never a
-- source the scheduler reads. Nothing joins it; RLS is the contract's own.
-- Null on a contract created by hand.

alter table public.uw_contracts
  add column if not exists agreement_reading jsonb;

comment on column public.uw_contracts.agreement_reading is
  'The model''s reading of the uploaded agreement this contract was created from (lib/underwriting/agreement-import.ts''s AgreementReading: the raw answer, which lines were saved, warnings, the document path). Shown on the schedule step for the lines that could not be saved; never read by placement or auto-fill. Null for a contract entered by hand.';
