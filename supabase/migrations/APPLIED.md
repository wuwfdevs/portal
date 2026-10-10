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

| Migration file                                                        | Preview    | Production |
| --------------------------------------------------------------------- | ---------- | ---------- |
| `20260722120000_platform_schema.sql`                                  | 2026-07-22 | 2026-07-22 |
| `20260722120001_rls_policies.sql`                                     | 2026-07-22 | 2026-07-22 |
| `20260722130000_editorial_planning.sql`                               | 2026-07-24 | 2026-07-24 |
| `20260724120000_private_authz_functions.sql`                          | 2026-07-24 | 2026-07-24 |
| `20260725000000_transcription_workspace_schema.sql`                   | 2026-07-25 | 2026-07-25 |
| `20260725010000_transcription_segment_ordering.sql`                   | 2026-07-25 | 2026-07-25 |
| `20260728120000_transcription_search.sql`                             | 2026-07-28 | 2026-07-28 |
| `20260729120000_remote_interview_schema.sql`                          | 2026-07-29 | 2026-07-29 |
| `20260729180000_remote_interview_waiting_room.sql`                    | 2026-07-29 | 2026-07-29 |
| `20260729190000_remote_interview_studio_rls.sql`                      | 2026-07-29 | 2026-07-29 |
| `20260730120000_skip_profile_for_anonymous_guests.sql`                | 2026-07-30 | 2026-07-30 |
| `20260730130000_editorial_strategic_refinement.sql`                   | 2026-07-30 | 2026-07-30 |
| `20260730140000_editorial_sextant_pillars.sql`                        | 2026-07-30 | 2026-07-30 |
| `20260730150000_editorial_pillars_table.sql`                          | 2026-07-30 | 2026-07-30 |
| `20260730160000_remote_interview_assembly_rls.sql`                    | 2026-07-30 | 2026-07-30 |
| `20260730170000_audience_listening.sql`                               | 2026-07-30 | 2026-07-30 |
| `20260730180000_audience_listening_media_select.sql`                  | 2026-07-30 | 2026-07-30 |
| `20260731120000_sourcework_sources_representations.sql`               | 2026-07-31 | 2026-07-31 |
| `20260731130000_sourcework_source_excerpts.sql`                       | 2026-07-31 | 2026-07-31 |
| `20260731140000_sourcework_tool_rename.sql`                           | 2026-07-31 | 2026-07-31 |
| `20260731150000_sourcework_route_rename.sql`                          | 2026-07-31 | 2026-07-31 |
| `20260731160000_mcp_server_audit_rls.sql`                             | 2026-07-31 | 2026-07-31 |
| `20260731170000_tw_search_source_id.sql`                              | 2026-07-31 | 2026-07-31 |
| `20260731180000_sourcework_documents.sql`                             | 2026-08-01 | 2026-08-01 |
| `20260731181000_sourcework_documents_search.sql`                      | 2026-08-01 | 2026-08-01 |
| `20260801120000_tool_status_proposed.sql`                             | 2026-08-01 | 2026-08-01 |
| `20260801121000_roadmap.sql`                                          | 2026-08-01 | 2026-08-01 |
| `20260803120000_sourcework_document_block_lines.sql`                  | 2026-08-03 | 2026-08-03 |
| `20260803130000_tw_search_scoping.sql`                                | 2026-08-03 | 2026-08-03 |
| `20260803140000_academic_partnerships.sql`                            | 2026-08-03 | 2026-08-03 |
| `20260805120000_academic_partnerships_multi_track.sql`                | 2026-08-05 | 2026-08-05 |
| `20260805130000_academic_partnerships_field_trim.sql`                 | 2026-08-05 | 2026-08-05 |
| `20260806120000_academic_partnerships_delete.sql`                     | 2026-08-06 | 2026-08-06 |
| `20260806130000_log_foundation.sql`                                   | 2026-08-06 | 2026-08-06 |
| `20260806140000_log_clock_slot_windows_and_schedule_times.sql`        | 2026-08-06 | 2026-08-06 |
| `20260806150000_log_seed_npr_clocks.sql`                              | 2026-08-06 | 2026-08-06 |
| `20260806160000_log_content_library.sql`                              | 2026-08-06 | 2026-08-06 |
| `20260806170000_log_schedule_completeness_fixes.sql`                  | 2026-08-06 | 2026-08-06 |
| `20260806180000_log_clock_seed_corrections.sql`                       | 2026-08-06 | 2026-08-06 |
| `20260807120000_log_clock_seed_corrections_2.sql`                     | 2026-08-07 | 2026-08-07 |
| `20260807130000_log_npr_weather.sql`                                  | 2026-08-07 | 2026-08-07 |
| `20260807140000_log_npr_cds_correction.sql`                           | 2026-08-07 | 2026-08-07 |
| `20260807150000_log_rundowns.sql`                                     | 2026-08-07 | 2026-08-07 |
| `20260807160000_log_broadcast_events.sql`                             | 2026-08-07 | 2026-08-07 |
| `20260807170000_academic_partnerships_delete_grant.sql`               | 2026-08-07 | 2026-08-07 |
| `20260807180000_log_morning_edition_top_of_hour_fix.sql`              | 2026-08-07 | 2026-08-07 |
| `20260807190000_log_clock_seed_top_of_hour_swap.sql`                  | 2026-08-07 | 2026-08-07 |
| `20260807200000_underwriting_foundation.sql`                          | 2026-08-07 | 2026-08-07 |
| `20260807210000_underwriting_placement.sql`                           | 2026-08-07 | 2026-08-07 |
| `20260807220000_underwriting_exceptions.sql`                          | 2026-08-07 | 2026-08-07 |
| `20260807230000_underwriting_exception_read_fix.sql`                  | 2026-08-07 | 2026-08-07 |
| `20260807240000_underwriting_makegoods.sql`                           | 2026-08-07 | 2026-08-07 |
| `20260807250000_underwriting_affidavits.sql`                          | 2026-08-07 | 2026-08-07 |
| `20260808120000_log_local_opportunities.sql`                          | 2026-08-07 | 2026-08-07 |
| `20260808130000_log_rundown_breaks.sql`                               | 2026-08-07 | 2026-08-07 |
| `20260808140000_log_content_dad_and_media_removal.sql`                | 2026-08-07 | 2026-08-07 |
| `20260808200000_underwriting_redesign.sql`                            | 2026-08-07 | 2026-08-07 |
| `20260808210000_log_morning_edition_opportunities.sql`                | 2026-08-07 | 2026-08-07 |
| `20260808220000_log_rundown_breaks_dedup_and_unique.sql`              | 2026-08-07 | 2026-08-07 |
| `20260808230000_log_morning_edition_weather.sql`                      | 2026-08-07 | 2026-08-07 |
| `20260808240000_log_rundown_items_npr_lookahead.sql`                  | 2026-08-09 | 2026-08-09 |
| `20260809120000_uw_open_exceptions_for_rundown.sql`                   | 2026-08-09 | 2026-08-09 |
| `20260809130000_underwriting_credit_relocation.sql`                   | 2026-08-09 | 2026-08-09 |
| `20260809140000_underwriting_break_adjacency.sql`                     | 2026-08-09 | 2026-08-09 |
| `20260809150000_underwriting_rundown_provisioning.sql`                | 2026-08-09 | 2026-08-09 |
| `20260809160000_underwriting_rundown_provisioning_returns_breaks.sql` | 2026-08-09 | 2026-08-09 |
| `20260809170000_log_local_opportunities_slot_based.sql`               | 2026-08-10 | 2026-08-10 |
| `20260809180000_log_morning_edition_opportunities_slot_based.sql`     | 2026-08-10 | 2026-08-10 |
| `20260810120000_log_opportunity_assignments.sql`                      | 2026-08-10 | 2026-08-10 |
| `20260810130000_log_opportunity_assignment_placement_boundary.sql`    | 2026-08-10 | 2026-08-10 |
| `20260810140000_log_get_program_schedule_context_slot_join_fix.sql`   | 2026-08-10 | 2026-08-10 |
| `20260810150000_log_content_library_field_trim.sql`                   | 2026-08-10 | 2026-08-10 |
| `20260810160000_log_clock_seed_swap_corrections_3.sql`                | 2026-08-10 | 2026-08-10 |
| `20260810170000_log_syndicated_local_opportunities.sql`               | 2026-08-10 | 2026-08-10 |
| `20260811130000_log_music_bed_billboard_return_promo_eligibility.sql` | 2026-08-11 | 2026-08-11 |
| `20260820120000_editorial_inquiry.sql`                                | 2026-08-20 | 2026-08-20 |
| `20260820130000_editorial_inquiry_grounded_reasoning.sql`             | 2026-08-20 | 2026-08-20 |
| `20260820140000_editorial_inquiry_reasoning_calibration.sql`          | 2026-08-20 | 2026-08-20 |
| `20260821130000_log_npr_item_durations.sql`                           | 2026-08-21 | 2026-08-21 |
| `20260821140000_log_npr_feed_start_hour.sql`                          | 2026-08-21 | 2026-08-21 |
| `20260821150000_log_npr_feed_anchor_atc.sql`                          | 2026-08-21 | 2026-08-21 |
| `20260821160000_log_atc_segment_b_junction_fix.sql`                   | 2026-08-21 | 2026-08-21 |
| `20260821170000_log_atc_b_to_return_furniture.sql`                    | 2026-08-21 | 2026-08-21 |
| `20260821180000_log_program_log_import.sql`                           | 2026-08-21 | 2026-08-21 |
| `20260824120000_log_underwriters_for_rundown_copy.sql`                | 2026-08-24 | 2026-08-24 |
| `20260824130000_log_weather_current_observation.sql`                  | 2026-08-24 | 2026-08-24 |
| `20260824140000_tool_access_predicates_check_enabled.sql`             | 2026-08-24 | 2026-08-24 |
| `20260826120000_log_content_library_dad_import.sql`                   | 2026-08-26 | 2026-08-26 |
| `20260826130000_log_weather_daily_outlook.sql`                        | 2026-08-26 | 2026-08-26 |
| `20260826140000_log_weather_forecast_periods.sql`                     | 2026-08-26 | 2026-08-26 |
| `20260827120000_log_relocate_unplaced_underwriting_credit.sql`        | 2026-08-27 | 2026-08-27 |
| `20260901120000_log_npr_episode_cache_atomic.sql`                     | 2026-09-01 | 2026-09-01 |
| `20260914130000_rls_initplan_wrapping.sql`                            | 2026-09-24 | 2026-09-14 |
| `20260914140000_rls_initplan_wrapping_advisor_form.sql`               | 2026-09-24 | 2026-09-14 |
| `20260922120000_log_import_copy_script_updates.sql`                   | 2026-09-24 | 2026-09-22 |
| `20260924120000_log_import_copy_duration_estimates.sql`               | 2026-09-24 | 2026-09-24 |
| `20260924140000_log_slot_keyed_breaks.sql`                            | 2026-09-24 | 2026-09-24 |
| `20260925120000_underwriting_traffic_redesign.sql`                    | 2026-09-25 | 2026-09-25 |
| `20260925130000_underwriting_line_period_fix.sql`                     | 2026-09-25 | 2026-09-25 |
| `20260925150000_underwriting_demand_buckets.sql`                      | 2026-09-25 | 2026-09-25 |
| `20260925160000_underwriting_industry_categories.sql`                 | 2026-09-25 | 2026-09-25 |
| `20260925170000_underwriting_draft_line_delete.sql`                   | 2026-09-25 | 2026-09-25 |
| `20260925180000_underwriting_opening_closing.sql`                     | 2026-09-25 | 2026-09-25 |
| `20260925190000_underwriting_frozen_rundowns_and_bumping.sql`         | 2026-09-25 | 2026-09-25 |
| `20260927120000_underwriting_create_inventory_pool.sql`               | 2026-09-27 | 2026-09-27 |
| `20260927130000_underwriting_draft_contract_line_delete.sql`          | 2026-09-27 | 2026-09-27 |
| `20260927140000_underwriting_contract_agreement_reading.sql`          | 2026-09-27 | 2026-09-27 |
| `20260927150000_underwriting_draft_contract_delete.sql`               | 2026-09-27 | 2026-09-27 |
| `20260927160000_underwriting_copy_rotation.sql`                       | 2026-09-27 | 2026-09-27 |
| `20260928120000_underwriting_affidavit_documents.sql`                 | 2026-09-28 | 2026-09-28 |
| `20260928140000_resources.sql`                                        | 2026-09-28 | 2026-09-28 |
| `20260928160000_resources_media.sql`                                  | 2026-09-28 | 2026-09-28 |
| `20260928180000_resources_portal_basics.sql`                          | 2026-09-28 | 2026-09-28 |
| `20260928180000_resources_semantic_search.sql`                        | 2026-09-28 | 2026-09-28 |
| `20260928190000_resources_sourcework_guides.sql`                      | 2026-09-28 | 2026-09-28 |
| `20260928200000_resources_audience_listening_guides.sql`              | 2026-09-28 | 2026-09-28 |
| `20260928200000_resources_release_helpers.sql`                        | 2026-09-28 | 2026-09-28 |
| `20260928210000_resources_audience_listening_merge_duplicate.sql`     | 2026-09-28 | 2026-09-28 |
| `20260928210000_resources_guide_backfill.sql`                         | 2026-09-28 | 2026-09-28 |
| `20260928220000_resources_log_guides.sql`                             | 2026-09-28 | 2026-09-28 |
| `20260928230000_resources_underwriting_guides.sql`                    | 2026-09-28 | 2026-09-28 |
| `20260928240000_resources_backfill_screenshots.sql`                   | 2026-09-28 | 2026-09-28 |
| `20260928250000_resources_al_screenshot_fix.sql`                      | 2026-09-28 | 2026-09-28 |
| `20260928260000_resources_audience_removal.sql`                       | 2026-09-28 | 2026-09-28 |
| `20260928270000_resources_pinned_procedures.sql`                      | 2026-09-28 | 2026-09-28 |
| `20260929120000_resources_remove_captured_shots.sql`                  | 2026-09-29 | 2026-09-29 |
| `20260929130000_resources_media_capture_columns_drop.sql`             | 2026-09-29 | 2026-09-29 |
| `20260929140000_resources_log_programs_and_clocks.sql`                | 2026-09-29 | 2026-09-29 |
| `20260929150000_resources_log_import_on_today.sql`                    | 2026-09-29 | 2026-09-29 |
| `20260929160000_resources_log_sources_tab.sql`                        | 2026-09-29 | 2026-09-29 |
| `20260929170000_resources_log_library_search.sql`                     | 2026-09-29 | 2026-09-29 |
| `20260929180000_resources_log_program_page.sql`                       | 2026-09-29 | 2026-09-29 |
| `20260929190000_resources_log_clock_page_tidied.sql`                  | 2026-09-29 | 2026-09-29 |
| `20260929200000_underwriting_agreement_migration.sql`                 | 2026-09-29 | 2026-09-29 |
| `20260929200100_resources_underwriting_agreement_migration.sql`       | 2026-09-29 | 2026-09-29 |
| `20260929210000_underwriting_agreement_migration_documents_only.sql`  | 2026-09-29 | 2026-09-29 |
| `20260929210100_resources_underwriting_migration_documents_only.sql`  | 2026-09-29 | 2026-09-29 |
| `20260930120000_resources_underwriting_migration_redesign.sql`        | 2026-09-30 | 2026-09-30 |
| `20260930130000_underwriting_optional_order_number.sql`               | 2026-09-30 | 2026-09-30 |
| `20260930130100_resources_underwriting_agreement_reading.sql`         | 2026-09-30 | 2026-09-30 |
| `20260930140000_resources_underwriting_legacy_copy.sql`               | 2026-09-30 | 2026-09-30 |
| `20260930150000_underwriting_line_scoped_copy.sql`                    | 2026-09-30 | 2026-09-30 |
| `20260930150100_resources_underwriting_line_scoped_copy.sql`          | 2026-09-30 | 2026-09-30 |
| `20261001120000_underwriting_exception_auto_close.sql`                | 2026-10-01 | 2026-10-01 |
| `20261001120100_profiles_title.sql`                                   | 2026-10-01 | 2026-10-01 |
| `20261001120200_resources_underwriting_fewer_tabs.sql`                | 2026-10-01 | 2026-10-01 |
| `20261002120000_underwriting_copy_dad_cut.sql`                        | 2026-10-02 | 2026-10-02 |
| `20261002120100_underwriting_copy_dad_cut_on_update.sql`              | 2026-10-02 | 2026-10-02 |
| `20261002120200_resources_underwriting_copy_dad_cut.sql`              | 2026-10-02 | 2026-10-02 |
| `20261002130000_log_automated_hours.sql`                              | 2026-10-02 | 2026-10-02 |
| `20261002130100_log_automated_hours_underwriting_read.sql`            | 2026-10-02 | 2026-10-02 |
| `20261002130200_resources_log_automated_hours.sql`                    | 2026-10-02 | 2026-10-02 |
| `20261002140000_log_dad_export.sql`                                   | 2026-10-02 | 2026-10-02 |
| `20261002140100_resources_log_dad_log.sql`                            | 2026-10-02 | 2026-10-02 |
| `20261002140200_log_import_copy_kind_follows_script.sql`              | 2026-10-02 | 2026-10-02 |
| `20261002150000_broadcast_roles_stackable.sql`                        | 2026-10-02 | 2026-10-02 |
| `20261002150100_resources_broadcast_roles.sql`                        | 2026-10-02 | 2026-10-02 |
| `20261002160000_underwriting_copy_dad_recorded.sql`                   | 2026-10-02 | 2026-10-02 |
| `20261002160100_resources_underwriting_recorded_in_dad.sql`           | 2026-10-02 | 2026-10-02 |
| `20261002170000_resources_log_station_ids.sql`                        | 2026-10-02 | 2026-10-02 |
| `20261002180000_on_air_and_traffic_names.sql`                         | 2026-10-02 | 2026-10-02 |
| `20261005120000_resources_log_automation_tab_and_station_ids.sql`     | 2026-10-05 | 2026-10-05 |
| `20261005130000_log_underwriting_hours.sql`                           | 2026-10-05 | 2026-10-05 |
| `20261005130100_resources_log_underwriting_hours.sql`                 | 2026-10-05 | 2026-10-05 |
| `20261005140000_bookings_foundation.sql`                              | 2026-10-05 | 2026-10-05 |
| `20261005140100_resources_bookings_rate_model.sql`                    | 2026-10-05 | 2026-10-05 |
| `20261005150000_bookings_term_plan.sql`                               | 2026-10-05 | 2026-10-05 |
| `20261005150100_resources_bookings_calendar.sql`                      | 2026-10-05 | 2026-10-05 |
| `20261005160000_bookings_labor_and_pools.sql`                         | 2026-10-06 | 2026-10-06 |
| `20261005160100_resources_bookings_labor_and_pools.sql`               | 2026-10-06 | 2026-10-06 |
| `20261006120000_bookings_projects.sql`                                | 2026-10-06 | 2026-10-06 |
| `20261006120100_resources_bookings_projects.sql`                      | 2026-10-06 | 2026-10-06 |
| `20261006130000_bookings_public_intake.sql`                           | 2026-10-06 | 2026-10-06 |
| `20261006130100_resources_bookings_intake.sql`                        | 2026-10-06 | 2026-10-06 |
| `20261006140000_bookings_partners_agreements.sql`                     | 2026-10-06 | 2026-10-06 |
| `20261006140100_resources_bookings_partners.sql`                      | 2026-10-06 | 2026-10-06 |
| `20261007120000_bookings_happy_path.sql`                              | 2026-10-06 | 2026-10-06 |
| `20261007120100_resources_bookings_happy_path.sql`                    | 2026-10-06 | 2026-10-06 |
| `20261007130000_bookings_cost_transparency.sql`                       | 2026-10-06 | 2026-10-06 |
| `20261007130100_resources_bookings_cost_transparency.sql`             | 2026-10-06 | 2026-10-06 |
| `20261007140000_bookings_model_corrections.sql`                       | 2026-10-06 | 2026-10-06 |
| `20261007140100_resources_bookings_model_corrections.sql`             | 2026-10-06 | 2026-10-06 |
| `20261007150000_bookings_settlement.sql`                              | 2026-10-06 | 2026-10-06 |
| `20261007150100_resources_bookings_settlement.sql`                    | 2026-10-06 | 2026-10-06 |
| `20261007160000_bookings_capacity_rules.sql`                          | 2026-10-07 | 2026-10-07 |
| `20261007160100_resources_bookings_capacity_rules.sql`                | 2026-10-07 | 2026-10-07 |
| `20261008120000_underwriting_copy_rotation_weights.sql`               | 2026-10-07 | 2026-10-07 |
| `20261008120100_resources_underwriting_rotation_weights.sql`          | 2026-10-07 | 2026-10-07 |
| `20261008180000_resources_workflow_overviews.sql`                     | 2026-10-08 | 2026-10-08 |
| `20261008190000_resources_reconcile_overviews.sql`                    | 2026-10-08 | 2026-10-08 |
| `20261008200000_resources_reconcile_editor_guides.sql`                | 2026-10-08 | 2026-10-08 |
| `20261008210000_resources_contextual_workflow_links.sql`              | 2026-10-08 | 2026-10-08 |
| `20261008220000_resources_contextual_detailed_links.sql`              | 2026-10-08 | 2026-10-08 |
| `20261008221000_resources_contextual_cross_tool_links.sql`            | 2026-10-08 | 2026-10-08 |
| `20261008230000_resources_reconcile_duplicate_traffic_guide.sql`      | 2026-10-08 | 2026-10-08 |
| `20261008235000_resources_remaining_contextual_links.sql`             | 2026-10-08 | 2026-10-08 |
| `20261008235500_resources_reconciled_workflow_overviews.sql`          | 2026-10-08 | 2026-10-08 |
| `20261008235900_resources_contextual_sop_crosslinks.sql`              | 2026-10-08 | 2026-10-08 |
| `20261009130000_resources_log_florida_news_exchange.sql`              | 2026-10-08 | 2026-10-08 |
| `20261009120000_resources_navigation_shapes.sql`                      | 2026-10-07 | 2026-10-07 |
| `20261009140000_log_weather_alerts.sql`                               | 2026-10-08 | 2026-10-08 |
| `20261009150000_resources_log_weather_alerts.sql`                     | 2026-10-08 | 2026-10-08 |
| `20261009160000_log_miss_reason_special_coverage.sql`                 | 2026-10-09 | 2026-10-09 |
| `20261009160100_log_rundown_supersede.sql`                            | 2026-10-09 | 2026-10-09 |
| `20261009160200_resources_log_one_time_clock_change.sql`              | 2026-10-09 | 2026-10-09 |
| `20261009170000_resources_log_switch_imported_rundowns.sql`           | 2026-10-09 | 2026-10-09 |
| `20261007170000_resources_bookings_rates_navigation.sql`              | 2026-10-07 | 2026-10-07 |
| `20261010120000_sourcework_project_overview.sql`                      | 2026-10-08 | 2026-10-08 |
| `20261010130000_resources_sourcework_workspace.sql`                   | 2026-10-08 | 2026-10-08 |
| `20261010140000_resources_sourcework_workspace_guides.sql`            | 2026-10-08 | 2026-10-08 |
| `20261010150000_resources_sourcework_scrubber_zoom.sql`               | 2026-10-08 | 2026-10-08 |
| `20261010160000_resources_sourcework_edit_source.sql`                 | 2026-10-09 | 2026-10-09 |
| `20261010170000_resources_logic_consolidation_notes.sql`              | 2026-10-09 | 2026-10-09 |
| `20261011120000_sourcework_pieces.sql`                                | 2026-10-09 | 2026-10-09 |
| `20261011130000_resources_sourcework_pieces.sql`                      | 2026-10-09 | 2026-10-09 |
| `20261012120000_sourcework_research.sql`                              | 2026-10-10 | 2026-10-10 |
| `20261012130000_resources_sourcework_research.sql`                    | 2026-10-10 | 2026-10-10 |
| `20261012140000_sourcework_research_detached_sources.sql`             | 2026-10-10 | 2026-10-10 |
| `20261013120000_sourcework_themes.sql`                                | 2026-10-10 | 2026-10-10 |
| `20261013130000_resources_sourcework_themes.sql`                      | 2026-10-10 | 2026-10-10 |
| `20261014120000_sourcework_suggested_quotes.sql`                      | 2026-10-10 | 2026-10-10 |
| `20261014130000_resources_sourcework_quotes.sql`                      | 2026-10-10 | 2026-10-10 |
| `20261015120000_sourcework_piece_formats.sql`                         | 2026-10-09 | 2026-10-09 |
| `20261015130000_resources_sourcework_draft_with_ai.sql`               | 2026-10-09 | 2026-10-09 |
| `20261016120000_tw_search_remove_data_point_branch.sql`                 | 2026-10-10 | 2026-10-10 |
| `20261017120000_sourcework_piece_format_catalog.sql`                    | 2026-10-10 | 2026-10-10 |
| `20261017130000_resources_sourcework_piece_formats.sql`                 | 2026-10-10 | 2026-10-10 |
| `20261018100000_sourcework_piece_delete_after_draft.sql`                | 2026-10-10 | 2026-10-10 |
| `20261018110000_sourcework_piece_formats_as_guardrails.sql`             | 2026-10-10 | 2026-10-10 |
| `20261018120000_resources_sourcework_format_guardrails.sql`              | 2026-10-10 | 2026-10-10 |

