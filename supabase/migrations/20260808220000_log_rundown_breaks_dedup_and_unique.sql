-- Log: fixes a real duplication bug in the "sync breaks" catch-up path
-- added alongside the local-opportunities/rundown-breaks redesign
-- (20260808120000_log_local_opportunities.sql,
-- 20260808130000_log_rundown_breaks.sql). Confirmed live on production
-- from ordinary use, not a hypothetical: syncRundownBreaks()'s "does this
-- break already exist?" check (lib/log/rundown-generation.ts's
-- selectMissingBreakDrafts) compared a freshly-built draft's scheduled_at
-- (always `Date.prototype.toISOString()` — e.g. "2026-08-07T10:06:00.000Z")
-- against the same instant read back from Postgres through supabase-js
-- (no milliseconds, "+00:00" instead of "Z" — e.g.
-- "2026-08-07T10:06:00+00:00") using plain string equality. Those strings
-- never matched even for the identical instant, so every existing break
-- looked "missing" on every call, and every click of "Sync them in now"
-- re-inserted the full draft set. One production rundown's 20 breaks (5
-- Morning Edition opportunities x 4 hours) had grown to 60 (three full
-- copies) from ordinary use before this was caught.
--
-- Two independent fixes, both required: the application-level match now
-- compares parsed instants (`new Date(...).getTime()`), not raw strings —
-- see that function's updated comment. This migration is the
-- database-level half: deduplicate whatever already exists, then add a
-- real uniqueness constraint so a duplicate insert is impossible going
-- forward regardless of what application code does or how two concurrent
-- requests interleave — the app's own insert/upsert calls were updated in
-- the same pass to use `upsert(..., { onConflict: ..., ignoreDuplicates:
-- true })` against this constraint instead of a bare `insert`.

-- Deduplicate first, keeping the earliest-created row (lowest id — these
-- are gen_random_uuid()s with no time ordering, but "keep exactly one,
-- deterministically" is all that matters here) per occurrence. Necessary
-- in any environment that already hit the bug — confirmed on production,
-- not reproduced on preview.
delete from public.log_rundown_breaks a
using public.log_rundown_breaks b
where a.rundown_id = b.rundown_id
  and a.local_opportunity_id = b.local_opportunity_id
  and a.scheduled_at = b.scheduled_at
  and a.id > b.id;

alter table public.log_rundown_breaks
  add constraint log_rundown_breaks_unique_occurrence
  unique (rundown_id, local_opportunity_id, scheduled_at);

comment on constraint log_rundown_breaks_unique_occurrence on public.log_rundown_breaks is
  'One break per local-opportunity occurrence, enforced at the database level so a duplicate is impossible however it would happen — a buggy match, a race between two concurrent sync/generate calls, or anything else. See CLAUDE.md''s "Log: rundown-breaks duplication and ordering fixes" note.';

-- Separate finding from the same report: the Morning Edition seed
-- (20260808210000_log_morning_edition_opportunities.sql) numbered its five
-- opportunities in the narrative order they were described in that
-- migration's own comment, not in chronological (start_offset_seconds)
-- order — position 4 (the ~49:35 story window, offset 2975) was entered
-- before position 5 (the required 42:30 local ID, offset 2550), which
-- actually airs earlier. Every reader of this table (the clock template
-- screen's opportunity list, rundown generation's per-break position field)
-- implicitly assumed position tracked chronological order, so this
-- surfaced as breaks rendering out of time order in the rundown builder —
-- reported directly, reproduced by comparing this table's own
-- start_offset_seconds against its position column. Application queries
-- were also changed in the same pass to order by actual time
-- (start_offset_seconds / scheduled_at) rather than trust position at all,
-- but the stored values are corrected here too so the raw data itself
-- isn't misleading to a future reader.
update public.log_local_opportunities
set position = 5
where clock_version_id = 'a9d5b1e6-69cc-5e94-a4be-5466f6a1863a'
  and start_offset_seconds = 2975;

update public.log_local_opportunities
set position = 4
where clock_version_id = 'a9d5b1e6-69cc-5e94-a4be-5466f6a1863a'
  and start_offset_seconds = 2550;
