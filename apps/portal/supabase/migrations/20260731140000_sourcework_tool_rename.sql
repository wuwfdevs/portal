-- Renames the tool registry's display name from "Transcription Workspace" to
-- "Sourcework", matching the UI copy pass that accompanies this migration
-- (see docs/sourcework-design.md). The tool `key` ('transcription'), its
-- route (/transcription), and every directory/file name stay as they are —
-- same precedent as keeping docs/transcription-workspace-design.md's name
-- through the Phase 1-2 data model rename.

update public.tools
   set name = 'Sourcework',
       description = 'Turn raw interviews into production-ready audio excerpts: transcribe, identify speakers, correct the transcript, and export actualities.'
 where key = 'transcription';
