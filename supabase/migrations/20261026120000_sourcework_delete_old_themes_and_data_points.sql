-- Deletes the data the retired Sourcework research steps (docs/sourcework-analysis-design.md §23) left behind:
-- every theme and every data point that did not come from an Analyze run. Data only; no schema change.
--
-- What goes with them, through existing ON DELETE rules:
--   themes       -> theme/data-point links, merge suggestions, theme-scoped quote suggestions (and their points),
--                   quote trials sampled on a theme; analysis runs keep their row with theme_id set null.
--   data points  -> their spans, their links to excerpts, their quote-suggestion points, note links.
-- What stays: excerpts (including every one accepted from a suggestion), pieces and their versions, research
-- questions, context notes, analysis runs, prompt versions, and any finding an Analyze run wrote.
--
-- Run it in the Supabase SQL editor, not the MCP tool, which holds DELETE statements for a confirmation that never
-- arrives. Both projects were counted first: preview holds none of this data; production held 18 themes and 205 data
-- points, none from an Analyze run.

-- merged_into_id is ON DELETE RESTRICT, which is checked per row, so clear it before the themes go.
update sw_themes set merged_into_id = null where merged_into_id is not null;

delete from sw_themes;

delete from sw_data_points
where run_id is null
   or run_id not in (select id from sw_analysis_runs where kind = 'analyze');