**Preview caught up 2026-09-24.** The two 2026-09-14 RLS migrations and the
2026-09-22/24 Log import migrations were first applied to production only —
preview was auto-paused, then unreachable by Postgres password
authentication. All four were applied to preview on 2026-09-24 (its
`schema_migrations` shows them at 13:03–13:08 UTC) and verified there: the
import copy-update function takes a duration, and no policy still calls
`has_log_access(auth.uid())` unwrapped.

Verified against both projects' `supabase_migrations.schema_migrations` on
2026-07-30: every file above is present in both, and neither project carries an
applied migration this repo doesn't have, except the one noted below. (The five
2026-08-08-timestamped Log/Underwriting redesign migrations above were applied
2026-08-07, ahead of their own filename timestamp — the timestamp prefix is a
sequencing identifier chosen when the files were written, not a claim about
when they'd be applied.)

## Resources content migrations recorded 2026-10-08

Ten Resources content migrations (`20261008180000` through `20261008235900`) were
found already present on both projects when `db:check` flagged them as unrecorded: their
guides and links were live, but they were run outside the migration tool, so neither
project's migration history lists them and the dates above are the day they were
verified, not the day they ran. `20261009130000_resources_log_florida_news_exchange.sql`
had not been run on either project; its two release notes and the rundown guide were
applied 2026-10-08. Its first statement (the Sources guide) was deliberately **not**
run: `20261009150000_resources_log_weather_alerts.sql` had already replaced that guide
with a version that includes both the Florida News Exchange and Weather alerts sections,
and running the older body afterwards would have removed the alerts section.

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
