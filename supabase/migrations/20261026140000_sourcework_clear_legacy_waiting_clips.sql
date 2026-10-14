-- Clears the per-theme clip suggestions that were still waiting for a decision when themes were retired
-- (20261026120000, docs/sourcework-analysis-design.md §24).
--
-- That migration dropped sw_quote_suggestions.theme_id, but a suggestion's run was deleted (run_id set null)
-- rather than the suggestion itself, so a waiting clip proposed for a theme survived with nothing saying so. The
-- source page lists every waiting suggestion for a source, so those clips showed up beside Analyze's and could be
-- accepted. Analyze always sets run_id, and nothing nulls it for an Analyze run, so a waiting suggestion with no
-- run is one of the legacy ones.
--
-- Decided suggestions (accepted or rejected) are kept: Analyze reads them as stretches a person already decided
-- on and never proposes them again.

delete from sw_quote_suggestions
where status = 'suggested'
  and run_id is null;
