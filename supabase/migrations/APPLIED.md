# Migration ledger

**A migration is not done when it is written. It is done when it has been applied
to both Supabase projects and recorded here.**

Migrations in this directory are not self-applying, and nothing in a normal
build, test run, or deploy will apply them. A migration that only lives in the
repo ships a tool that silently does nothing — or worse, half-does something:
Audience Listening's registry row was flipped to `available` while its route
still pointed at the generic placeholder, because the migration that repoints it
had not been run. The result was an infinite redirect with nothing on screen to
explain it.

This file is the answer to "has it actually been applied?", and
`npm run db:check` is what stops the question going unasked. That check fails
if a migration file has no row here, if a row names a file that doesn't exist,
or if either environment column is anything other than a date.

## How to apply one

Preview first, verify, then production — never the other way round.

1. Apply to `wuwf-tools-portal-preview`.
2. Verify: the tables/policies/functions exist, and the feature works against a
   preview deployment.
3. Apply to `wuwf-tools-portal`.
4. Verify the same way.
5. Add the row below, with the date each apply landed.
6. `npm run db:check`.

Either the Supabase CLI (`supabase db push --linked`) or the Supabase MCP
server's `apply_migration` will do it. Whichever you use, the remote history
records its own timestamp for the apply, so the versions Supabase reports do not
match these filenames — the migration **name** is the join key between this
repo and a project's history, not the version number.

## Applied

