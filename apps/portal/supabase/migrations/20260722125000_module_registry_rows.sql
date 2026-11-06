-- Registry rows for the two tools whose rows used to exist only in supabase/seed.sql.
--
-- Editorial Planning and Remote Interview predate the convention that a tool's own
-- migration inserts its `public.tools` row. Their rows came from seed.sql, which is
-- sample data and never runs against a production project, so a database built from
-- migrations alone had no row for either — and anything that looks the key up
-- (`rc_release_guide()` raises on a missing key; the 20260928210000 backfill calls it
-- for 'editorial-planning') failed.
--
-- Why this file sorts BEFORE 20260722130000 rather than at the end of the sequence:
-- a fresh database runs migrations in prefix order, and the Editorial Planning
-- migration already looks its row up. A row inserted by the last file in the directory
-- would arrive after the files that need it. This is the one deliberate exception to
-- "continue the sequence, don't go back" in CLAUDE.md. Both hosted projects already
-- have the rows, so applying it there is a no-op, and the migration NAME (not its
-- version) is what ties this file to a project's history — see APPLIED.md.
--
-- `on conflict (key) do nothing`: a station's own choices (enabled, access, order) must
-- never be overwritten by replaying a migration. Values are copied from seed.sql and
-- match what both hosted projects hold, apart from changes later migrations make to
-- these rows (e.g. Remote Interview's description and route, set by
-- 20260729120000_remote_interview_schema.sql).

insert into public.tools (key, name, description, route, status, enabled, default_access, sort_order)
values
  (
    'editorial-planning',
    'Editorial Planning',
    'Submit, review, and evaluate story pitches for editorial meetings.',
    '/editorial',
    'available',
    true,
    'invite_only',
    1
  ),
  (
    'remote-interview',
    'Remote Interview',
    'Record, transcribe, and edit remote audio and video interviews.',
    '/tools/remote-interview',
    'in_development',
    true,
    'invite_only',
    2
  )
on conflict (key) do nothing;
