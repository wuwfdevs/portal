-- Deleting a piece that Draft with AI wrote failed with a check violation.
--
-- sw_analysis_runs.piece_id is `on delete set null`, so a run record survives its piece, but
-- sw_analysis_runs_piece_draft_check required every non-trial piece_draft run to name one. Deleting
-- the piece set piece_id to null on its draft run and the check refused, so no piece that had been
-- drafted could be deleted. A real draft still names its piece when it starts (the writer sets it);
-- it only ever becomes null because the piece was deleted, so the constraint is dropped.

alter table public.sw_analysis_runs drop constraint sw_analysis_runs_piece_draft_check;