| Migration file                                            | Preview    | Production |
| --------------------------------------------------------- | ---------- | ---------- |
| `20260722120000_platform_schema.sql`                       | 2026-07-22 | 2026-07-22 |
| `20260722120001_rls_policies.sql`                          | 2026-07-22 | 2026-07-22 |
| `20260722130000_editorial_planning.sql`                    | 2026-07-24 | 2026-07-24 |
| `20260724120000_private_authz_functions.sql`               | 2026-07-24 | 2026-07-24 |
| `20260725000000_transcription_workspace_schema.sql`        | 2026-07-25 | 2026-07-25 |
| `20260725010000_transcription_segment_ordering.sql`        | 2026-07-25 | 2026-07-25 |
| `20260728120000_transcription_search.sql`                  | 2026-07-28 | 2026-07-28 |
| `20260729120000_remote_interview_schema.sql`               | 2026-07-29 | 2026-07-29 |
| `20260729180000_remote_interview_waiting_room.sql`         | 2026-07-29 | 2026-07-29 |
| `20260729190000_remote_interview_studio_rls.sql`           | 2026-07-29 | 2026-07-29 |
| `20260730120000_skip_profile_for_anonymous_guests.sql`     | 2026-07-30 | 2026-07-30 |
| `20260730130000_editorial_strategic_refinement.sql`        | 2026-07-30 | 2026-07-30 |
| `20260730140000_editorial_sextant_pillars.sql`             | 2026-07-30 | 2026-07-30 |
| `20260730150000_editorial_pillars_table.sql`               | 2026-07-30 | 2026-07-30 |
| `20260730160000_remote_interview_assembly_rls.sql`         | 2026-07-30 | 2026-07-30 |
| `20260730170000_audience_listening.sql`                    | 2026-07-30 | 2026-07-30 |
| `20260730180000_audience_listening_media_select.sql`       | 2026-07-30 | 2026-07-30 |
| `20260731120000_sourcework_sources_representations.sql`    | 2026-07-31 | 2026-07-31 |
| `20260731130000_sourcework_source_excerpts.sql`             | 2026-07-31 | 2026-07-31 |
| `20260731140000_sourcework_tool_rename.sql`                 | 2026-07-31 | 2026-07-31 |
| `20260731150000_sourcework_route_rename.sql`                | 2026-07-31 | 2026-07-31 |
| `20260731160000_mcp_server_audit_rls.sql`                   | 2026-07-31 | 2026-07-31 |
| `20260731170000_tw_search_source_id.sql`                     | 2026-07-31 | 2026-07-31 |
| `20260731180000_sourcework_documents.sql`                    | 2026-08-01 | 2026-08-01 |
| `20260731181000_sourcework_documents_search.sql`             | 2026-08-01 | 2026-08-01 |
| `20260801120000_tool_status_proposed.sql`                    | 2026-08-01 | 2026-08-01 |
| `20260801121000_roadmap.sql`                                 | 2026-08-01 | 2026-08-01 |
| `20260803120000_sourcework_document_block_lines.sql`         | 2026-08-03 | 2026-08-03 |
| `20260803130000_tw_search_scoping.sql`                        | 2026-08-03 | 2026-08-03 |
| `20260803140000_academic_partnerships.sql`                     | 2026-08-03 | 2026-08-03 |
| `20260805120000_academic_partnerships_multi_track.sql`         | 2026-08-05 | 2026-08-05 |
| `20260805130000_academic_partnerships_field_trim.sql`           | 2026-08-05 | 2026-08-05 |
| `20260806120000_academic_partnerships_delete.sql`                | 2026-08-06 | 2026-08-06 |
| `20260806130000_log_foundation.sql`                              | 2026-08-06 | 2026-08-06 |
| `20260806140000_log_clock_slot_windows_and_schedule_times.sql`   | 2026-08-06 | 2026-08-06 |
| `20260806150000_log_seed_npr_clocks.sql`                         | 2026-08-06 | 2026-08-06 |
| `20260806160000_log_content_library.sql`                         | 2026-08-06 | 2026-08-06 |
| `20260806170000_log_schedule_completeness_fixes.sql`             | 2026-08-06 | 2026-08-06 |
| `20260806180000_log_clock_seed_corrections.sql`                  | 2026-08-06 | 2026-08-06 |
| `20260807120000_log_clock_seed_corrections_2.sql`                | 2026-08-07 | 2026-08-07 |
| `20260807130000_log_npr_weather.sql`                              | 2026-08-07 | 2026-08-07 |
| `20260807140000_log_npr_cds_correction.sql`                       | 2026-08-07 | 2026-08-07 |
| `20260807150000_log_rundowns.sql`                                 | 2026-08-07 | 2026-08-07 |
| `20260807160000_log_broadcast_events.sql`                         | 2026-08-07 | 2026-08-07 |
| `20260807170000_academic_partnerships_delete_grant.sql`           | 2026-08-07 | 2026-08-07 |
| `20260807180000_log_morning_edition_top_of_hour_fix.sql`         | 2026-08-07 | 2026-08-07 |
| `20260807190000_log_clock_seed_top_of_hour_swap.sql`             | 2026-08-07 | 2026-08-07 |
| `20260807200000_underwriting_foundation.sql`                      | 2026-08-07 | 2026-08-07 |
| `20260807210000_underwriting_placement.sql`                       | 2026-08-07 | 2026-08-07 |
| `20260807220000_underwriting_exceptions.sql`                      | 2026-08-07 | 2026-08-07 |
| `20260807230000_underwriting_exception_read_fix.sql`              | 2026-08-07 | 2026-08-07 |
| `20260807240000_underwriting_makegoods.sql`                       | 2026-08-07 | 2026-08-07 |
| `20260807250000_underwriting_affidavits.sql`                      | 2026-08-07 | 2026-08-07 |
| `20260808120000_log_local_opportunities.sql`                      | 2026-08-07 | 2026-08-07 |
| `20260808130000_log_rundown_breaks.sql`                           | 2026-08-07 | 2026-08-07 |
| `20260808140000_log_content_dad_and_media_removal.sql`            | 2026-08-07 | 2026-08-07 |
| `20260808200000_underwriting_redesign.sql`                        | 2026-08-07 | 2026-08-07 |
| `20260808210000_log_morning_edition_opportunities.sql`            | 2026-08-07 | 2026-08-07 |
| `20260808220000_log_rundown_breaks_dedup_and_unique.sql`          | 2026-08-07 | 2026-08-07 |
| `20260808230000_log_morning_edition_weather.sql`                  | 2026-08-07 | 2026-08-07 |

Verified against both projects' `supabase_migrations.schema_migrations` on
2026-07-30: every file above is present in both, and neither project carries an
applied migration this repo doesn't have, except the one noted below. (The five
2026-08-08-timestamped Log/Underwriting redesign migrations above were applied
2026-08-07, ahead of their own filename timestamp — the timestamp prefix is a
sequencing identifier chosen when the files were written, not a claim about
when they'd be applied.)

## Known discrepancy: `harden_functions`

Both hosted projects carry a `harden_functions` migration (applied 2026-07-22)
with **no corresponding file in this directory**. Its effect — the
`revoke execute ... from public, anon, authenticated` on
`handle_new_auth_user()`/`handle_auth_user_sign_in()`/`is_administrator()` — was
folded into `20260722120000_platform_schema.sql` instead of being tracked as its
own file.

This is a real, already-characterized gap in the audit trail, not drift in
behaviour: a fresh database built from this directory ends up in the same state
as the hosted ones. It is Finding 4 in
`docs/remote-interview-technical-assessment.md`, recorded here too so that
whoever reconciles this ledger against a project's history doesn't mistake it
for something new — and, in particular, doesn't try to "fix" it by writing a
replacement file and applying it on top.

Deliberately not in the table above: the table is keyed on files that exist, and
`npm run db:check` treats a row naming a missing file as an error.
