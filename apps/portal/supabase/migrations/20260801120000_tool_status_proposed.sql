-- Adds 'proposed' to the tool registry's status enum: a tools row that is an
-- idea rather than software. See docs/roadmap-design.md §6 for why a proposal
-- is a tools row at all rather than a table local to the Roadmap tool.
--
-- Deliberately alone in its own migration. Postgres allows `alter type ... add
-- value` inside a transaction, but the new value cannot be USED in that same
-- transaction — and Supabase runs each migration file in one. Everything that
-- references 'proposed' (the Roadmap tool's additive tools policy, its registry
-- row) therefore lives in the next migration.
--
-- Precedent for a bare enum-extension migration: 20260731180000_sourcework_
-- documents.sql's `alter type public.sw_source_kind add value 'document'`.

alter type public.tool_status add value 'proposed';
