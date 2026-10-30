-- Moves the tool's user-facing URL from /transcription to /sourcework, to
-- match the display-name rename in 20260731140000_sourcework_tool_rename.sql.
-- Nothing else moves: the tool `key` stays 'transcription' (it's the
-- authorization identifier RLS/authz functions key off, not a URL), and so
-- do every directory, file, and doc name. No production traffic depends on
-- the old path yet, so no redirect is needed.

update public.tools
   set route = '/sourcework'
 where key = 'transcription';
