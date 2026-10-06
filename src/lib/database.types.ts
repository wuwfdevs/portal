// Hand-written to match supabase/migrations/*, verified field-by-field
// against `supabase gen types` output from the live preview project
// (2026-07-25) — accurate as of that check. Hand-reconciled again on
// 2026-07-31 for the Sourcework migrations (sw_sources/sw_representations/
// sw_project_sources/sw_source_excerpts, tw_projects shrunk, tw_segments/
// tw_speakers/tw_chunks rekeyed to representation_id) — no local instance was
// running to regenerate against. Verified again on 2026-08-01 for Sourcework
// Phase 3b (sw_document_pages/sw_document_blocks/
// sw_document_processing_runs/sw_excerpt_document_locations, sw_sources.
// page_count, sw_source_excerpts.locator_kind + nullable start_ms/end_ms,
// tw_chunks.page_start/page_end/anchor_block_id, tw_search()'s page_number
// column, new sw_source_kind/sw_representation_kind enum values, new
// sw_document_block_type enum) — this time against the Supabase MCP
// server's `generate_typescript_types` output for the live preview project,
// field-by-field diffed; every field matched (the one deliberate
// improvement over the generator's raw output is nullability on
// `returns table` RPC columns like tw_search's, which the generator doesn't
// express but this file states explicitly — see docs/sourcework-design.md
// §8.8). Hand-reconciled again on 2026-08-01 for the Roadmap tool
// (rd_posts/rd_votes/rd_comments, the new rd_post_kind/rd_post_status enums,
// and 'proposed' on tool_status) against
// supabase/migrations/20260801120000_tool_status_proposed.sql and
// 20260801121000_roadmap.sql. Hand-updated again on 2026-08-03 for
// sw_document_blocks.lines (supabase/migrations/
// 20260803120000_sourcework_document_block_lines.sql) — no local instance
// running to regenerate against; a plain jsonb column, added by hand
// following the same SwDocumentBlockBbox-shaped-type pattern already used
// for bbox. Hand-updated again the same day for tw_search()'s two new
// optional filter args (20260803130000_tw_search_scoping.sql) — no output
// shape change, just two more optional Args fields. Hand-reconciled again
// the same day for the Academic Partnerships tool (ap_settings/
// ap_email_templates/ap_submissions/ap_submission_events, the new
// ap_partnership_type/ap_stage/ap_disposition/ap_fit/ap_capacity/ap_timing/
// ap_event_type enums, and the ap_public_form_config()/ap_submit_inquiry()
// RPC functions) against the Supabase MCP server's `generate_typescript_types`
// output for the live preview project, field-by-field diffed against
// supabase/migrations/20260803140000_academic_partnerships.sql; every field
// matched. Hand-updated again on 2026-08-05
// (supabase/migrations/20260805120000_academic_partnerships_multi_track.sql):
// ap_submissions.partnership_type (single ApPartnershipType) became
// partnership_types (ApPartnershipType[], non-empty), and
// enrollment_estimate was renamed estimated_students_reached — both
// verified directly against a live SQL check on the preview project (select
// against the renamed/retyped columns) rather than the generator, which
// wasn't re-run this pass. Kept hand-written rather than swapped for the
// generator's raw output on purpose: the generator emits a differently-shaped
// module (generic Tables<>/TablesInsert<>/Enums<> helpers, no named exports)
// that every existing import of PlatformRole, ToolStatus, EpFieldType, etc.
// across both tools would break against. Re-run `npm run db:types` (or the
// Supabase MCP server's `generate_typescript_types`, as this pass did) to
// re-verify after a schema change, but reconcile its output into this
// file's existing shape rather than replacing it outright. Hand-updated
// again on 2026-08-06 for Log's foundation slice (supabase/migrations/
// 20260806130000_log_foundation.sql): log_programs/log_clock_templates/
// log_clock_versions/log_clock_slots/log_schedule and the new
// LogProgramKind/LogScheduleEntryType/LogClockVersionVariant/
// LogSlotFillMode/LogSlotAssignmentMode/LogSlotTimingMode enums — no local
// instance running to regenerate against; added by hand following the
// ap_submissions block's Row/Insert/Update shape, insert-only tables
// (log_clock_versions/log_clock_slots) noted the same way as
// ap_submissions' insert-only comment. Hand-updated again on 2026-08-06
// (supabase/migrations/20260806140000_log_clock_slot_windows_and_schedule_
// times.sql): log_clock_slots gained earliest_start_offset_seconds/
// latest_start_offset_seconds/segment_label, and log_schedule gained
// air_time (not null) and duration_minutes (not null) — both tables were
// still empty in both environments at the time, confirmed directly, so no
// existing-row reconciliation was needed. Hand-updated again on 2026-08-06
// for Log's Slice 2 (supabase/migrations/20260806160000_log_content_library.sql):
// log_content_items/log_content_components and the new
// LogContentType/LogApprovalStatus/LogComponentType enums, added by hand
// following the same Row/Insert/Update shape as every other table here.
// Hand-updated again on 2026-08-07 for Log's Slice 3 (NPR + weather,
// supabase/migrations/20260807130000_log_npr_weather.sql):
// log_npr_rundown_cache/log_weather_reading and the new LogNprStatus enum —
// no local instance running to regenerate against; added by hand following
// the same shape as every table here. Like every log_ enum before it,
// LogNprStatus was exported as a plain type alias rather than added to the
// Enums map at the bottom of this file — that map already omits every other
// log_ enum from Slices 1-2, so adding just this one would have been
// inconsistent rather than fixing anything. Hand-updated again on
// 2026-08-07 to correct Slice 3's NPR half to the real CDS model
// (supabase/migrations/20260807140000_log_npr_cds_correction.sql — see
// CLAUDE.md): log_npr_rundown_cache and LogNprStatus are gone entirely,
// replaced by log_npr_episodes/log_npr_episode_items and the new
// LogNprEpisodeStatus enum (also a plain type alias, same reasoning as
// above); log_programs gained npr_collection_id. Verified against the
// Supabase MCP server's generate_typescript_types output for the live
// preview project after applying, field-by-field diffed. Hand-updated again
// on 2026-08-07 for Log's rundown-generation slice
// (supabase/migrations/20260807150000_log_rundowns.sql): log_rundowns/
// log_rundown_items and the new LogRundownStatus/LogRequirementLevel/
// LogPlacementStatus/LogItemWarning enums (plain type aliases, same as
// every other log_ enum) — added by hand following the same Row/Insert/
// Update shape as every table here, then verified against the Supabase MCP
// server's generate_typescript_types output for the live preview project
// after applying. Hand-updated again on 2026-08-07 for Log's host-console
// slice (supabase/migrations/20260807160000_log_broadcast_events.sql):
// log_broadcast_events and the new LogBroadcastOutcome/LogConfirmationSource/
// LogMissReason enums (plain type aliases, same as every other log_ enum) —
// added by hand, then verified against the Supabase MCP server's
// generate_typescript_types output for the live preview project after
// applying. Hand-updated again on 2026-08-07 for Underwriting & Traffic's
// Slice 1 (supabase/migrations/20260807200000_underwriting_foundation.sql):
// uw_contracts/uw_placement_obligations/uw_copy/uw_contract_copy and the new
// UwContractStatus/UwQuantityPeriod/UwSponsorshipPosition/UwObligationStatus/
// UwCopyApprovalStatus/UwCopyProductionStatus enums (plain type aliases,
// same as every log_ enum before them) — added by hand, then verified
// against the Supabase MCP server's generate_typescript_types output for the
// live preview project after applying. Hand-updated again on 2026-08-07 for
// Underwriting's Slice 2, the two-way Log boundary
// (supabase/migrations/20260807210000_underwriting_placement.sql):
// log_rundown_items gained item_kind/underwriting_copy_id; uw_scheduled_
// placements and the new UwPlacementStatus enum were added; and the three
// jsonb-returning security definer functions
// (log_list_placeable_rundown_items/log_place_underwriting_credit/
// log_clear_underwriting_credit) were added to the Functions map, typed by
// their documented payload shape per every al_*/ri_* function's own
// precedent above — added by hand, then verified against the Supabase MCP
// server's generate_typescript_types output for the live preview project
// after applying. Hand-updated again on 2026-08-07 for Underwriting's
// Slice 3, the exception queue
// (supabase/migrations/20260807220000_underwriting_exceptions.sql):
// uw_exceptions and the new UwComplianceJudgment/UwResolutionStatus/
// UwResolutionAction enums (plain type aliases, same as every log_ enum
// before them) — added by hand, then verified against the Supabase MCP
// server's generate_typescript_types output for the live preview project
// after applying. This migration's two trigger functions
// (uw_guard_exception_resolution/uw_flag_exception_from_broadcast_event)
// aren't in the Functions map — they're never called via .rpc(), only
// fired by Postgres itself. Hand-updated again on 2026-08-07 for
// Underwriting's Slice 4, makegoods
// (supabase/migrations/20260807240000_underwriting_makegoods.sql):
// uw_makegoods and the new UwMakegoodStatus enum. Its trigger function
// (uw_update_makegood_from_broadcast_event) isn't in the Functions map for
// the same reason as Slice 3's two. Hand-updated again on 2026-08-07 for
// Underwriting's Slice 5, affidavits
// (supabase/migrations/20260807250000_underwriting_affidavits.sql):
// uw_affidavits/uw_affidavit_line_items and the new UwAffidavitStatus enum;
// its guard trigger (uw_guard_affidavit_certification) is likewise not in
// the Functions map. Hand-updated again on 2026-08-08 for the Log and
// Underwriting domain redesign (see CLAUDE.md's "Log domain redesign" and
// "Underwriting domain redesign" notes) — no local instance running to
// regenerate against. Log: log_clock_slots dropped fill_mode/
// assignment_mode/permitted_content_types/replaceable/shortenable/
// allow_empty/allow_multiple/lock_on_air entirely
// (20260808120000_log_local_opportunities.sql); new log_local_opportunities
// table and LogOpportunityRequirement enum; log_rundown_items (in its old
// one-row-per-clock-slot shape) and log_broadcast_events were dropped and
// recreated as log_rundown_breaks (new) + a redesigned log_rundown_items
// (zero or more placements per break, with override_* per-airing columns)
// + log_broadcast_events unchanged in shape (20260808130000_log_rundown_
// breaks.sql); log_content_items/log_content_components swapped
// audio_object_path for dad_cart_number (20260808140000_log_content_dad_
// and_media_removal.sql). Underwriting: new uw_underwriters table;
// uw_contracts swapped underwriter_name for underwriter_id and
// agreement_document_url for agreement_document_path, gained
// affidavit_required/sponsorship_category/sponsorship_total/
// preemption_policy; uw_placement_obligations dropped entirely, replaced by
// uw_contract_schedule_lines; uw_copy dropped production_status and
// audio_object_path, gained execution_kind and label; uw_scheduled_
// placements/uw_exceptions/uw_makegoods renamed obligation_id to
// schedule_line_id (and clock_slot_label to break_label);
// UwQuantityPeriod/UwSponsorshipPosition/UwObligationStatus/
// UwCopyProductionStatus are gone, replaced by UwCopyExecutionKind
// (20260808200000_underwriting_redesign.sql). The three boundary functions
// were renamed/retyped (log_list_placeable_rundown_items ->
// log_list_placeable_rundown_breaks, log_place_underwriting_credit's args
// changed shape) and log_list_programs was added. Hand-updated again on
// 2026-08-09 for 20260809140000_underwriting_break_adjacency.sql:
// log_list_placeable_rundown_breaks' return shape gained last_item_id
// (nullable) on each break, for the auto-fill scheduler's same-underwriter/
// same-industry adjacency check — no local instance running to regenerate
// against. Hand-updated again on 2026-08-10 for
// 20260809170000_log_local_opportunities_slot_based.sql: log_local_
// opportunities dropped position/label/timing_mode/start_offset_seconds/
// duration_seconds/earliest_/latest_start_offset_seconds/allow_multiple in
// favor of a single slot_id reference (a local opportunity now marks an
// existing network slot as locally eligible, rather than authoring an
// independent time range); log_rundown_breaks dropped allow_multiple
// entirely (no item-count cap anywhere — the only real limit is remaining
// duration). Hand-reconciled again on 2026-08-10 for
// 20260810120000_log_opportunity_assignments.sql (new log_opportunity_
// assignments table, log_generate_rundown_for_underwriting's breaks gained
// local_opportunity_id) and 20260810130000_log_opportunity_assignment_
// placement_boundary.sql (log_get_program_schedule_context widened with
// opportunity_assignments/content_items, new log_insert_rundown_items_for_
// underwriting function) against the Supabase MCP server's
// `generate_typescript_types` output for the live preview project,
// field-by-field diffed; every field matched. Hand-updated again on
// 2026-08-10 for 20260810150000_log_content_library_field_trim.sql:
// log_content_items dropped eligible_program_ids/priority/
// frequency_guidance/reusable/geography_tags/subject_tags/
// reporter_or_editor/dad_cart_number (none were ever read for any filter,
// sort, or eligibility decision — see CLAUDE.md); log_content_components
// dropped dad_cart_number for the same reason. Hand-reconciled again on
// 2026-08-20 for 20260820120000_editorial_inquiry.sql (new tool: ei_inquiries/
// ei_questions/ei_context_notes/ei_chat_messages, ei_create_inquiry()) against
// the Supabase MCP server's `generate_typescript_types` output for the live
// preview project, field-by-field diffed; every field matched. Kept this
// file's own compact Insert/Update-as-Partial<Row> idiom rather than the
// generator's fully-spelled-out blocks, matching every other table here.
// Hand-reconciled again on 2026-08-20 for
// 20260820130000_editorial_inquiry_grounded_reasoning.sql: ei_inquiries
// dropped seed_question for pillar_id/pillar_name_snapshot/
// guiding_question_text; ei_questions dropped has_assumption/assumption_text
// for diagnosis_kind/diagnosis_note; ei_context_notes gained
// evidentiary_status/source_title/source_url; ei_chat_messages gained
// citations; ei_create_inquiry's Args changed from p_seed_question (text) to
// p_pillar_id (uuid) — against the Supabase MCP server's
// `generate_typescript_types` output for the live preview project,
// field-by-field diffed; every field matched. Hand-updated again on
// 2026-08-21 for 20260821130000_log_npr_item_durations.sql:
// log_npr_episode_items gained duration_seconds (integer, nullable) — and
// again the same day for 20260821140000_log_npr_feed_start_hour.sql:
// log_programs gained npr_feed_start_hour_et (smallint, nullable).
// Hand-updated again on 2026-08-26 for
// 20260826120000_log_content_library_dad_import.sql: log_content_items
// gained dad_cart_number/dad_group (text, nullable) and
// log_content_components gained dad_cart_number (text, nullable) — verified
// directly against the live preview project's information_schema after
// applying, since this pair was dropped once before (20260810150000) for
// being unused and shouldn't silently reappear with a mismatched shape.
// Hand-updated again the same day for
// 20260826130000_log_weather_daily_outlook.sql: log_weather_reading gained
// daily_outlook (jsonb, not null default '[]') — typed unknown, the same
// convention as log_npr_episodes.raw above, not the generator's own `Json`
// alias (this file doesn't define one); verified against the Supabase MCP
// server's generate_typescript_types output for the live preview project
// after applying. Hand-updated again the same day for
// 20260826140000_log_weather_forecast_periods.sql: log_weather_reading
// gained forecast_periods (jsonb, not null default '[]'), same unknown
// convention — verified against the live preview project's
// information_schema after applying. Hand-updated again on 2026-09-01 for
// 20260901120000_log_npr_episode_cache_atomic.sql: adds the
// log_replace_npr_episode_cache RPC (Functions, near the other log_*
// entries) — checked against the Supabase MCP server's
// generate_typescript_types output for the live production project after
// applying to both, with p_npr_episode_id/p_title/p_raw/p_items
// hand-corrected to nullable (the generator infers non-null from the SQL
// parameter types alone, missing that these are null on a "not_found"
// status) and p_raw/the Row's own raw kept as `unknown`, matching this
// file's existing convention rather than the generator's `Json` alias.

export type PlatformRole = "administrator" | "staff" | "student" | "faculty_partner";
export type AccountStatus = "invited" | "pending" | "active" | "disabled";
// 'proposed' is a tool that only exists as an idea on the Roadmap tool — see
// supabase/migrations/20260801120000_tool_status_proposed.sql and
// docs/roadmap-design.md §6. Excluded from the dashboard and from the admin
// grant pickers; visible to Roadmap members so a post can target it.
export type ToolStatus = "available" | "in_development" | "planned" | "proposed";
export type AccessRequestStatus = "pending" | "approved" | "denied";
export type ToolDefaultAccess = "invite_only" | "approved_staff" | "open";

// Sourcework (sw_*) — see supabase/migrations/20260731120000_sourcework_sources_representations.sql,
// 20260731130000_sourcework_source_excerpts.sql, and 20260731180000_sourcework_documents.sql.
export type SwSourceKind = "audio_video" | "document";
export type SwSourceStatus = "uploading" | "ready" | "failed";
// 'ocr_text'/'translated_text' are unused placeholder values from Phase 1 — no
// code path reads or writes them. 'document_text' is the kind Phase 3b
// actually uses, for both native-extraction and OCR-produced text — see
// docs/sourcework-design.md §8.3 on why it isn't 'ocr_text'.
export type SwRepresentationKind = "transcript" | "ocr_text" | "translated_text" | "document_text";
export type SwRepresentationStatus = "pending" | "processing" | "ready" | "failed";
export type SwDocumentBlockType =
  | "heading"
  | "paragraph"
  | "list_item"
  | "table"
  | "table_cell"
  | "figure"
  | "caption"
  | "header"
  | "footer"
  | "other";
/** A block's stored location, fractional (0..1) of page width/height — resolution-independent. */
export interface SwDocumentBlockBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** Native extraction only: one line's block-relative offset range + bbox — see sw_document_blocks.lines. */
export interface SwDocumentBlockLine {
  startOffset: number;
  endOffset: number;
  bbox: SwDocumentBlockBbox;
}
export type SwExcerptLocatorKind = "temporal" | "document";
export type SwDocumentProcessingMethod = "native" | "ocr";
export type SwDocumentProcessingRunStatus = "processing" | "ready" | "failed";

// Editorial Planning (ep_*) — see supabase/migrations/20260722130000_editorial_planning.sql
// and supabase/migrations/20260730130000_editorial_strategic_refinement.sql.
export type EpFieldType = "short_text" | "long_text" | "select" | "multi_select" | "date" | "url";
export type EpPitchStatus = "open" | "assigned" | "archived";
export type EpMeetingStatus = "open" | "agenda" | "concluded";
export type EpDecisionOutcome = "assigned" | "deferred" | "archived";
/** ep_pitch_values.value: a string for most field types, string[] for multi_select. */
export type EpFieldValue = string | string[];
/** core: part of the weighted editorial-merit average. modifier: scored separately — see ep_settings.modifier_min_core_score. */
export type EpCriterionType = "core" | "modifier";
/** ep_criteria.anchors: score (as a string key, e.g. "0".."4") -> anchor description. */
export type EpCriterionAnchors = Record<string, string>;
export type EpRecommendation =
  | "advance"
  | "advance_with_revisions"
  | "hold_for_development"
  | "needs_more_reporting"
  | "defer"
  | "decline"
  | "route_to_immediate_news";
export type EpConcernFlag =
  | "focus_scope"
  | "reporting_path"
  | "duplication"
  | "resource_conflict"
  | "viewpoint_breadth"
  | "framing"
  | "verification"
  | "ethics_harm"
  | "editorial_independence";
export type EpStoryPlanStatus = "draft" | "ready_for_editor" | "approved";
export type EpOtrStatus = "not_applicable" | "not_yet_sought" | "in_progress" | "declined" | "obtained";
export type EpStandardsFlag = "ethics_harm" | "editorial_independence" | "verification" | "framing";

// Remote Interview (ri_*) — see supabase/migrations/20260729120000_remote_interview_schema.sql.
export type RiSessionStatus =
  | "scheduled"
  | "live"
  | "recording"
  | "processing"
  | "ready"
  | "needs_recovery"
  | "failed";
export type RiParticipantRole = "host" | "guest";
export type RiTrackSource = "local" | "cloud";
export type RiTrackStatus =
  | "recording"
  | "uploading"
  | "assembling"
  | "complete"
  | "partial"
  | "missing"
  | "failed";

// Audience Listening (al_*) — see supabase/migrations/20260730170000_audience_listening.sql.
export type AlQueryStatus = "draft" | "open" | "closed" | "archived";
export type AlFieldMode = "hidden" | "optional" | "required";
export type AlTranscriptionMode = "automatic" | "manual";
export type AlSubmissionStatus = "in_progress" | "submitted";
export type AlReviewState = "new" | "reviewed" | "flagged" | "rejected";
export type AlAnswerStatus = "pending" | "uploaded" | "failed";
export type AlTranscriptionState = "none" | "queued" | "sent" | "failed";
/** Whether the public route may accept a submission right now. */
export type AlPublicState = "open" | "not_yet_open" | "closed";

// Academic Partnerships (ap_*) — see
// supabase/migrations/20260803140000_academic_partnerships.sql.
export type ApPartnershipType =
  | "classroom_visit"
  | "station_immersion"
  | "applied_project"
  | "internship_practicum"
  | "faculty_research"
  | "other";
export type ApStage =
  | "new"
  | "reviewing"
  | "meeting_requested"
  | "scoping"
  | "approved"
  | "active"
  | "completed";
export type ApDisposition = "deferred" | "declined" | "withdrawn" | "archived";
export type ApFit = "strong" | "possible" | "weak";
export type ApCapacity = "available" | "uncertain" | "unavailable";
export type ApTiming = "feasible" | "requires_adjustment" | "not_feasible";
export type ApEventType =
  | "received"
  | "owner_changed"
  | "stage_changed"
  | "note"
  | "email_action"
  | "appointment_shared"
  | "disposition_changed"
  | "assessment_updated"
  | "next_action_updated"
  | "completed";
/** Exactly what ap_public_form_config() returns — the public view of settings. */
export interface ApPublicFormConfig {
  is_open: boolean;
  intro_copy: string;
  enabled_partnership_types: ApPartnershipType[];
}

// Log (log_*) — see supabase/migrations/20260806130000_log_foundation.sql.
// Slice 1 (Foundation) only: programs, clock templates/versions/slots, and
// the schedule — see docs/log-design.md and CLAUDE.md's Log section for the
// remaining slices' tables (content library, NPR/weather, rundowns,
// broadcast events), not yet in this file.
export type LogProgramKind = "recurring" | "special";
export type LogScheduleEntryType = "recurring" | "override" | "holiday";
export type LogClockVersionVariant =
  | "weekday"
  | "weekend"
  | "program_specific"
  | "holiday"
  | "special_event";
export type LogSlotTimingMode = "fixed" | "float";
// Domain redesign (2026-08-08) — see supabase/migrations/
// 20260808120000_log_local_opportunities.sql and CLAUDE.md's "Log domain
// redesign" note. LogSlotFillMode/LogSlotAssignmentMode are gone —
// log_clock_slots no longer carries fill/assignment information at all
// (fill_mode, assignment_mode, permitted_content_types, replaceable,
// shortenable, allow_empty, allow_multiple, lock_on_air were all dropped).
// LogOpportunityRequirement is the new local-opportunity overlay's own
// two-value distinction.
export type LogOpportunityRequirement = "optional" | "required";
// Slice 2 (content library) — see supabase/migrations/20260806160000_log_content_library.sql.
export type LogContentType =
  | "news"
  | "station_promo"
  | "program_promo"
  | "membership_message"
  | "university_announcement"
  | "psa"
  | "legal_id"
  | "interview_feature"
  | "host_created";
export type LogApprovalStatus = "draft" | "approved" | "retired";
export type LogComponentType = "live_intro" | "recorded_audio" | "live_outro" | "optional_tag";
// Slice 3 (NPR + weather) — see supabase/migrations/20260807130000_log_npr_weather.sql.
// NPR CDS correction (2026-08-07) — see supabase/migrations/
// 20260807140000_log_npr_cds_correction.sql and CLAUDE.md: replaced the
// prototype's invented draft/edited/revised/withdrawn segment-status
// vocabulary with the real CDS distinction between an episode CDS actually
// returned and one it confirmed doesn't exist for that date.
export type LogNprEpisodeStatus = "found" | "not_found";
// Slice 4 (rundown generation + timing engine) — see
// supabase/migrations/20260807150000_log_rundowns.sql. log_broadcast_events
// and its outcome/reason vocabulary are not in this file yet — that table
// belongs to the next slice (the host console with mid-broadcast actions).
export type LogRundownStatus = "draft" | "generated" | "in_progress" | "submitted";
export type LogPlacementStatus = "locked" | "movable" | "replaceable" | "editable";
// Domain redesign (2026-08-08) — see supabase/migrations/
// 20260808130000_log_rundown_breaks.sql and 20260808200000_underwriting_
// redesign.sql. log_rundown_items no longer exists in the old
// one-row-per-clock-slot shape; log_rundown_breaks (one per local
// opportunity occurrence) plus a redesigned log_rundown_items (zero or more
// placements inside a break) replace it. LogRequirementLevel and
// LogItemWarning are gone — requirement now lives on log_rundown_breaks as
// LogOpportunityRequirement (see above), snapshotted from the opportunity
// at generation time, and there is no stored warning column at all (fit is
// always derived — see lib/log/timing.ts). item_kind is plain text with a
// check constraint (not a Postgres enum, so a later ALTER TABLE could widen
// it without the same-transaction restriction a new enum value hits) —
// LogRundownItemKind is this file's own convenience alias for it.
export type LogRundownItemKind = "content" | "live_read" | "weather" | "underwriting_credit";
// Slice 5 (the host console + mid-broadcast actions) — see
// supabase/migrations/20260807160000_log_broadcast_events.sql. This slice's
// own code only ever writes 'aired_as_scheduled' | 'missed' | 'skipped' —
// see that migration's file header for the rest of the vocabulary's status.
export type LogOnAirMode = "automated" | "live";
/** Hours closed to underwriting auto-fill (20261005130000) — lib/log/underwriting-hours.ts. */
export type LogUnderwritingHoursMode = "closed" | "open";

export type LogBroadcastOutcome =
  | "scheduled"
  | "aired_as_scheduled"
  | "aired_different_time"
  | "partially_aired"
  | "skipped"
  | "missed"
  | "replaced"
  | "wrong_copy_aired"
  | "unconfirmed"
  | "pending_review"
  | "makegood_scheduled"
  | "makegood_aired"
  | "waived";
export type LogConfirmationSource = "automation" | "host" | "exception_report" | "management_correction";
export type LogMissReason =
  | "network_timing"
  | "breaking_news"
  | "segment_overrun"
  | "technical_problem"
  | "host_error"
  | "unavailable_copy"
  | "other";

// Underwriting & Traffic (uw_*) — Slice 1 (Foundation). See
// supabase/migrations/20260807200000_underwriting_foundation.sql.
export type UwContractStatus = "draft" | "active" | "expired" | "terminated";
export type UwCopyApprovalStatus = "draft" | "approved" | "expired" | "retired";
// Legacy-agreement migration (20260929200000) — see docs/underwriting-
// traffic-redesign.md §14.
export type UwAgreementMigrationStatus = "pending" | "processing" | "imported" | "failed";
// Domain redesign (2026-08-08) — see supabase/migrations/
// 20260808200000_underwriting_redesign.sql and CLAUDE.md's "Underwriting
// domain redesign" note, grounded in the real WUWF Autumn Beck Blackledge
// agreement. UwQuantityPeriod, UwSponsorshipPosition, UwObligationStatus,
// and UwCopyProductionStatus are all gone: uw_placement_obligations was
// replaced by uw_contract_schedule_lines (a real recurring-schedule shape,
// not an abstract quantity/period); sponsorship_position had no basis in
// the real agreement and no real enforcement; obligation/fulfillment status
// is now always derived (lib/underwriting/fulfillment.ts), never a stored
// enum; and production_status doesn't fit a live-read message at all —
// replaced by UwCopyExecutionKind, which is descriptive, not a workflow gate.
export type UwCopyExecutionKind = "live_read" | "recorded";
// Slice 2 (placement) — see supabase/migrations/20260807210000_underwriting_placement.sql.
export type UwPlacementStatus = "scheduled" | "locked" | "conflict" | "superseded";
// Slice 3 (exception queue) — see supabase/migrations/20260807220000_underwriting_exceptions.sql.
export type UwComplianceJudgment = "compliant" | "noncompliant" | "pending";
export type UwResolutionStatus = "open" | "resolved";
export type UwResolutionAction =
  | "accept_alternate"
  | "schedule_makegood"
  | "reassign"
  | "waive"
  | "clarification_requested"
  | "corrected"
  | "closed";
// Slice 4 (makegoods) — see supabase/migrations/20260807240000_underwriting_makegoods.sql.
export type UwMakegoodStatus = "scheduled" | "aired" | "cancelled";
// Slice 5 (affidavits) — see supabase/migrations/20260807250000_underwriting_affidavits.sql.
export type UwAffidavitStatus = "draft" | "certified";
// Insertion-order-grounded redesign (2026-09-25) — see
// supabase/migrations/20260925120000_underwriting_traffic_redesign.sql and
// docs/underwriting-traffic-redesign.md. Four typed schedule-rule shapes
// replace the one-recurrence line; pools, flights, allocations, per-period
// placements, agency makegood approval and a separation policy are new.
export type UwScheduleLineStatus = "active" | "cancelled";
export type UwFlightStatus = "active" | "cancelled";
export type UwSeparationPolicy = "unspecified" | "none" | "min_minutes";
export type UwMakegoodApproval = "not_required" | "pending" | "approved" | "declined";
// Second pass (2026-09-25) — see
// supabase/migrations/20260925150000_underwriting_demand_buckets.sql: schedule
// lines are eligibility only, demand is explicit buckets, and contracts have
// revisions.
export type UwRevisionStatus = "draft" | "current" | "superseded" | "cancelled";
export type UwScheduleEntryKind =
  | "fixed_days"
  | "weekly_quota"
  | "monthly_quota"
  | "every_n_weeks"
  | "explicit_dates"
  | "week_grid"
  | "range_total";
export type UwTimeMode = "any" | "window" | "preferred" | "exact" | "opening" | "closing";
export type UwServiceLevel = "guaranteed" | "bonus";
export type UwDemandBucketStatus = "active" | "superseded" | "cancelled";

// Roadmap (rd_*) — see supabase/migrations/20260801121000_roadmap.sql.
export type RdPostKind = "feature" | "improvement" | "bug" | "new_tool";
export type RdPostStatus =
  | "open"
  | "under_review"
  | "planned"
  | "in_progress"
  | "shipped"
  | "declined";
// Resources (20260928140000_resources.sql)
export type RcKind = "procedure" | "guide" | "release_note";
export type RcSource = "editor" | "release";

// Bookings (20261005140000_bookings_foundation.sql) — lib/bookings/rates.ts.
export type BkVersionStatus = "draft" | "submitted" | "adopted" | "superseded";
export type BkValidationState = "pending" | "validated" | "accepted_as_is";
export type BkAssumptionSection = "sourced" | "working";
// Slice 2b (20261005160000_bookings_labor_and_pools.sql): a budget line
// belongs to the shared pool or to one own-lines pool; the two model inputs
// the math still reads directly are external_margin_share and assessment_share.
export type BkAssumptionKind = "pool_line" | "model_input";
export type BkAssumptionOwner = "finance" | "director" | "executive";
export type BkPayBasis = "salaried" | "hourly";
export type BkPoolCosting = "allocated" | "own_lines";
export type BkAssetFunding = "station" | "foundation_gift" | "grant_restricted" | "uwf";
export type BkAssetBurden = "low" | "medium" | "high";
export type BkAssetCondition = "good" | "fair" | "worn" | "out_of_service";
export type BkRateCardLineKind = "package" | "labor";
// Slice 2 (20261005150000_bookings_term_plan.sql).
export type BkTermPlanStatus = "draft" | "active" | "closed";
export type BkHoldKind = "core" | "maintenance";
// Slice 3 (20261006120000_bookings_projects.sql) added 'planned': a project's
// date before its estimate is sent — not a hold, not live, not checked.
export type BkBookingStatus = "planned" | "tentative" | "confirmed" | "released";
export type BkPricingTreatment = "strategic" | "incremental" | "external";
// Slice 3 (20261006120000_bookings_projects.sql) — lib/bookings/projects.ts.
export type BkPartnerKind = "uwf_unit" | "external";
export type BkRequested = "production" | "airtime" | "both";
export type BkProjectStage = "request" | "estimate" | "booked" | "delivered" | "settled";
export type BkProjectDisposition = "deferred" | "declined" | "withdrawn";
export type BkProjectSource = "public" | "staff";
export type BkEditorialReview = "not_needed" | "needed" | "cleared";
export type BkEstimateLineKind = "package" | "labor" | "expense";
export type BkAirtimeTreatment = "contributed" | "paid";
export type BkAirtimeHonoredIn = "pending" | "traffic" | "on_air";
export type BkAgreementStatus = "draft" | "active" | "ended";
/** Exactly what bk_public_form_config() returns — the public view of bk_settings (slice 4). */
export interface BkPublicFormConfig {
  is_open: boolean;
  intro_copy: string;
  closed_copy: string;
  offered_packages: string[];
}
/** One question as the public sees it — no internal_context. */
export interface PublicQuestionPayload {
  id: string;
  position: number;
  prompt: string;
  guidance: string | null;
  required: boolean;
  max_duration_seconds: number;
}
/**
 * Exactly what al_public_query() returns: the public view of a query. Notably
 * absent, and deliberately: internal_title, internal_notes, the questions'
 * internal_context, and anything at all about submissions.
 */
export interface PublicQueryPayload {
  public_id: string;
  public_title: string;
  public_intro: string;
  state: AlPublicState;
  opens_at: string | null;
  closes_at: string | null;
  consent_text: string;
  ask_contact_permission: boolean;
  ask_attribution_permission: boolean;
  allow_anonymous_request: boolean;
  fields: {
    name: AlFieldMode;
    email: AlFieldMode;
    phone: AlFieldMode;
    city: AlFieldMode;
    note: AlFieldMode;
  };
  questions: PublicQuestionPayload[];
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          /** Job title; pre-fills an Underwriting affidavit's signature line (20261001120100_profiles_title.sql). */
          title: string | null;
          platform_role: PlatformRole;
          account_status: AccountStatus;
          invited_by: string | null;
          last_active_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          email: string;
          display_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      tools: {
        Row: {
          id: string;
          key: string;
          name: string;
          description: string;
          route: string;
          status: ToolStatus;
          enabled: boolean;
          default_access: ToolDefaultAccess;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tools"]["Row"]> & {
          key: string;
          name: string;
          description: string;
          route: string;
        };
        Update: Partial<Database["public"]["Tables"]["tools"]["Row"]>;
        Relationships: [];
      };
      tool_access: {
        Row: {
          id: string;
          user_id: string;
          tool_id: string;
          tool_role: string | null;
          /** Source of truth for a grant's roles; tool_role mirrors its first element (trigger). */
          tool_roles: string[];
          granted_by: string | null;
          granted_at: string;
          revoked_at: string | null;
          revoked_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["tool_access"]["Row"]> & {
          user_id: string;
          tool_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["tool_access"]["Row"]>;
        Relationships: [];
      };
      access_requests: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          note: string | null;
          status: AccessRequestStatus;
          requested_at: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["access_requests"]["Row"]> & {
          email: string;
          display_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["access_requests"]["Row"]>;
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          target_type: string;
          target_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_events"]["Row"]> & {
          action: string;
          target_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_events"]["Row"]>;
        Relationships: [];
      };
      tw_projects: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          /** Generated column (title + description) — read-only. */
          search: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tw_projects"]["Row"]> & {
          title: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["tw_projects"]["Row"]>;
        Relationships: [];
      };
      sw_sources: {
        Row: {
          id: string;
          kind: SwSourceKind;
          title: string;
          interview_date: string | null;
          status: SwSourceStatus;
          error_message: string | null;
          original_storage_path: string | null;
          original_content_type: string | null;
          original_size_bytes: number | null;
          original_duration_ms: number | null;
          /** Paginated sources only (documents today). Null for audio/video — see docs/sourcework-design.md §8.2. */
          page_count: number | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sw_sources"]["Row"]> & {
          title: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["sw_sources"]["Row"]>;
        Relationships: [];
      };
      sw_representations: {
        Row: {
          id: string;
          source_id: string;
          parent_representation_id: string | null;
          kind: SwRepresentationKind;
          produced_by: string | null;
          config: unknown;
          status: SwRepresentationStatus;
          error_message: string | null;
          provider_job_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sw_representations"]["Row"]> & {
          source_id: string;
          kind: SwRepresentationKind;
        };
        Update: Partial<Database["public"]["Tables"]["sw_representations"]["Row"]>;
        Relationships: [];
      };
      sw_project_sources: {
        Row: {
          project_id: string;
          source_id: string;
          added_by: string;
          added_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sw_project_sources"]["Row"]> & {
          project_id: string;
          source_id: string;
          added_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["sw_project_sources"]["Row"]>;
        Relationships: [];
      };
      tw_speakers: {
        Row: {
          id: string;
          representation_id: string;
          diarization_label: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tw_speakers"]["Row"]> & {
          representation_id: string;
          diarization_label: string;
        };
        Update: Partial<Database["public"]["Tables"]["tw_speakers"]["Row"]>;
        Relationships: [];
      };
      tw_segments: {
        Row: {
          id: string;
          representation_id: string;
          speaker_id: string | null;
          position: number;
          start_ms: number;
          end_ms: number;
          text: string;
          words: unknown;
          text_edited: boolean;
          search: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tw_segments"]["Row"]> & {
          representation_id: string;
          position: number;
          start_ms: number;
          end_ms: number;
        };
        Update: Partial<Database["public"]["Tables"]["tw_segments"]["Row"]>;
        Relationships: [];
      };
      sw_source_excerpts: {
        Row: {
          id: string;
          source_id: string;
          representation_id: string | null;
          title: string;
          /** 'temporal' (start_ms/end_ms) or 'document' (sw_excerpt_document_locations) — see docs/sourcework-design.md §8.7. */
          locator_kind: SwExcerptLocatorKind;
          start_ms: number | null;
          end_ms: number | null;
          excerpt_text: string;
          /** Generated column (title + excerpt_text) — read-only. */
          search: string;
          /** pgvector column; written as a "[0.1,...]" literal, never read back into JS. */
          embedding: string | null;
          embedding_stale: boolean;
          export_storage_path: string | null;
          exported_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sw_source_excerpts"]["Row"]> & {
          source_id: string;
          title: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["sw_source_excerpts"]["Row"]>;
        Relationships: [];
      };
      tw_chunks: {
        Row: {
          id: string;
          representation_id: string;
          start_ms: number | null;
          end_ms: number | null;
          /** Document chunks only — see docs/sourcework-design.md §8.8. */
          page_start: number | null;
          page_end: number | null;
          anchor_block_id: string | null;
          text: string;
          /** pgvector column; written as a "[0.1,...]" literal, never read back into JS. */
          embedding: string | null;
          stale: boolean;
          /** Generated column — read-only. */
          search: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tw_chunks"]["Row"]> & {
          representation_id: string;
          text: string;
        };
        Update: Partial<Database["public"]["Tables"]["tw_chunks"]["Row"]>;
        Relationships: [];
      };
      sw_document_pages: {
        Row: {
          id: string;
          representation_id: string;
          page_number: number;
          width_pt: number | null;
          height_pt: number | null;
          rotation_degrees: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sw_document_pages"]["Row"]> & {
          representation_id: string;
          page_number: number;
        };
        Update: Partial<Database["public"]["Tables"]["sw_document_pages"]["Row"]>;
        Relationships: [];
      };
      sw_document_blocks: {
        Row: {
          id: string;
          representation_id: string;
          page_id: string;
          page_number: number;
          reading_order: number;
          block_type: SwDocumentBlockType;
          text: string;
          /** Fractional {x0,y0,x1,y1} of page width/height, or null — see docs/sourcework-design.md §8.4. */
          bbox: SwDocumentBlockBbox | null;
          /** Native extraction only: per-line offset ranges + bbox, finer than this block's own aggregate bbox. Empty for OCR blocks. */
          lines: SwDocumentBlockLine[];
          /** OCR only (0..1); null for native extraction. */
          confidence: number | null;
          source: "native" | "ocr";
          extra: Record<string, unknown>;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sw_document_blocks"]["Row"]> & {
          representation_id: string;
          page_id: string;
          page_number: number;
          reading_order: number;
          source: "native" | "ocr";
        };
        Update: Partial<Database["public"]["Tables"]["sw_document_blocks"]["Row"]>;
        Relationships: [];
      };
      sw_document_processing_runs: {
        Row: {
          id: string;
          representation_id: string;
          attempt: number;
          method: SwDocumentProcessingMethod;
          provider: string | null;
          provider_model: string | null;
          options: Record<string, unknown>;
          status: SwDocumentProcessingRunStatus;
          error_message: string | null;
          /** Provider's raw payload (OCR only) — diagnostics, never the primary read path. */
          raw_response: unknown;
          started_at: string;
          finished_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["sw_document_processing_runs"]["Row"]> & {
          representation_id: string;
          attempt: number;
          method: SwDocumentProcessingMethod;
        };
        Update: Partial<Database["public"]["Tables"]["sw_document_processing_runs"]["Row"]>;
        Relationships: [];
      };
      sw_excerpt_document_locations: {
        Row: {
          id: string;
          excerpt_id: string;
          sequence: number;
          page_number: number;
          block_id: string | null;
          start_offset: number | null;
          end_offset: number | null;
          bbox: SwDocumentBlockBbox | null;
        };
        Insert: Partial<Database["public"]["Tables"]["sw_excerpt_document_locations"]["Row"]> & {
          excerpt_id: string;
          sequence: number;
          page_number: number;
        };
        Update: Partial<Database["public"]["Tables"]["sw_excerpt_document_locations"]["Row"]>;
        Relationships: [];
      };
      ep_form_fields: {
        Row: {
          id: string;
          key: string;
          label: string;
          help_text: string | null;
          field_type: EpFieldType;
          options: string[] | null;
          required: boolean;
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ep_form_fields"]["Row"]> & {
          key: string;
          label: string;
          field_type: EpFieldType;
        };
        Update: Partial<Database["public"]["Tables"]["ep_form_fields"]["Row"]>;
        Relationships: [];
      };
      ep_criteria: {
        Row: {
          id: string;
          name: string;
          description: string;
          guidance: string | null;
          weight: number;
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
          criterion_type: EpCriterionType;
          scale_min: number | null;
          scale_max: number | null;
          anchors: EpCriterionAnchors | null;
          profile_id: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ep_criteria"]["Row"]> & {
          name: string;
          description: string;
          profile_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["ep_criteria"]["Row"]>;
        Relationships: [];
      };
      ep_settings: {
        Row: {
          id: boolean;
          scale_min: number;
          scale_max: number;
          modifier_min_core_score: number;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ep_settings"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["ep_settings"]["Row"]>;
        Relationships: [];
      };
      ep_rubric_profiles: {
        Row: {
          id: string;
          key: string;
          name: string;
          description: string | null;
          is_default: boolean;
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ep_rubric_profiles"]["Row"]> & {
          key: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["ep_rubric_profiles"]["Row"]>;
        Relationships: [];
      };
      ep_pitches: {
        Row: {
          id: string;
          title: string;
          status: EpPitchStatus;
          submitted_by: string | null;
          assigned_to: string | null;
          archived_reason: string | null;
          archived_by: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ep_pitches"]["Row"]> & {
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["ep_pitches"]["Row"]>;
        Relationships: [];
      };
      ep_pitch_values: {
        Row: {
          pitch_id: string;
          field_id: string;
          value: EpFieldValue;
        };
        Insert: Database["public"]["Tables"]["ep_pitch_values"]["Row"];
        Update: Partial<Database["public"]["Tables"]["ep_pitch_values"]["Row"]>;
        Relationships: [];
      };
      ep_meetings: {
        Row: {
          id: string;
          meeting_date: string;
          status: EpMeetingStatus;
          notes: string | null;
          created_by: string | null;
          agenda_at: string | null;
          concluded_at: string | null;
          created_at: string;
          rubric_profile_id: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ep_meetings"]["Row"]> & {
          meeting_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["ep_meetings"]["Row"]>;
        Relationships: [];
      };
      ep_meeting_pitches: {
        Row: {
          id: string;
          meeting_id: string;
          pitch_id: string;
          added_by: string | null;
          outcome: EpDecisionOutcome | null;
          assigned_to: string | null;
          rationale: string | null;
          decided_by: string | null;
          decided_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["ep_meeting_pitches"]["Row"]> & {
          meeting_id: string;
          pitch_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["ep_meeting_pitches"]["Row"]>;
        Relationships: [];
      };
      ep_reviews: {
        Row: {
          id: string;
          meeting_pitch_id: string;
          reviewer_id: string;
          comment: string | null;
          submitted_at: string;
          recommendation: EpRecommendation | null;
          concern_flags: EpConcernFlag[];
        };
        Insert: Partial<Database["public"]["Tables"]["ep_reviews"]["Row"]> & {
          meeting_pitch_id: string;
          reviewer_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["ep_reviews"]["Row"]>;
        Relationships: [];
      };
      ep_review_scores: {
        Row: {
          review_id: string;
          criterion_id: string;
          score: number;
          weight_snapshot: number;
          scale_snapshot: number;
          scale_min_snapshot: number;
        };
        Insert: Database["public"]["Tables"]["ep_review_scores"]["Row"];
        Update: Partial<Database["public"]["Tables"]["ep_review_scores"]["Row"]>;
        Relationships: [];
      };
      ep_story_plans: {
        Row: {
          id: string;
          pitch_id: string;
          status: EpStoryPlanStatus;
          central_question: string | null;
          public_service_value: string | null;
          frame_scope: string | null;
          deliverables: string | null;
          reporting_evidence_map: string | null;
          people_affected: string | null;
          decision_makers: string | null;
          expert_experiential_sources: string | null;
          main_interpretations: string | null;
          missing_perspective_assessment: string | null;
          source_concentration_risks: string | null;
          framing_risks: string | null;
          key_claims_to_verify: string | null;
          records_data_needed: string | null;
          otr_requirements: string | null;
          otr_status: EpOtrStatus;
          standards_flags: EpStandardsFlag[];
          reporter_id: string | null;
          editor_id: string | null;
          target_window: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ep_story_plans"]["Row"]> & {
          pitch_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["ep_story_plans"]["Row"]>;
        Relationships: [];
      };
      ep_story_plan_milestones: {
        Row: {
          id: string;
          story_plan_id: string;
          label: string;
          target_date: string | null;
          completed: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ep_story_plan_milestones"]["Row"]> & {
          story_plan_id: string;
          label: string;
        };
        Update: Partial<Database["public"]["Tables"]["ep_story_plan_milestones"]["Row"]>;
        Relationships: [];
      };
      ep_pillars: {
        Row: {
          id: string;
          name: string;
          guiding_question: string | null;
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ep_pillars"]["Row"]> & {
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["ep_pillars"]["Row"]>;
        Relationships: [];
      };
      al_queries: {
        Row: {
          id: string;
          public_id: string;
          internal_title: string;
          public_title: string;
          public_intro: string;
          internal_notes: string | null;
          status: AlQueryStatus;
          opens_at: string | null;
          closes_at: string | null;
          field_name: AlFieldMode;
          field_email: AlFieldMode;
          field_phone: AlFieldMode;
          field_city: AlFieldMode;
          field_note: AlFieldMode;
          consent_text: string;
          ask_contact_permission: boolean;
          ask_attribution_permission: boolean;
          allow_anonymous_request: boolean;
          transcription_mode: AlTranscriptionMode;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["al_queries"]["Row"]> & {
          public_id: string;
          internal_title: string;
          public_title: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["al_queries"]["Row"]>;
        Relationships: [];
      };
      al_questions: {
        Row: {
          id: string;
          query_id: string;
          position: number;
          prompt: string;
          guidance: string | null;
          internal_context: string | null;
          required: boolean;
          max_duration_seconds: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["al_questions"]["Row"]> & {
          query_id: string;
          position: number;
          prompt: string;
        };
        Update: Partial<Database["public"]["Tables"]["al_questions"]["Row"]>;
        Relationships: [];
      };
      al_submissions: {
        Row: {
          id: string;
          query_id: string;
          participant_user_id: string | null;
          status: AlSubmissionStatus;
          participant_name: string | null;
          participant_email: string | null;
          participant_phone: string | null;
          participant_city: string | null;
          participant_note: string | null;
          consent_contact: boolean;
          consent_identify: boolean;
          request_anonymous: boolean;
          consent_agreed_at: string | null;
          submitted_at: string | null;
          review_state: AlReviewState;
          internal_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        // Insert-only via al_start_submission(); no insert grant exists for
        // `authenticated`. Kept for completeness of the Row/Update shape.
        Insert: Partial<Database["public"]["Tables"]["al_submissions"]["Row"]> & {
          query_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["al_submissions"]["Row"]>;
        Relationships: [];
      };
      al_answers: {
        Row: {
          id: string;
          submission_id: string;
          query_id: string;
          question_id: string | null;
          question_prompt: string;
          question_position: number;
          question_required: boolean;
          status: AlAnswerStatus;
          storage_path: string;
          content_type: string;
          size_bytes: number | null;
          duration_ms: number | null;
          review_state: AlReviewState;
          internal_note: string | null;
          transcription_state: AlTranscriptionState;
          transcription_project_id: string | null;
          transcription_error: string | null;
          created_at: string;
          updated_at: string;
        };
        // Insert-only via al_reserve_answer(), as above.
        Insert: Partial<Database["public"]["Tables"]["al_answers"]["Row"]> & {
          submission_id: string;
          query_id: string;
          question_prompt: string;
          question_position: number;
          storage_path: string;
          content_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["al_answers"]["Row"]>;
        Relationships: [];
      };
      rd_posts: {
        Row: {
          id: string;
          title: string;
          /** ProseMirror JSON — see lib/rich-text.ts for the whitelist. */
          body: unknown;
          body_text: string;
          kind: RdPostKind;
          status: RdPostStatus;
          tool_id: string | null;
          proposed_tool_name: string | null;
          author_id: string;
          status_note: string | null;
          status_changed_at: string | null;
          status_changed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rd_posts"]["Row"]> & {
          title: string;
          author_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["rd_posts"]["Row"]>;
        Relationships: [];
      };
      rd_votes: {
        Row: {
          post_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rd_votes"]["Row"]> & {
          post_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["rd_votes"]["Row"]>;
        Relationships: [];
      };
      rc_articles: {
        Row: {
          id: string;
          slug: string;
          kind: RcKind;
          title: string;
          summary: string | null;
          /** ProseMirror JSON — see lib/rich-text.ts for the whitelist. */
          body: unknown;
          area: string | null;
          owner_role: string | null;
          tool_id: string | null;
          screen_keys: string[];
          released_on: string | null;
          sort_order: number;
          source: RcSource;
          version_note: string | null;
          needs_review: boolean;
          edited_since_release: boolean;
          version: number;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
          /** Generated; never written. */
          search_vector: unknown;
          /** Generated md5 of title/summary/body text; never written. */
          content_hash: string;
        };
        Insert: Partial<
          Omit<Database["public"]["Tables"]["rc_articles"]["Row"], "search_vector" | "content_hash">
        > & {
          slug: string;
          kind: RcKind;
          title: string;
        };
        Update: Partial<
          Omit<Database["public"]["Tables"]["rc_articles"]["Row"], "search_vector" | "content_hash">
        >;
        Relationships: [];
      };
      // Insert-only: written by triggers on rc_articles, never updated.
      rc_article_versions: {
        Row: {
          id: string;
          article_id: string;
          version: number;
          title: string;
          body: unknown;
          source: RcSource;
          note: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["rc_article_versions"]["Row"]> & {
          article_id: string;
          version: number;
          title: string;
          body: unknown;
          source: RcSource;
        };
        Update: Partial<Database["public"]["Tables"]["rc_article_versions"]["Row"]>;
        Relationships: [];
      };
      // Semantic search (20260928180000_resources_semantic_search.sql).
      rc_article_embeddings: {
        Row: {
          article_id: string;
          /** pgvector, sent and read as its text literal. */
          embedding: string;
          content_hash: string;
          embedded_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["rc_article_embeddings"]["Row"], "embedded_at"> & {
          embedded_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rc_article_embeddings"]["Row"]>;
        Relationships: [];
      };
      // Screenshots for figure nodes (20260928160000_resources_media.sql).
      rc_media: {
        Row: {
          id: string;
          article_id: string;
          object_path: string;
          width: number;
          height: number;
          alt: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rc_media"]["Row"]> & {
          article_id: string;
          object_path: string;
          width: number;
          height: number;
          alt: string;
        };
        Update: Partial<Database["public"]["Tables"]["rc_media"]["Row"]>;
        Relationships: [];
      };
      rc_release_note_guides: {
        Row: {
          release_note_id: string;
          guide_id: string;
        };
        Insert: Database["public"]["Tables"]["rc_release_note_guides"]["Row"];
        Update: Partial<Database["public"]["Tables"]["rc_release_note_guides"]["Row"]>;
        Relationships: [];
      };
      rc_pinned_procedures: {
        Row: {
          article_id: string;
          pinned_at: string;
          pinned_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["rc_pinned_procedures"]["Row"]> & {
          article_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["rc_pinned_procedures"]["Row"]>;
        Relationships: [];
      };
      rd_comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          body: unknown;
          body_text: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rd_comments"]["Row"]> & {
          post_id: string;
          author_id: string;
          body: unknown;
        };
        Update: Partial<Database["public"]["Tables"]["rd_comments"]["Row"]>;
        Relationships: [];
      };
      ri_sessions: {
        Row: {
          id: string;
          title: string;
          notes: string | null;
          scheduled_at: string | null;
          status: RiSessionStatus;
          recording_started_at: string | null;
          recording_stopped_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ri_sessions"]["Row"]> & {
          title: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["ri_sessions"]["Row"]>;
        Relationships: [];
      };
      ri_participants: {
        Row: {
          id: string;
          session_id: string;
          display_name: string;
          role: RiParticipantRole;
          profile_id: string | null;
          guest_user_id: string | null;
          join_token: string;
          token_expires_at: string | null;
          revoked_at: string | null;
          admitted_at: string | null;
          clock_offset_ms: number | null;
          storage_prefix: string;
          waiting_since: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ri_participants"]["Row"]> & {
          session_id: string;
          display_name: string;
          role: RiParticipantRole;
          join_token: string;
          storage_prefix: string;
        };
        Update: Partial<Database["public"]["Tables"]["ri_participants"]["Row"]>;
        Relationships: [];
      };
      ri_tracks: {
        Row: {
          id: string;
          participant_id: string;
          source: RiTrackSource;
          run_index: number;
          status: RiTrackStatus;
          started_at_ms: number | null;
          expected_part_count: number | null;
          storage_path: string | null;
          content_type: string | null;
          size_bytes: number | null;
          duration_ms: number | null;
          sample_rate: number | null;
          checksum: string | null;
          verified_at: string | null;
          assembled_at: string | null;
          error_message: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["ri_tracks"]["Row"]> & {
          participant_id: string;
          source: RiTrackSource;
        };
        Update: Partial<Database["public"]["Tables"]["ri_tracks"]["Row"]>;
        Relationships: [];
      };
      ri_track_parts: {
        Row: {
          id: string;
          track_id: string;
          sequence: number;
          storage_path: string;
          size_bytes: number;
          checksum: string;
          started_at_ms: number;
          duration_ms: number | null;
          uploaded_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ri_track_parts"]["Row"]> & {
          track_id: string;
          sequence: number;
          storage_path: string;
          size_bytes: number;
          checksum: string;
          started_at_ms: number;
        };
        Update: Partial<Database["public"]["Tables"]["ri_track_parts"]["Row"]>;
        Relationships: [];
      };
      ri_session_events: {
        Row: {
          id: string;
          session_id: string;
          participant_id: string | null;
          kind: string;
          detail: Record<string, unknown>;
          occurred_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ri_session_events"]["Row"]> & {
          session_id: string;
          kind: string;
        };
        Update: Partial<Database["public"]["Tables"]["ri_session_events"]["Row"]>;
        Relationships: [];
      };
      ap_settings: {
        Row: {
          id: boolean;
          is_open: boolean;
          intro_copy: string;
          confirmation_copy: string;
          enabled_partnership_types: ApPartnershipType[];
          google_appointments_url: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["ap_settings"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["ap_settings"]["Row"]>;
        Relationships: [];
      };
      ap_email_templates: {
        Row: {
          id: string;
          key: string;
          label: string;
          subject: string;
          body: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["ap_email_templates"]["Row"]> & {
          key: string;
          label: string;
          subject: string;
          body: string;
        };
        Update: Partial<Database["public"]["Tables"]["ap_email_templates"]["Row"]>;
        Relationships: [];
      };
      // Insert grant does not exist for authenticated — rows are created only
      // by ap_submit_inquiry(). The Row/Update shapes below are what staff
      // Server Actions read and write.
      ap_submissions: {
        Row: {
          id: string;
          faculty_name: string;
          email: string;
          department: string;
          phone: string | null;
          partnership_types: ApPartnershipType[];
          course_title: string | null;
          course_number: string | null;
          timeframe: string | null;
          estimated_students_reached: number | null;
          description: string;
          student_experience: string | null;
          support_requested: string | null;
          deliverables: string | null;
          relevant_dates: string | null;
          may_publish: boolean;
          additional_context: string | null;
          research_topic: string | null;
          research_relevance: string | null;
          research_status: string | null;
          research_availability: string | null;
          stage: ApStage;
          stage_changed_at: string;
          stage_changed_by: string | null;
          disposition: ApDisposition | null;
          disposition_reason: string | null;
          disposition_by: string | null;
          disposition_at: string | null;
          owner_id: string | null;
          fit: ApFit | null;
          capacity: ApCapacity | null;
          timing: ApTiming | null;
          primary_function: string | null;
          potential_staff_lead: string | null;
          key_considerations: string | null;
          next_action: string | null;
          next_action_date: string | null;
          submitted_ip_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        // Insert-only via ap_submit_inquiry(); no insert grant exists for
        // `authenticated`. Kept for completeness of the Row/Update shape.
        Insert: Partial<Database["public"]["Tables"]["ap_submissions"]["Row"]> & {
          faculty_name: string;
          email: string;
          department: string;
          partnership_types: ApPartnershipType[];
          description: string;
        };
        Update: Partial<Database["public"]["Tables"]["ap_submissions"]["Row"]>;
        Relationships: [];
      };
      ap_submission_events: {
        Row: {
          id: string;
          submission_id: string;
          actor_id: string | null;
          event_type: ApEventType;
          note: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ap_submission_events"]["Row"]> & {
          submission_id: string;
          event_type: ApEventType;
        };
        Update: Partial<Database["public"]["Tables"]["ap_submission_events"]["Row"]>;
        Relationships: [];
      };
      log_programs: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          kind: LogProgramKind;
          /** NPR Content Distribution Service collection id, if this is a mapped NPR network program — see supabase/migrations/20260807140000_log_npr_cds_correction.sql. */
          npr_collection_id: number | null;
          /** The hour (0-23, Eastern) at which NPR's live feed starts this program's first episode hour — the anchor for mapping shift hours onto the episode's alternating hours. See supabase/migrations/20260821140000_log_npr_feed_start_hour.sql. */
          npr_feed_start_hour_et: number | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["log_programs"]["Row"]> & {
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["log_programs"]["Row"]>;
        Relationships: [];
      };
      log_clock_templates: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["log_clock_templates"]["Row"]> & {
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["log_clock_templates"]["Row"]>;
        Relationships: [];
      };
      // Insert-only from the application — no update grant exists for
      // `authenticated`. See the migration's file header for why.
      log_clock_versions: {
        Row: {
          id: string;
          clock_template_id: string;
          variant: LogClockVersionVariant;
          effective_from: string;
          effective_to: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["log_clock_versions"]["Row"]> & {
          clock_template_id: string;
          variant: LogClockVersionVariant;
          effective_from: string;
        };
        Update: Partial<Database["public"]["Tables"]["log_clock_versions"]["Row"]>;
        Relationships: [];
      };
      // Insert-only, same reasoning as log_clock_versions. Domain redesign
      // (2026-08-08): fill_mode/assignment_mode/permitted_content_types/
      // replaceable/shortenable/allow_empty/allow_multiple/lock_on_air are
      // all gone — a clock slot now describes only the network's own
      // structure. See log_local_opportunities immediately below.
      log_clock_slots: {
        Row: {
          id: string;
          clock_version_id: string;
          position: number;
          start_offset_seconds: number | null;
          duration_seconds: number;
          timing_mode: LogSlotTimingMode;
          label: string | null;
          /** Set only when timing_mode = 'float' — a genuinely floating *network* element (e.g. Hidden Brain's own described break), not a WUWF local opportunity. */
          earliest_start_offset_seconds: number | null;
          latest_start_offset_seconds: number | null;
          /** The network clock's own segment letter (A, B, ...), purely descriptive. */
          segment_label: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["log_clock_slots"]["Row"]> & {
          clock_version_id: string;
          position: number;
          duration_seconds: number;
        };
        Update: Partial<Database["public"]["Tables"]["log_clock_slots"]["Row"]>;
        Relationships: [];
      };
      // WUWF's own local-substitution overlay on a clock version — see
      // supabase/migrations/20260808120000_log_local_opportunities.sql and
      // CLAUDE.md's "Log domain redesign" note. Editable in place
      // (deactivate via `active`, not deleted) — unlike the network clock
      // itself, this is WUWF policy, not NPR's immutable structure.
      log_local_opportunities: {
        Row: {
          id: string;
          clock_version_id: string;
          /** The network slot this opportunity marks as locally eligible — unique, one opportunity per slot. Offset/duration/timing/label are always the referenced slot's own. */
          slot_id: string;
          requirement: LogOpportunityRequirement;
          permitted_content_types: string[];
          notes: string | null;
          active: boolean;
          created_at: string;
          created_by: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["log_local_opportunities"]["Row"]> & {
          clock_version_id: string;
          slot_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["log_local_opportunities"]["Row"]>;
        Relationships: [];
      };
      log_opportunity_assignments: {
        Row: {
          id: string;
          local_opportunity_id: string;
          content_item_id: string;
          /** Which hour repetition of the opportunity this applies to (0-based); null means every hour. */
          hour_index: number | null;
          /** 0=Sunday..6=Saturday; empty means every day. */
          days_of_week: number[];
          notes: string | null;
          active: boolean;
          created_at: string;
          created_by: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["log_opportunity_assignments"]["Row"]> & {
          local_opportunity_id: string;
          content_item_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["log_opportunity_assignments"]["Row"]>;
        Relationships: [];
      };
      log_schedule: {
        Row: {
          id: string;
          program_id: string;
          clock_template_id: string;
          entry_type: LogScheduleEntryType;
          days_of_week: number[];
          start_date: string;
          end_date: string | null;
          effective_from: string;
          /** Station-local time of day this air block starts. */
          air_time: string;
          /** Total block length in minutes — may span multiple hours, each repeating the clock template. */
          duration_minutes: number;
          notes: string | null;
          created_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["log_schedule"]["Row"]> & {
          program_id: string;
          clock_template_id: string;
          start_date: string;
          air_time: string;
          duration_minutes: number;
        };
        Update: Partial<Database["public"]["Tables"]["log_schedule"]["Row"]>;
        Relationships: [];
      };
      log_content_items: {
        Row: {
          id: string;
          content_type: LogContentType;
          title: string;
          script: string | null;
          summary: string | null;
          expected_duration_seconds: number | null;
          effective_from: string;
          effective_to: string | null;
          owner_id: string | null;
          approval_status: LogApprovalStatus;
          community_issue_tags: string[];
          created_at: string;
          updated_at: string;
          created_by: string | null;
          // Added by 20260826120000_log_content_library_dad_import.sql.
          dad_cart_number: string | null;
          dad_group: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["log_content_items"]["Row"]> & {
          content_type: LogContentType;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["log_content_items"]["Row"]>;
        Relationships: [];
      };
      log_content_components: {
        Row: {
          id: string;
          content_item_id: string;
          component_type: LogComponentType;
          sequence: number;
          duration_seconds: number;
          required: boolean;
          script: string | null;
          // Added by 20260826120000_log_content_library_dad_import.sql.
          dad_cart_number: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["log_content_components"]["Row"]> & {
          content_item_id: string;
          component_type: LogComponentType;
          sequence: number;
          duration_seconds: number;
        };
        Update: Partial<Database["public"]["Tables"]["log_content_components"]["Row"]>;
        Relationships: [];
      };
      log_npr_episodes: {
        Row: {
          id: string;
          program_id: string;
          show_date: string;
          npr_collection_id: number;
          status: LogNprEpisodeStatus;
          npr_episode_id: string | null;
          title: string | null;
          raw: unknown;
          retrieved_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["log_npr_episodes"]["Row"]> & {
          program_id: string;
          show_date: string;
          npr_collection_id: number;
          status: LogNprEpisodeStatus;
        };
        Update: Partial<Database["public"]["Tables"]["log_npr_episodes"]["Row"]>;
        Relationships: [];
      };
      log_npr_episode_items: {
        Row: {
          id: string;
          episode_id: string;
          position: number;
          npr_item_id: string;
          title: string;
          teaser: string | null;
          duration_seconds: number | null;
          raw: unknown;
        };
        Insert: Partial<Database["public"]["Tables"]["log_npr_episode_items"]["Row"]> & {
          episode_id: string;
          position: number;
          npr_item_id: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["log_npr_episode_items"]["Row"]>;
        Relationships: [];
      };
      log_weather_reading: {
        Row: {
          id: string;
          forecast_area: string;
          source: string;
          live_read_text: string;
          condensed_text: string;
          high_temp: number | null;
          low_temp: number | null;
          // Added by 20260824130000_log_weather_current_observation.sql —
          // the latest station observation, best-effort at fetch time.
          current_temp: number | null;
          current_conditions: string | null;
          conditions_summary: string;
          precipitation_notes: string | null;
          hazards: string | null;
          last_updated_at: string;
          valid_through_at: string;
          is_current: boolean;
          // Added by 20260826130000_log_weather_daily_outlook.sql — the
          // condensed multi-day "at a glance" outlook (see
          // lib/log/weather-outlook.ts's DailyOutlookEntry[]), a plain jsonb
          // column like log_npr_episodes.raw above.
          daily_outlook: unknown;
          // Added by 20260826140000_log_weather_forecast_periods.sql — the
          // live-read text's own day/night halves, kept separate (see
          // lib/log/weather-outlook.ts's ForecastPeriodSummary[]) so the UI
          // can style Today and Tonight apart; same unknown convention.
          forecast_periods: unknown;
        };
        Insert: Partial<Database["public"]["Tables"]["log_weather_reading"]["Row"]> & {
          forecast_area: string;
          source: string;
          live_read_text: string;
          condensed_text: string;
          conditions_summary: string;
          valid_through_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["log_weather_reading"]["Row"]>;
        Relationships: [];
      };
      log_rundowns: {
        Row: {
          id: string;
          program_id: string;
          schedule_entry_id: string | null;
          clock_version_id: string;
          air_date: string;
          shift_start_at: string;
          shift_end_at: string;
          status: LogRundownStatus;
          generated_at: string | null;
          submitted_at: string | null;
          submitted_by: string | null;
          // Added by 20260821180000_log_program_log_import.sql — 'generated'
          // (from the clock's local opportunities) or 'imported' (from a DAD
          // program-log export upload; breaks carry no local_opportunity_id).
          source: "generated" | "imported";
        };
        Insert: Partial<Database["public"]["Tables"]["log_rundowns"]["Row"]> & {
          program_id: string;
          clock_version_id: string;
          air_date: string;
          shift_start_at: string;
          shift_end_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["log_rundowns"]["Row"]>;
        Relationships: [];
      };
      // Domain redesign (2026-08-08) — see supabase/migrations/
      // 20260808130000_log_rundown_breaks.sql. One row per occurrence of a
      // local opportunity within a rundown; zero or more log_rundown_items
      // occupy it. requirement/label/permitted_content_types/allow_multiple
      // are snapshots of the opportunity at generation time.
      log_rundown_breaks: {
        Row: {
          id: string;
          rundown_id: string;
          /**
           * The clock slot this break is one occurrence of; with hour_index,
           * its identity (unique per rundown). See
           * docs/log-slot-keyed-breaks-design.md.
           */
          clock_slot_id: string;
          /** Which repetition of the clock within the shift (0 = first hour). */
          hour_index: number;
          /** Floating slots only: where it landed, seconds from the top of its hour. */
          landing_offset_seconds: number | null;
          /** The slot's local opportunity, or null for a slot nobody marked (an import placed something there). */
          local_opportunity_id: string | null;
          /** Derived by log_derive_rundown_break_times() from the slot, like the time columns below. */
          position: number;
          label: string;
          requirement: LogOpportunityRequirement;
          permitted_content_types: string[];
          /** scheduled_at, available_duration_seconds and network_rejoin_at are derived from the slot on every write — never trusted from a caller. */
          scheduled_at: string;
          available_duration_seconds: number;
          network_rejoin_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["log_rundown_breaks"]["Row"]> & {
          rundown_id: string;
          clock_slot_id: string;
          hour_index: number;
          requirement: LogOpportunityRequirement;
        };
        Update: Partial<Database["public"]["Tables"]["log_rundown_breaks"]["Row"]>;
        Relationships: [];
      };
      // Redesigned (2026-08-08): a discrete placement inside a
      // log_rundown_breaks window, not a one-row-per-clock-slot fill target.
      // item_kind is plain text + a check constraint, not a Postgres enum
      // (see LogRundownItemKind above for why). override_* columns are
      // per-airing overrides — never written back to log_content_items/
      // log_content_components. planned_duration_seconds is always the
      // *effective* total for this airing (master or overridden).
      log_rundown_items: {
        Row: {
          id: string;
          break_id: string;
          position: number;
          item_kind: LogRundownItemKind;
          content_item_id: string | null;
          live_read_title: string | null;
          live_read_script: string | null;
          override_script: string | null;
          override_duration_seconds: number | null;
          override_live_intro_seconds: number | null;
          override_live_outro_seconds: number | null;
          override_tag_seconds: number | null;
          override_notes: string | null;
          planned_duration_seconds: number;
          placement_status: LogPlacementStatus;
          /** Set only when item_kind = 'underwriting_credit'. References uw_copy — only ever set by log_place_underwriting_credit(). */
          underwriting_copy_id: string | null;
          /** CDS's own stable item id for the NPR story this live-read was built as a look-ahead for, if any — not a foreign key, see the migration. */
          source_npr_item_id: string | null;
          /** The NPR story's title captured at creation time — never re-read from log_npr_episode_items. */
          source_npr_item_title: string | null;
          /** The DAD log's spot number, minted on the item's first release (20261002140000). */
          dad_spot_number: number | null;
        };
        Insert: Partial<Database["public"]["Tables"]["log_rundown_items"]["Row"]> & {
          break_id: string;
          position: number;
          planned_duration_seconds: number;
        };
        Update: Partial<Database["public"]["Tables"]["log_rundown_items"]["Row"]>;
        Relationships: [];
      };
      /** Each release of a day's DAD log (20261002140000). Append-only. */
      log_dad_exports: {
        Row: {
          id: string;
          air_date: string;
          version: number;
          file_name: string;
          file_path: string;
          sha256: string;
          event_count: number;
          warnings: unknown;
          released_by: string;
          released_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["log_dad_exports"]["Row"]> & {
          air_date: string;
          version: number;
          file_name: string;
          file_path: string;
          sha256: string;
          event_count: number;
          released_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["log_dad_exports"]["Row"]>;
        Relationships: [];
      };
      /** Weekly automated hours (20261002130000) — lib/log/automated-hours.ts. */
      log_automated_weekly: {
        Row: {
          id: string;
          days_of_week: number[];
          start_time: string;
          end_time: string;
          effective_from: string;
          effective_to: string | null;
          reason: string | null;
          active: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["log_automated_weekly"]["Row"]> & {
          days_of_week: number[];
          start_time: string;
          end_time: string;
        };
        Update: Partial<Database["public"]["Tables"]["log_automated_weekly"]["Row"]>;
        Relationships: [];
      };
      /** One-time automated or live changes (20261002130000); active rows never overlap. */
      log_on_air_changes: {
        Row: {
          id: string;
          starts_at: string;
          ends_at: string;
          mode: LogOnAirMode;
          reason: string | null;
          active: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["log_on_air_changes"]["Row"]> & {
          starts_at: string;
          ends_at: string;
          mode: LogOnAirMode;
        };
        Update: Partial<Database["public"]["Tables"]["log_on_air_changes"]["Row"]>;
        Relationships: [];
      };
      /** Weekly hours closed to underwriting auto-fill (20261005130000) — lib/log/underwriting-hours.ts. */
      log_underwriting_closed_weekly: {
        Row: {
          id: string;
          days_of_week: number[];
          start_time: string;
          end_time: string;
          effective_from: string;
          effective_to: string | null;
          reason: string | null;
          active: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["log_underwriting_closed_weekly"]["Row"]> & {
          days_of_week: number[];
          start_time: string;
          end_time: string;
        };
        Update: Partial<Database["public"]["Tables"]["log_underwriting_closed_weekly"]["Row"]>;
        Relationships: [];
      };
      /** One-time closed or open changes to the underwriting hours (20261005130000); active rows never overlap. */
      log_underwriting_hour_changes: {
        Row: {
          id: string;
          starts_at: string;
          ends_at: string;
          mode: LogUnderwritingHoursMode;
          reason: string | null;
          active: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["log_underwriting_hour_changes"]["Row"]> & {
          starts_at: string;
          ends_at: string;
          mode: LogUnderwritingHoursMode;
        };
        Update: Partial<Database["public"]["Tables"]["log_underwriting_hour_changes"]["Row"]>;
        Relationships: [];
      };
      // Append-only from the application — no update grant. See the
      // migration's file header.
      log_broadcast_events: {
        Row: {
          id: string;
          rundown_item_id: string;
          outcome: LogBroadcastOutcome;
          actual_started_at: string | null;
          actual_duration_seconds: number | null;
          confirmation_source: LogConfirmationSource;
          reason: LogMissReason | null;
          notes: string | null;
          recorded_by: string | null;
          recorded_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["log_broadcast_events"]["Row"]> & {
          rundown_item_id: string;
          outcome: LogBroadcastOutcome;
        };
        Update: Partial<Database["public"]["Tables"]["log_broadcast_events"]["Row"]>;
        Relationships: [];
      };
      // New (2026-08-08) — a durable underwriter/sponsor entity, replacing
      // free-text underwriter_name on the contract. See supabase/migrations/
      // 20260808200000_underwriting_redesign.sql.
      /**
       * Legacy-agreement migration (20260929200000, docs/underwriting-
       * traffic-redesign.md §14): one manifest entry — its authoritative
       * facts, its run status, and the draft contract it produced.
       */
      uw_agreement_migration_items: {
        Row: {
          id: string;
          source_key: string;
          batch_label: string;
          manifest_row: number | null;
          /** Null only for a documents-only entry (source_key "sha256:…", 20260929210000). */
          underwriter_name: string | null;
          contract_identifier: string | null;
          effective_from: string | null;
          effective_to: string | null;
          sponsorship_total: number | null;
          contract_type: string | null;
          source_file: string;
          drive_file_id: string | null;
          documentation_status: string | null;
          notes: string | null;
          status: UwAgreementMigrationStatus;
          attempts: number;
          started_at: string | null;
          finished_at: string | null;
          contract_id: string | null;
          document_sha256: string | null;
          last_error: string | null;
          /** lib/underwriting/agreement-migration.ts's MigrationItemResult. */
          result: unknown;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_agreement_migration_items"]["Row"]> & {
          source_key: string;
          batch_label: string;
          source_file: string;
        };
        Update: Partial<Database["public"]["Tables"]["uw_agreement_migration_items"]["Row"]>;
        Relationships: [];
      };
      uw_underwriters: {
        Row: {
          id: string;
          name: string;
          mailing_address: string | null;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          /** The industry (uw_industry_categories) the competitive-adjacency rule compares — 20260925160000, replacing free text. */
          category_id: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_underwriters"]["Row"]> & {
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["uw_underwriters"]["Row"]>;
        Relationships: [];
      };
      /** Typed industry categories for underwriters (20260925160000_underwriting_industry_categories.sql). Deactivate, never delete. */
      uw_industry_categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_industry_categories"]["Row"]> & {
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["uw_industry_categories"]["Row"]>;
        Relationships: [];
      };
      // Redesigned (2026-08-08): underwriter_name -> underwriter_id;
      // agreement_document_url -> agreement_document_path (a real Storage
      // attachment); added affidavit_required, sponsorship_category,
      // sponsorship_total, preemption_policy. Fulfillment is never a column
      // here — see lib/underwriting/fulfillment.ts.
      uw_contracts: {
        Row: {
          id: string;
          underwriter_id: string;
          contract_identifier: string | null;
          agreement_document_path: string | null;
          /** The model's reading of the agreement this contract was created from (lib/underwriting/agreement-import.ts's AgreementReading), or null for a hand-entered contract. */
          agreement_reading: unknown;
          effective_from: string;
          effective_to: string | null;
          status: UwContractStatus;
          affidavit_required: boolean;
          sponsorship_category: string | null;
          sponsorship_total: number | null;
          preemption_policy: string | null;
          notes: string | null;
          /** The order's own total spot count, when printed — validated against the lines' expansion on screen, never the target. */
          stated_total_spots: number | null;
          /** FPM orders: every new exception starts pending agency approval, and no makegood is scheduled until staff record it. */
          makegood_requires_agency_approval: boolean;
          /** The order's separation instruction verbatim (FPM prints "3", no unit). Never interpreted. */
          separation_source_text: string | null;
          separation_policy: UwSeparationPolicy;
          separation_minutes: number | null;
          /** The station's salesperson on the order, printed on the affidavit (20260928120000). */
          account_rep: string | null;
          /** The legacy-agreement migration entry this draft was imported from — unique, null otherwise (20260929200000). */
          import_source_key: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_contracts"]["Row"]> & {
          underwriter_id: string;
          contract_identifier?: string | null;
          effective_from: string;
        };
        Update: Partial<Database["public"]["Tables"]["uw_contracts"]["Row"]>;
        Relationships: [];
      };
      /**
       * Contract revisions (20260925150000): every schedule line belongs to
       * one; exactly one per contract is current. Activating a draft
       * supersedes the current revision's open buckets from its effective
       * date — history is never rewritten.
       */
      uw_contract_revisions: {
        Row: {
          id: string;
          contract_id: string;
          revision_label: string | null;
          document_path: string | null;
          received_at: string | null;
          effective_from: string;
          status: UwRevisionStatus;
          supersedes_revision_id: string | null;
          notes: string | null;
          activated_at: string | null;
          activated_by: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_contract_revisions"]["Row"]> & {
          contract_id: string;
          effective_from: string;
        };
        Update: Partial<Database["public"]["Tables"]["uw_contract_revisions"]["Row"]>;
        Relationships: [];
      };
      // New (2026-08-08), replaces uw_placement_obligations. Rewritten
      // twice on 2026-09-25: first around four typed rule kinds, then
      // (20260925150000_underwriting_demand_buckets.sql) into eligibility
      // only — where a credit may air and how many a day at most. The
      // quantities live in uw_demand_buckets; entry_kind/entry_spec only
      // record how the staffer entered it (lib/underwriting/demand-compiler.ts).
      uw_contract_schedule_lines: {
        Row: {
          id: string;
          contract_id: string;
          revision_id: string;
          label: string;
          entry_kind: UwScheduleEntryKind;
          /** The compiler input as entered — see demand-compiler.ts's EntrySpec. */
          entry_spec: unknown;
          flight_id: string | null;
          /** Inventory pool (uw_inventory_pools) and/or a program — at least one is set. */
          pool_id: string | null;
          program_id: string | null;
          /** Station-local window (end exclusive), a hard limit when time_mode = window. */
          window_start: string | null;
          window_end: string | null;
          /** Eligible weekdays, 0=Sunday..6=Saturday; empty means any day of the bucket. */
          days_of_week: number[];
          time_mode: UwTimeMode;
          /** preferred: ranks candidates. exact: must start within EXACT_TIME_TOLERANCE_MINUTES. opening / closing: the rundown's first / last underwriting-permitted marked break (20260925180000). */
          preferred_time: string | null;
          duration_seconds: number;
          /** A per-day cap the order states; null means no cap. */
          max_per_day: number | null;
          service_level: UwServiceLevel;
          distribution_preference: string | null;
          makegood_policy_text: string | null;
          start_date: string;
          end_date: string | null;
          /** The order's own count for this line, compared against the buckets' total on screen. */
          stated_total: number | null;
          /** The order's wording, verbatim — nuance, never an executable rule. */
          source_text: string | null;
          status: UwScheduleLineStatus;
          /** Demand on or after this date is void once cancelled. */
          cancelled_from: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_contract_schedule_lines"]["Row"]> & {
          contract_id: string;
          revision_id: string;
          entry_kind: UwScheduleEntryKind;
          duration_seconds: number;
          start_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["uw_contract_schedule_lines"]["Row"]>;
        Relationships: [];
      };
      /** How many credits a line owes inside one period (a day, a Monday week, a month, or the whole range). A dark week is a real row with quantity 0. */
      uw_demand_buckets: {
        Row: {
          id: string;
          schedule_line_id: string;
          period_start: string;
          period_end: string;
          quantity_required: number;
          status: UwDemandBucketStatus;
          source_label: string | null;
          superseded_by_revision_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_demand_buckets"]["Row"]> & {
          schedule_line_id: string;
          period_start: string;
          period_end: string;
          quantity_required: number;
        };
        Update: Partial<Database["public"]["Tables"]["uw_demand_buckets"]["Row"]>;
        Relationships: [];
      };
      uw_inventory_pools: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_inventory_pools"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["uw_inventory_pools"]["Row"]>;
        Relationships: [];
      };
      uw_inventory_pool_targets: {
        Row: {
          id: string;
          pool_id: string;
          program_id: string | null;
          window_start: string | null;
          window_end: string | null;
          days_of_week: number[] | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_inventory_pool_targets"]["Row"]> & { pool_id: string };
        Update: Partial<Database["public"]["Tables"]["uw_inventory_pool_targets"]["Row"]>;
        Relationships: [];
      };
      /** An event or production under a contract, grouping lines and scoping copy. */
      uw_contract_flights: {
        Row: {
          id: string;
          contract_id: string;
          name: string;
          start_date: string;
          end_date: string;
          status: UwFlightStatus;
          cancelled_at: string | null;
          cancelled_by: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_contract_flights"]["Row"]> & {
          contract_id: string;
          name: string;
          start_date: string;
          end_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["uw_contract_flights"]["Row"]>;
        Relationships: [];
      };
      // Redesigned (2026-08-08): removed production_status and
      // audio_object_path (ENCO/DAD is the playback system of record —
      // cart_identifier is the reference); added execution_kind and label.
      uw_copy: {
        Row: {
          id: string;
          label: string;
          // Added by 20260821180000_log_program_log_import.sql — direct
          // underwriter attribution independent of any contract, set by the
          // program-log import; null on rows attributed via uw_contract_copy.
          underwriter_id: string | null;
          script: string | null;
          execution_kind: UwCopyExecutionKind;
          duration_seconds: number | null;
          cart_identifier: string | null;
          /**
           * Added by 20261002120000_underwriting_copy_dad_cut.sql — the DAD cut this message
           * plays from. NNNNNA: assigned by the Portal (a trigger fills it on insert, and again
           * when an update clears it). NNNNN: an existing DAD spot picked from the library.
           * Null: copy that plays an existing spot nobody has picked yet.
           */
          dad_cut: string | null;
          /** 20261002160000: production marked the Portal cut recorded in DAD. Cleared when the cut, or a Portal cut's script, changes. */
          dad_recorded_at: string | null;
          dad_recorded_by: string | null;
          effective_from: string;
          effective_to: string | null;
          approval_status: UwCopyApprovalStatus;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_copy"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["uw_copy"]["Row"]>;
        Relationships: [];
      };
      uw_contract_copy: {
        Row: {
          contract_id: string;
          copy_id: string;
          /** Null: serves the whole contract. Set: only lines in this flight may place it. */
          flight_id: string | null;
          /**
           * Null: serves every line that has no dedicated copy. Set: the order gives this
           * message to one line, and that line takes only its dedicated copy
           * (20260930150000, uw_copy_serves_line()).
           */
          schedule_line_id: string | null;
        };
        Insert: {
          contract_id: string;
          copy_id: string;
          flight_id?: string | null;
          schedule_line_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["uw_contract_copy"]["Row"]>;
        Relationships: [];
      };
      // Redesigned (2026-08-08): obligation_id -> schedule_line_id;
      // clock_slot_label -> break_label (log_rundown_items no longer has a
      // single clock slot — see log_rundown_breaks).
      uw_scheduled_placements: {
        Row: {
          id: string;
          schedule_line_id: string;
          copy_id: string;
          // Nullable as of 20260809130000_underwriting_credit_relocation.sql
          // (on delete set null, was cascade) — a superseded row survives its
          // item's deletion instead of vanishing with it. See that
          // migration's header.
          log_rundown_item_id: string | null;
          placement_date: string;
          scheduled_at: string;
          program_id: string;
          program_name: string;
          break_label: string | null;
          status: UwPlacementStatus;
          override_reason: string | null;
          /** The demand bucket this placement consumes. A makegood placement carries the missed placement's bucket. */
          demand_bucket_id: string;
          makegood_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_scheduled_placements"]["Row"]> & {
          schedule_line_id: string;
          copy_id: string;
          log_rundown_item_id: string;
          placement_date: string;
          scheduled_at: string;
          program_id: string;
          program_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["uw_scheduled_placements"]["Row"]>;
        Relationships: [];
      };
      // Redesigned (2026-08-08): obligation_id -> schedule_line_id.
      uw_exceptions: {
        Row: {
          id: string;
          log_broadcast_event_id: string;
          schedule_line_id: string;
          original_scheduled_at: string;
          host_action: string;
          host_reason: string | null;
          requirement_note: string | null;
          compliance_judgment: UwComplianceJudgment;
          recommended_action: string | null;
          resolution_status: UwResolutionStatus;
          resolution_action: UwResolutionAction | null;
          resolution_notes: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          scheduled_placement_id: string | null;
          makegood_approval: UwMakegoodApproval;
          makegood_approval_note: string | null;
          makegood_approval_at: string | null;
          makegood_approval_by: string | null;
          created_at: string;
        };
        /** Insert-only from the trigger (uw_flag_exception_from_broadcast_event) — no insert grant to authenticated. Listed for completeness, not expected to be used from application code. */
        Insert: Partial<Database["public"]["Tables"]["uw_exceptions"]["Row"]> & {
          log_broadcast_event_id: string;
          schedule_line_id: string;
          original_scheduled_at: string;
          host_action: string;
        };
        Update: Partial<Database["public"]["Tables"]["uw_exceptions"]["Row"]>;
        Relationships: [];
      };
      // Redesigned (2026-08-08): obligation_id -> schedule_line_id.
      uw_makegoods: {
        Row: {
          id: string;
          exception_id: string;
          schedule_line_id: string;
          scheduled_placement_id: string | null;
          status: UwMakegoodStatus;
          scheduled_for: string | null;
          aired_log_broadcast_event_id: string | null;
          /** Copied from the missed placement so the replacement airing is attributed to the bucket the order missed. */
          demand_bucket_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_makegoods"]["Row"]> & {
          exception_id: string;
          schedule_line_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["uw_makegoods"]["Row"]>;
        Relationships: [];
      };
      uw_affidavits: {
        Row: {
          id: string;
          contract_id: string;
          campaign_period_start: string;
          campaign_period_end: string;
          generated_at: string;
          generated_by: string | null;
          certifying_staff_id: string | null;
          certification_text: string | null;
          report_identifier: string;
          status: UwAffidavitStatus;
          /** 20260928120000 — set on certification; the signature line prints it. */
          certified_at: string | null;
          certifying_staff_title: string | null;
          /** The PDF as certified, in the underwriting-documents bucket, and its hex SHA-256. */
          certified_document_path: string | null;
          certified_document_sha256: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["uw_affidavits"]["Row"]> & {
          contract_id: string;
          campaign_period_start: string;
          campaign_period_end: string;
          report_identifier: string;
        };
        Update: Partial<Database["public"]["Tables"]["uw_affidavits"]["Row"]>;
        Relationships: [];
      };
      uw_affidavit_line_items: {
        Row: {
          affidavit_id: string;
          log_broadcast_event_id: string;
          scheduled_placement_id: string;
        };
        Insert: {
          affidavit_id: string;
          log_broadcast_event_id: string;
          scheduled_placement_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["uw_affidavit_line_items"]["Row"]>;
        Relationships: [];
      };
      // Editorial Inquiry (20260820120000_editorial_inquiry.sql) — see
      // docs/editorial-inquiry-design.md. No elevated role; every ei_* table
      // is gated by private.has_editorial_inquiry_access alone.
      ei_inquiries: {
        Row: {
          id: string;
          pillar_id: string | null;
          pillar_name_snapshot: string;
          guiding_question_text: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        // No insert grant to `authenticated` — the only way a row is created
        // is ei_create_inquiry() below, which also seeds the root question.
        Insert: Partial<Database["public"]["Tables"]["ei_inquiries"]["Row"]> & {
          pillar_name_snapshot: string;
          guiding_question_text: string;
        };
        Update: Partial<Database["public"]["Tables"]["ei_inquiries"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "ei_inquiries_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ei_inquiries_pillar_id_fkey";
            columns: ["pillar_id"];
            isOneToOne: false;
            referencedRelation: "ep_pillars";
            referencedColumns: ["id"];
          },
        ];
      };
      ei_questions: {
        Row: {
          id: string;
          inquiry_id: string;
          parent_id: string | null;
          depth: number;
          text: string;
          status: string;
          diagnosis_kind: string | null;
          diagnosis_note: string | null;
          reframed_from_text: string | null;
          manual_dx: number | null;
          manual_dy: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ei_questions"]["Row"]> & {
          inquiry_id: string;
          depth: number;
          text: string;
        };
        Update: Partial<Database["public"]["Tables"]["ei_questions"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "ei_questions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ei_questions_inquiry_id_fkey";
            columns: ["inquiry_id"];
            isOneToOne: false;
            referencedRelation: "ei_inquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ei_questions_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "ei_questions";
            referencedColumns: ["id"];
          },
        ];
      };
      ei_context_notes: {
        Row: {
          id: string;
          question_id: string;
          kind: string;
          body: string;
          evidentiary_status: string;
          source_title: string | null;
          source_url: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ei_context_notes"]["Row"]> & {
          question_id: string;
          body: string;
        };
        // No update grant — insert + select only, see the migration.
        Update: Partial<Database["public"]["Tables"]["ei_context_notes"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "ei_context_notes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ei_context_notes_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "ei_questions";
            referencedColumns: ["id"];
          },
        ];
      };
      ei_chat_messages: {
        Row: {
          id: string;
          question_id: string;
          role: string;
          body: string;
          action_kind: string | null;
          action_payload: Record<string, unknown> | null;
          citations: Record<string, unknown>[] | null;
          applied_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ei_chat_messages"]["Row"]> & {
          question_id: string;
          role: string;
          body: string;
        };
        Update: Partial<Database["public"]["Tables"]["ei_chat_messages"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "ei_chat_messages_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ei_chat_messages_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "ei_questions";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Bookings rate model versions (20261005140000) — one in use at a time. */
      // Bookings (docs/bookings-design.md §5), as rewritten by slice 2b
      // (20261005160000_bookings_labor_and_pools.sql): labor classes and pools
      // are catalogs, versioned figures hang off them, capacity is per class.
      /** A class of production labor; unversioned, figures per version in bk_labor_rates. */
      bk_labor_classes: {
        Row: {
          id: string;
          key: string;
          name: string;
          pay_basis: BkPayBasis;
          /** Whether this class's hours are charged in a strategic (baseline-funded) price. */
          charged_in_strategic: boolean;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_labor_classes"]["Row"]> & {
          key: string;
          name: string;
          pay_basis: BkPayBasis;
        };
        Update: Partial<Database["public"]["Tables"]["bk_labor_classes"]["Row"]>;
        Relationships: [];
      };
      /** A production resource pool; unversioned, figures per version in bk_resource_pools. */
      bk_pools: {
        Row: {
          id: string;
          key: string;
          name: string;
          unit_label: string;
          costing: BkPoolCosting;
          /** [{ key, label, start: "HH:MM", end: "HH:MM" }] — lib/bookings/scheduling.ts's parseWindows. */
          default_windows: unknown;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_pools"]["Row"]> & {
          key: string;
          name: string;
          unit_label: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_pools"]["Row"]>;
        Relationships: [];
      };
      bk_rate_model_versions: {
        Row: {
          id: string;
          label: string;
          status: BkVersionStatus;
          in_use: boolean;
          notes: string | null;
          destination_index: string | null;
          created_at: string;
          created_by: string | null;
          submitted_at: string | null;
          submitted_by: string | null;
          adopted_at: string | null;
          adopted_by: string | null;
          superseded_at: string | null;
          /** §20.2: a recorded decision on whether and how overhead is recovered. */
          overhead_decision: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_rate_model_versions"]["Row"]> & {
          label: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_rate_model_versions"]["Row"]>;
        Relationships: [];
      };
      bk_assumptions: {
        Row: {
          id: string;
          version_id: string;
          section: BkAssumptionSection;
          kind: BkAssumptionKind;
          /** pool_line: null is a line in the shared production pool; set is that pool's own line. */
          pool_id: string | null;
          /** model_input: external_margin_share | assessment_share. */
          key: string | null;
          label: string;
          value: number;
          unit: string;
          basis: string | null;
          source_url: string | null;
          notes: string | null;
          owner: BkAssumptionOwner;
          validation_state: BkValidationState;
          validation_needed: string | null;
          validation_note: string | null;
          validated_at: string | null;
          validated_by: string | null;
          sort_order: number;
          created_at: string;
          /** §20.2: general overhead, kept out of every pool's per-unit allocation. */
          overhead: boolean;
          /** §20.4: the pool whose replacement this budget line already funds. */
          funds_pool_id: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_assumptions"]["Row"]> & {
          version_id: string;
          section: BkAssumptionSection;
          kind: BkAssumptionKind;
          label: string;
          value: number;
          unit: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_assumptions"]["Row"]>;
        Relationships: [];
      };
      /** A labor class's pay figures on one version. */
      bk_labor_rates: {
        Row: {
          id: string;
          version_id: string;
          labor_class_id: string;
          annual_salary: number | null;
          hourly_wage: number | null;
          load_share: number;
          paid_hours: number | null;
          external_rate: number;
          basis: string | null;
          validation_state: BkValidationState;
          validation_needed: string | null;
          validation_note: string | null;
          validated_at: string | null;
          validated_by: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_labor_rates"]["Row"]> & {
          version_id: string;
          labor_class_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_labor_rates"]["Row"]>;
        Relationships: [];
      };
      bk_resource_pools: {
        Row: {
          id: string;
          version_id: string;
          pool_id: string;
          /** Allocated pools only. */
          allocation_share: number | null;
          available_units: number;
          basis: string | null;
          validation_state: BkValidationState;
          validation_needed: string | null;
          validation_note: string | null;
          validated_at: string | null;
          validated_by: string | null;
          /** §20.1: practical_capacity, or volume_forecast for a pool whose units are a demand forecast to be replaced. */
          units_basis: "practical_capacity" | "volume_forecast";
          /** §20.3: snapshots from the asset register (exact). */
          capital_annual: number;
          maintenance_annual: number;
          asset_basis: {
            assetId: string;
            name: string;
            capital: number;
            maintenance: number;
            coveredBy: string | null;
          }[];
          asset_refreshed_at: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_resource_pools"]["Row"]> & {
          version_id: string;
          pool_id: string;
          available_units: number;
        };
        Update: Partial<Database["public"]["Tables"]["bk_resource_pools"]["Row"]>;
        Relationships: [];
      };
      bk_service_packages: {
        Row: {
          id: string;
          version_id: string;
          name: string;
          unit_label: string;
          market_floor: number;
          historical_reference: string | null;
          application_note: string | null;
          notes: string | null;
          active: boolean;
          sort_order: number;
          created_at: string;
          market_ceiling: number | null;
          hours_validation_state: BkValidationState;
          hours_validation_note: string | null;
          floor_validation_state: BkValidationState;
          floor_validation_note: string | null;
          updated_at: string;
          /** A bespoke package scoped to one agreement (slice 5); null is the ordinary card. */
          agreement_id: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_service_packages"]["Row"]> & {
          version_id: string;
          name: string;
          unit_label: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_service_packages"]["Row"]>;
        Relationships: [];
      };
      bk_package_labor: {
        Row: { package_id: string; labor_class_id: string; hours: number };
        Insert: Database["public"]["Tables"]["bk_package_labor"]["Row"];
        Update: Partial<Database["public"]["Tables"]["bk_package_labor"]["Row"]>;
        Relationships: [];
      };
      bk_package_resources: {
        Row: { package_id: string; pool_id: string; units: number };
        Insert: Database["public"]["Tables"]["bk_package_resources"]["Row"];
        Update: Partial<Database["public"]["Tables"]["bk_package_resources"]["Row"]>;
        Relationships: [];
      };
      /** The card as computed when a version was put in use or adopted; written by TypeScript. */
      bk_rate_card_lines: {
        Row: {
          id: string;
          version_id: string;
          kind: BkRateCardLineKind;
          package_id: string | null;
          labor_class_id: string | null;
          line_key: string;
          name: string;
          unit_label: string;
          strategic_rate: number | null;
          incremental_rate: number | null;
          external_rate: number;
          strategic_cost: number | null;
          incremental_cost: number | null;
          external_grossed_cost: number | null;
          market_floor: number | null;
          market_ceiling: number | null;
          historical_reference: string | null;
          application_note: string | null;
          sort_order: number;
          /** Exact (unrounded) costs the economics read (§19.1). */
          labor_cost: number | null;
          resource_cost: number | null;
          exact_cost: number | null;
          snapshotted_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_rate_card_lines"]["Row"]> & {
          version_id: string;
          kind: BkRateCardLineKind;
          line_key: string;
          name: string;
          unit_label: string;
          external_rate: number;
        };
        Update: Partial<Database["public"]["Tables"]["bk_rate_card_lines"]["Row"]>;
        Relationships: [];
      };
      /** The asset inventory: unversioned, out of service rather than deleted. */
      bk_assets: {
        Row: {
          id: string;
          name: string;
          tag: string | null;
          pool_id: string;
          acquired_on: string | null;
          acquisition_cost: number | null;
          annual_cost: number | null;
          funding: BkAssetFunding;
          useful_life_years: number | null;
          restrictions: string | null;
          maintenance_burden: BkAssetBurden;
          condition: BkAssetCondition;
          notes: string | null;
          active: boolean;
          created_at: string;
          created_by: string | null;
          replacement_cost: number | null;
          annual_maintenance: number | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_assets"]["Row"]> & {
          name: string;
          pool_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_assets"]["Row"]>;
        Relationships: [];
      };
      /** Append-only change log for the Rates tab. */
      bk_rate_model_events: {
        Row: {
          id: string;
          version_id: string | null;
          actor_id: string | null;
          kind: string;
          note: string;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_rate_model_events"]["Row"]> & {
          kind: string;
          note: string;
        };
        Update: never;
        Relationships: [];
      };
      /** One term's envelopes; capacity per class is in bk_term_capacity. One plan is active at a time. */
      bk_term_plans: {
        Row: {
          id: string;
          label: string;
          starts_on: string;
          ends_on: string;
          /** The station's contribution as a share of each tracked class's net hours (0..1). */
          reserve_share: number;
          /** University-eligible avail minutes a week the station contributes. */
          airtime_contributed_minutes_per_week: number;
          status: BkTermPlanStatus;
          notes: string | null;
          created_at: string;
          created_by: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_term_plans"]["Row"]> & {
          label: string;
          starts_on: string;
          ends_on: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_term_plans"]["Row"]>;
        Relationships: [];
      };
      /** A labor class's capacity in one term; a class with no row is not capacity-checked. */
      bk_term_capacity: {
        Row: {
          id: string;
          plan_id: string;
          labor_class_id: string;
          net_hours: number;
          headcount: number;
          hours_per_person_day: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_term_capacity"]["Row"]> & {
          plan_id: string;
          labor_class_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_term_capacity"]["Row"]>;
        Relationships: [];
      };
      /** A plan's schedulable pools: units for the term, concurrent units per window, windows. */
      bk_term_resources: {
        Row: {
          id: string;
          plan_id: string;
          pool_id: string;
          available_units: number;
          concurrent_units: number;
          windows: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_term_resources"]["Row"]> & {
          plan_id: string;
          pool_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_term_resources"]["Row"]>;
        Relationships: [];
      };
      /** A policy: no partner work on these dates and pools (null pool_ids = every pool). */
      bk_blackouts: {
        Row: {
          id: string;
          plan_id: string;
          starts_on: string;
          ends_on: string;
          pool_ids: string[] | null;
          reason: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_blackouts"]["Row"]> & {
          plan_id: string;
          starts_on: string;
          ends_on: string;
          reason: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_blackouts"]["Row"]>;
        Relationships: [];
      };
      /** WUWF's own use of one window; a null pool holds only labor. Hours per class in bk_hold_labor. */
      bk_holds: {
        Row: {
          id: string;
          plan_id: string;
          pool_id: string | null;
          date: string;
          window_start: string;
          window_end: string;
          kind: BkHoldKind;
          label: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_holds"]["Row"]> & {
          plan_id: string;
          date: string;
          window_start: string;
          window_end: string;
          label: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_holds"]["Row"]>;
        Relationships: [];
      };
      bk_hold_labor: {
        Row: { hold_id: string; labor_class_id: string; hours: number };
        Insert: Database["public"]["Tables"]["bk_hold_labor"]["Row"];
        Update: Partial<Database["public"]["Tables"]["bk_hold_labor"]["Row"]>;
        Relationships: [];
      };
      /** A partner's hold on one window of one pool; hours per class in bk_booking_labor; bk_booking_allowed() is the rule. */
      bk_bookings: {
        Row: {
          id: string;
          plan_id: string;
          /** The project this date belongs to (bk_projects, slice 3); null for a booking made from the calendar itself. */
          project_id: string | null;
          pool_id: string;
          date: string;
          window_start: string;
          window_end: string;
          units: number;
          treatment: BkPricingTreatment;
          status: BkBookingStatus;
          expires_at: string | null;
          released_at: string | null;
          label: string;
          notes: string | null;
          exception_by: string | null;
          exception_reason: string | null;
          created_at: string;
          created_by: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_bookings"]["Row"]> & {
          plan_id: string;
          pool_id: string;
          date: string;
          window_start: string;
          window_end: string;
          treatment: BkPricingTreatment;
          label: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_bookings"]["Row"]>;
        Relationships: [];
      };
      bk_booking_labor: {
        Row: { booking_id: string; labor_class_id: string; hours: number };
        Insert: Database["public"]["Tables"]["bk_booking_labor"]["Row"];
        Update: Partial<Database["public"]["Tables"]["bk_booking_labor"]["Row"]>;
        Relationships: [];
      };
      // Slice 3 (20261006120000_bookings_projects.sql): partners, projects and
      // what hangs off a project. docs/bookings-design.md §5 "Work".
      /** A UWF unit or an outside organization; agreements arrive in slice 5. */
      bk_partners: {
        Row: {
          id: string;
          name: string;
          kind: BkPartnerKind;
          contact_name: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          default_funding_index: string | null;
          notes: string | null;
          created_at: string;
          created_by: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_partners"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["bk_partners"]["Row"]>;
        Relationships: [];
      };
      /** One request through five stages; a disposition keeps the stage reached. bk_guard_project() guards settled and a reserve-touching pricing override. */
      bk_projects: {
        Row: {
          id: string;
          partner_id: string;
          title: string;
          description: string | null;
          requested: BkRequested;
          qualifies_strategic: boolean | null;
          qualification_by: string | null;
          /** Derived by lib/bookings/pricing.ts; stored so the estimate shows what it was priced as. */
          priced_as: BkPricingTreatment | null;
          pricing_reason: string | null;
          pricing_overridden_by: string | null;
          stage: BkProjectStage;
          disposition: BkProjectDisposition | null;
          disposition_reason: string | null;
          disposition_by: string | null;
          disposition_at: string | null;
          estimate_sent_at: string | null;
          estimate_expires_at: string | null;
          estimate_approved_at: string | null;
          rate_model_version_id: string | null;
          funding_index: string | null;
          event_starts_on: string | null;
          event_ends_on: string | null;
          deliverables_due_on: string | null;
          location: string | null;
          contact_name: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          source: BkProjectSource;
          editorial_review: BkEditorialReview;
          owner_id: string | null;
          delivered_at: string | null;
          legacy_rate_delta: number | null;
          margin_foregone: number | null;
          /** What a public submitter asked for, by the names the form offered (slice 4); empty for a staff request. */
          requested_packages: string[];
          /** Salted hash of a public submitter's address, for the rate limit; null for a staff request. */
          submitted_ip_hash: string | null;
          /** The agreement this project is priced and scheduled under (slice 5); must belong to its partner. */
          agreement_id: string | null;
          /** The primary window staff picked when the request was created (§18.2); null means first available. */
          event_window_start: string | null;
          event_window_end: string | null;
          /** auto: the system plans the dates; manual: "Adjust scope" — staff planned them by hand. */
          dates_mode: "auto" | "manual";
          /** Qualifies as strategic but was priced at the university rate because the reserve ran out (§18.5). */
          reserve_depleted: boolean;
          /** Slice B (§19.1): exact, stored when priced. */
          labor_cost: number | null;
          resource_cost: number | null;
          direct_expense_cost: number | null;
          full_economic_cost: number | null;
          partner_recovery: number | null;
          wuwf_contribution: number | null;
          external_margin: number | null;
          external_assessment: number | null;
          market_benchmarks: {
            packageId: string;
            label: string;
            floor: number;
            ceiling: number | null;
            reference: string | null;
            rate: number;
          }[];
          economics: { version: number; lines: unknown[]; error?: string } | null;
          created_at: string;
          created_by: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_projects"]["Row"]> & {
          partner_id: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_projects"]["Row"]>;
        Relationships: [];
      };
      bk_assumption_assets: {
        Row: { assumption_id: string; asset_id: string };
        Insert: { assumption_id: string; asset_id: string };
        Update: Partial<{ assumption_id: string; asset_id: string }>;
        Relationships: [];
      };
      bk_rate_card_unit_costs: {
        Row: {
          id: string;
          version_id: string;
          kind: "labor" | "pool";
          labor_class_id: string | null;
          pool_id: string | null;
          name: string;
          unit_cost: number;
          charged_in_strategic: boolean | null;
          snapshotted_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_rate_card_unit_costs"]["Row"]> & {
          version_id: string;
          kind: "labor" | "pool";
          name: string;
          unit_cost: number;
        };
        Update: Partial<Database["public"]["Tables"]["bk_rate_card_unit_costs"]["Row"]>;
        Relationships: [];
      };
      bk_hours_used: {
        Row: {
          id: string;
          project_id: string;
          kind: "labor" | "units";
          labor_class_id: string | null;
          pool_id: string | null;
          planned: number;
          used: number;
          confirmed_at: string;
          confirmed_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_hours_used"]["Row"]> & {
          project_id: string;
          kind: "labor" | "units";
          used: number;
        };
        Update: Partial<Database["public"]["Tables"]["bk_hours_used"]["Row"]>;
        Relationships: [];
      };
      bk_booking_events: {
        Row: {
          id: string;
          plan_id: string | null;
          project_id: string | null;
          pool_id: string | null;
          date: string | null;
          kind: "refused" | "released";
          reason: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_booking_events"]["Row"]> & {
          kind: "refused" | "released";
        };
        Update: Partial<Database["public"]["Tables"]["bk_booking_events"]["Row"]>;
        Relationships: [];
      };
      /** A package, a labor class's hours, or a direct expense. Rates written by TypeScript from the card snapshot; labor_hours/resource_units are per unit. */
      bk_estimate_lines: {
        Row: {
          id: string;
          project_id: string;
          kind: BkEstimateLineKind;
          package_id: string | null;
          labor_class_id: string | null;
          label: string;
          unit_label: string;
          quantity: number;
          unit_rate: number;
          amount: number;
          /** Hours per labor class id, per unit of the line. */
          labor_hours: Record<string, number>;
          /** Units per pool id, per unit of the line. */
          resource_units: Record<string, number>;
          /** An expense line's cost each as typed, before any assessment (§18.8); null otherwise. */
          direct_cost: number | null;
          /** §20.6: the standard recipe the line started from, and why it differs. */
          recipe_labor_hours: Record<string, number> | null;
          recipe_resource_units: Record<string, number> | null;
          adjustment_reason: string | null;
          notes: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_estimate_lines"]["Row"]> & {
          project_id: string;
          kind: BkEstimateLineKind;
          label: string;
          unit_label: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_estimate_lines"]["Row"]>;
        Relationships: [];
      };
      /** Airtime a project asks for; placed in Traffic or On Air, never here (external_ref says where). */
      bk_airtime_commitments: {
        Row: {
          id: string;
          project_id: string;
          airings_per_week: number;
          seconds: number;
          starts_on: string;
          ends_on: string | null;
          treatment: BkAirtimeTreatment;
          honored_in: BkAirtimeHonoredIn;
          external_ref: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_airtime_commitments"]["Row"]> & {
          project_id: string;
          airings_per_week: number;
          seconds: number;
          starts_on: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_airtime_commitments"]["Row"]>;
        Relationships: [];
      };
      /** A project's staff-visible timeline (the ap_submission_events shape). */
      bk_project_events: {
        Row: {
          id: string;
          project_id: string;
          kind: string;
          actor_id: string | null;
          note: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_project_events"]["Row"]> & {
          project_id: string;
          kind: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_project_events"]["Row"]>;
        Relationships: [];
      };
      /** Singleton (id always true) behind the public request form at /book (slice 4, 20261006130000_bookings_public_intake.sql). */
      bk_settings: {
        Row: {
          id: boolean;
          is_open: boolean;
          intro_copy: string;
          confirmation_copy: string;
          closed_copy: string;
          offered_packages: string[];
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_settings"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["bk_settings"]["Row"]>;
        Relationships: [];
      };
      /** A partner's standing arrangement (slice 5, 20261006140000_bookings_partners_agreements.sql). bk_guard_agreement() keeps approval for the executive. */
      bk_agreements: {
        Row: {
          id: string;
          partner_id: string;
          label: string;
          starts_on: string;
          ends_on: string;
          status: BkAgreementStatus;
          /** Professional hours of the term's reserve this agreement may draw. */
          reserve_hours_allocated: number;
          funded_student_hours: number;
          expected_volume: string | null;
          booking_deadline_days: number;
          release_deadline_days: number;
          blackout_notes: string | null;
          direct_cost_treatment: string | null;
          capital_notes: string | null;
          beyond_envelope_note: string | null;
          airtime_minutes_per_week: number;
          approved_by: string | null;
          approved_at: string | null;
          ended_at: string | null;
          /** Object path in the private bookings-documents bucket. */
          document_path: string | null;
          notes: string | null;
          created_at: string;
          created_by: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_agreements"]["Row"]> & {
          partner_id: string;
          label: string;
          starts_on: string;
          ends_on: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_agreements"]["Row"]>;
        Relationships: [];
      };
      /** A window held for an agreement's partner; reads as released past its deadline (bk_reserved_block_reserves()). */
      bk_reserved_blocks: {
        Row: {
          id: string;
          agreement_id: string;
          pool_id: string;
          date: string;
          window_start: string;
          window_end: string;
          project_id: string | null;
          booking_id: string | null;
          released_at: string | null;
          kept_by: string | null;
          kept_at: string | null;
          notes: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["bk_reserved_blocks"]["Row"]> & {
          agreement_id: string;
          pool_id: string;
          date: string;
          window_start: string;
          window_end: string;
        };
        Update: Partial<Database["public"]["Tables"]["bk_reserved_blocks"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      /** Security invoker; finance's RLS applies. Puts one version in use for estimates. */
      bk_set_version_in_use: {
        Args: { p_version_id: string };
        Returns: { ok: true; changed: boolean } | { error: string };
      };
      /** Security invoker; the guard trigger checks the executive. */
      bk_adopt_version: {
        Args: { p_version_id: string; p_destination_index?: string | null };
        Returns: { ok: true } | { error: string };
      };
      /** Security invoker; finance's RLS applies. Writes a package and its labor/resource rows in one transaction. */
      bk_save_package: {
        Args: { p_package: Record<string, unknown>; p_labor: unknown[]; p_resources: unknown[] };
        Returns: { ok: true; id: string } | { error: string };
      };
      /** Security invoker. A booking and its hours per class in one transaction; the rule's triggers raise on refusal. */
      bk_create_booking: {
        Args: { p_booking: Record<string, unknown>; p_labor: unknown[] };
        Returns: { ok: true; id: string };
      };
      /** Security invoker. A hold and its hours per class in one transaction. */
      bk_create_hold: {
        Args: { p_hold: Record<string, unknown>; p_labor: unknown[] };
        Returns: { ok: true; id: string };
      };
      /** Security invoker (slice 3). Planned dates become tentative holds until p_expires_at; the rule's triggers raise on a refusal and roll the send back. */
      bk_send_estimate: {
        Args: { p_project_id: string; p_expires_at: string };
        Returns: { ok: true; held: number } | { error: string };
      };
      /** Security invoker (slice 3). Tentative holds are confirmed; the project is booked. */
      bk_approve_estimate: {
        Args: { p_project_id: string; p_legacy_rate_delta?: number | null };
        Returns: { ok: true; confirmed: number } | { error: string };
      };
      /** Security invoker (slice 3). Releases the project's holds and records the disposition. */
      bk_set_project_disposition: {
        Args: {
          p_project_id: string;
          p_disposition: BkProjectDisposition;
          p_reason: string;
          p_margin_foregone?: number | null;
        };
        Returns: { ok: true; released: number } | { error: string };
      };
      /**
       * Security definer read (slice 3, docs/bookings-design.md §6.5): what
       * Traffic has scheduled and On Air pins for the plan's airtime
       * commitments, by external_ref. Parsed by lib/bookings/airtime.ts's
       * parseHonoredRead().
       */
      /**
       * The public intake's two security-definer functions (slice 4,
       * docs/bookings-design.md §6.3): execute granted to anon and
       * authenticated; the whole of what a visitor with no session reaches.
       */
      bk_public_form_config: {
        Args: Record<string, never>;
        Returns: BkPublicFormConfig;
      };
      bk_submit_request: {
        Args: { p_payload: Record<string, unknown>; p_ip_hash: string | null };
        Returns: { ok: true; confirmation_copy: string } | { error: string };
      };
      /** Security invoker (slice 5). The block takes the project and the project gets a booking on its window, in one transaction. */
      bk_attach_reserved_block: {
        Args: { p_block_id: string; p_project_id: string; p_labor: unknown[] };
        Returns: { ok: true; booking_id: string; status: BkBookingStatus } | { error: string };
      };
      bk_institutional_airtime_honored: {
        Args: { p_plan_id: string };
        Returns: { ok: true; as_of: string; commitments: unknown[] } | { error: string };
      };
      /**
       * Security definer read of On Air's clocks (docs/bookings-design.md §6.5):
       * university-eligible avails and minutes a week per program, with the
       * minutes their pinned content already takes. Parsed by
       * lib/bookings/airtime.ts's parseAirtimeRead().
       */
      bk_university_avails_per_week: {
        Args: { p_plan_id: string };
        Returns:
          | {
              ok: true;
              as_of: string;
              programs: {
                program_id: string;
                name: string;
                avails_per_week: number;
                minutes_per_week: number;
                pinned_minutes_per_week: number;
              }[];
            }
          | { error: string };
      };
      /**
       * The seven-function public surface of Audience Listening
       * (20260730170000_audience_listening.sql). al_* table RLS is staff-only;
       * these security-definer functions are how a participant reads a query
       * and writes a submission. Every one of them re-derives authorization
       * from auth.uid() and returns only public-facing fields. All return
       * jsonb, so each `Returns` below is the documented payload shape rather
       * than a row type.
       */
      al_public_query: {
        Args: { p_public_id: string };
        Returns: PublicQueryPayload | null;
      };
      al_start_submission: {
        Args: { p_public_id: string };
        Returns: { submission_id: string; resumed: boolean } | { error: string };
      };
      al_participant_progress: {
        Args: { p_submission_id: string };
        Returns: {
          status: AlSubmissionStatus;
          answers: {
            answer_id: string;
            question_id: string | null;
            status: AlAnswerStatus;
            duration_ms: number | null;
          }[];
        } | null;
      };
      al_reserve_answer: {
        Args: { p_submission_id: string; p_question_id: string; p_content_type: string };
        Returns: { answer_id: string; storage_path: string } | { error: string };
      };
      al_complete_answer: {
        Args: { p_answer_id: string; p_size_bytes: number; p_duration_ms: number | null };
        Returns: { ok: true } | { error: string };
      };
      al_save_participant_details: {
        Args: {
          p_submission_id: string;
          p_name: string | null;
          p_email: string | null;
          p_phone: string | null;
          p_city: string | null;
          p_note: string | null;
          p_consent_contact: boolean;
          p_consent_identify: boolean;
          p_request_anonymous: boolean;
        };
        Returns: { ok: true } | { error: string };
      };
      al_finalize_submission: {
        Args: { p_submission_id: string; p_consent_agreed: boolean };
        Returns: { ok: true; answers: number } | { error: string };
      };
      /**
       * Guest-join entry point (20260729180000_remote_interview_waiting_room.sql).
       * Validates the join token and binds it to the caller's own (anonymous)
       * auth.uid(). Returns null for any invalid token.
       */
      ri_bind_guest_participant: {
        Args: { p_token: string };
        Returns: Database["public"]["Tables"]["ri_participants"]["Row"] | null;
      };
      /**
       * Called once guest preflight completes. Returns null if the caller
       * isn't bound to that row, the link was revoked, or it's already admitted.
       */
      ri_guest_join_waiting_room: {
        Args: { p_participant_id: string; p_display_name?: string | null };
        Returns: Database["public"]["Tables"]["ri_participants"]["Row"] | null;
      };
      tw_shift_segment_positions: {
        Args: { p_representation_id: string; after_position: number; delta: number };
        Returns: undefined;
      };
      /**
       * Hybrid keyword + semantic search (20260728120000_transcription_search.sql).
       * query_embedding is a pgvector literal string, or null for keyword-only.
       * project_id_filter/source_id_filter (20260803130000_tw_search_scoping.sql)
       * narrow the search to one project's sources or one source; both null runs
       * the tool-wide search.
       */
      tw_search: {
        Args: {
          query_text: string;
          query_embedding?: string | null;
          match_limit?: number;
          project_id_filter?: string | null;
          source_id_filter?: string | null;
        };
        Returns: {
          kind: string;
          result_id: string;
          project_id: string;
          source_id: string | null;
          project_title: string;
          project_description: string | null;
          interview_date: string | null;
          start_ms: number | null;
          end_ms: number | null;
          /** Document hits only (chunk or excerpt) — see docs/sourcework-design.md §8.8. */
          page_number: number | null;
          title: string | null;
          snippet: string;
          speaker_label: string | null;
          score: number;
        }[];
      };
      /**
       * The two-function public surface of Academic Partnerships
       * (20260803140000_academic_partnerships.sql). ap_* table RLS is
       * staff-only; these are the only public entry points — see design doc §3.
       */
      ap_public_form_config: {
        Args: Record<string, never>;
        Returns: ApPublicFormConfig;
      };
      ap_submit_inquiry: {
        Args: { p_payload: Record<string, unknown>; p_ip_hash: string | null };
        Returns:
          | { ok: true; confirmation_copy: string }
          | { error: string };
      };
      /**
       * The two-way Log boundary Underwriting & Traffic's redesign rebuilds
       * against breaks/schedule lines (20260808200000_underwriting_redesign.sql).
       * Security definer: the caller may have no RLS access to Log's own
       * tables at all.
       */
      log_list_placeable_rundown_breaks: {
        Args: { p_schedule_line_id: string };
        Returns:
          | {
              ok: true;
              breaks: {
                break_id: string;
                rundown_id: string;
                /** 20260925190000 — a live/submitted rundown is frozen to automation. */
                rundown_status: LogRundownStatus;
                air_date: string;
                scheduled_at: string;
                label: string;
                program_name: string;
                remaining_seconds: number;
                // Added by 20260809140000_underwriting_break_adjacency.sql —
                // the id of whichever item currently holds this break's
                // highest position, for the auto-fill scheduler's
                // same-underwriter/same-industry adjacency check.
                last_item_id: string | null;
                /** Minutes since midnight, station-local (2026-09-25). */
                minutes_of_day: number;
                /** True when this contract already holds a credit in this break. */
                holds_this_contract: boolean;
                /** The active demand bucket this break would consume. */
                bucket_id: string;
                /** 20260925190000 — every item in the break, with the placement/line/underwriter behind a credit (null for host content). */
                items: {
                  item_id: string;
                  position: number;
                  duration_seconds: number;
                  placement_id: string | null;
                  schedule_line_id: string | null;
                  contract_id: string | null;
                  underwriter_id: string | null;
                  category_id: string | null;
                  time_mode: UwTimeMode | null;
                  service_level: UwServiceLevel | null;
                  makegood_id: string | null;
                  bucket_id: string | null;
                  has_outcome: boolean;
                }[];
              }[];
            }
          | { error: string };
      };
      /** Added by 20260821180000_log_program_log_import.sql — everything a Log member needs to match a program-log export's credits against existing underwriters/copy. Security definer; uw_* RLS stays staff-only. */
      log_import_list_underwriting_copy: {
        Args: Record<string, never>;
        Returns:
          | {
              underwriters: { id: string; name: string }[];
              copy: {
                id: string;
                underwriter_id: string | null;
                label: string;
                cart_identifier: string | null;
                script: string | null;
                duration_seconds: number | null;
                approval_status: UwCopyApprovalStatus;
              }[];
            }
          | { error: string };
      };
      /** Added by 20260821180000_log_program_log_import.sql — find-or-create an underwriter by name (case-insensitive). */
      log_import_underwriter: {
        Args: { p_name: string };
        Returns: string;
      };
      /** Added by 20260821180000_log_program_log_import.sql — find-or-create one copy row under an underwriter, keyed (underwriter, cart, label). */
      log_import_underwriting_copy: {
        Args: {
          p_underwriter_id: string;
          p_label: string;
          p_cart_identifier: string | null;
          p_script: string | null;
          p_duration_seconds: number | null;
        };
        Returns: string;
      };
      log_import_update_underwriting_copy: {
        Args: { p_copy_id: string; p_script: string; p_duration_seconds?: number | null };
        Returns: boolean;
      };
      /** Added by 20260824120000_log_underwriters_for_rundown_copy.sql — each referenced uw_copy row's underwriter name (direct or contract attribution) for the rundown screen's credit cards. */
      log_underwriters_for_copy: {
        Args: { p_copy_ids: string[] };
        Returns: { copy_id: string; underwriter_name: string | null }[];
      };
      /** Added by 20260821180000_log_program_log_import.sql — deletes an underwriting-credit item only when no uw_scheduled_placements row references it (a placement-backed credit must go through log_clear_underwriting_credit instead). */
      log_delete_unplaced_credit_item: {
        Args: { p_item_id: string };
        Returns: { ok: true } | { error: string };
      };
      log_place_underwriting_credit: {
        Args: {
          p_break_id: string;
          p_schedule_line_id: string;
          p_copy_id: string;
          p_override_reason: string | null;
          /** 2026-09-25: schedules this makegood with the placement (exempt from the period quota, not the day cap). */
          p_makegood_id?: string | null;
          /** 20260925190000: true for auto-fill/provisioning/bumping — refuses a live/submitted rundown or a past break. */
          p_automated?: boolean;
        };
        Returns:
          | {
              ok: true;
              placement_id: string;
              item_id: string;
              bucket_id: string;
              period_start: string;
              period_end: string;
            }
          | { error: string };
      };
      /** 20260925190000: moves a movable credit to another break in its own bucket (clear + place, one subtransaction) so a constrained credit can be seated. */
      log_bump_underwriting_credit: {
        Args: { p_placement_id: string; p_destination_break_id: string };
        Returns:
          | {
              ok: true;
              placement_id: string;
              item_id: string;
              superseded_placement_id: string;
              from_break_id: string;
              to_break_id: string;
            }
          | { error: string };
      };
      log_clear_underwriting_credit: {
        /** 20260925190000: p_automated refuses a frozen rundown or a past break. */
        Args: { p_placement_id: string; p_automated?: boolean };
        Returns: { ok: true } | { error: string };
      };
      /** Added by 20260927160000_underwriting_copy_rotation.sql — the rotation walk's read: each of a contract's non-superseded placements with the room its break could give it, its rundown status and break start (for the freeze rule), and whether it has a broadcast event. */
      log_list_underwriting_credit_rooms: {
        Args: { p_contract_id: string };
        Returns:
          | {
              ok: true;
              rooms: {
                placement_id: string;
                room_seconds: number;
                rundown_status: LogRundownStatus;
                break_scheduled_at: string;
                has_outcome: boolean;
              }[];
            }
          | { error: string };
      };
      /** Added by 20260927160000_underwriting_copy_rotation.sql — the rotation walk's write: swaps which linked message one future, unaired, unfrozen, un-overridden placement carries. */
      log_reassign_underwriting_credit_copy: {
        Args: { p_placement_id: string; p_copy_id: string };
        Returns: { ok: true; changed: boolean } | { error: string };
      };
      /** Human-readable program list for pickers outside Log — see CLAUDE.md's "Underwriting domain redesign" note. */
      /** Added by 20261002120000_underwriting_copy_dad_cut.sql — DAD library cuts matching a cut number or title, at most 20, for the copy form's existing-spot picker. */
      log_assign_dad_spot_numbers: {
        Args: { p_item_ids: string[] };
        Returns:
          | { ok: true; numbers: { item_id: string; spot_number: number }[] }
          | { error: string };
      };
      log_search_dad_cuts: {
        Args: { p_query: string };
        Returns:
          | { ok: true; cuts: { cut: string; title: string; group: string | null }[] }
          | { error: string };
      };
      log_list_programs: {
        Args: Record<string, never>;
        Returns: { ok: true; programs: { id: string; name: string }[] } | { error: string };
      };
      /** Added by 20260927120000_underwriting_create_inventory_pool.sql — the Pools screen's inline New pool card creates a pool and its targets in one transaction. Security invoker; returns the new pool's id. */
      uw_create_inventory_pool: {
        Args: {
          p_name: string;
          p_description: string | null;
          p_targets: {
            program_id: string | null;
            window_start: string | null;
            window_end: string | null;
            days_of_week: number[] | null;
            notes: string | null;
          }[];
        };
        Returns: string;
      };
      /** Owned by Underwriting (reads uw_exceptions), gated to Log members — backs the rundown submission attestation. */
      uw_has_open_exceptions_for_rundown: {
        Args: { p_rundown_id: string };
        Returns: boolean;
      };
      /** Added by 20260809150000_underwriting_rundown_provisioning.sql — everything lib/underwriting/rundown-provisioning.ts needs to resolve a program's schedule/clock/local-opportunity context itself, past Log's has_log_access-gated tables. Widened by 20260810130000_log_opportunity_assignment_placement_boundary.sql to also return active opportunity assignments and the content items they reference, so planAssignedContentPlacements() can plan assigned-content placement (legal ID included) for auto-fill-provisioned rundowns. */
      log_get_program_schedule_context: {
        Args: { p_program_id: string };
        Returns:
          | {
              ok: true;
              schedule_entries: {
                id: string;
                clock_template_id: string;
                entry_type: LogScheduleEntryType;
                days_of_week: number[];
                start_date: string;
                end_date: string | null;
                air_time: string;
                duration_minutes: number;
              }[];
              clock_versions: {
                id: string;
                clock_template_id: string;
                variant: LogClockVersionVariant;
                effective_from: string;
                effective_to: string | null;
              }[];
              local_opportunities: {
                id: string;
                clock_version_id: string;
                slot_id: string;
                slot_position: number;
                slot_label: string | null;
                requirement: LogOpportunityRequirement;
                timing_mode: "fixed" | "float";
                start_offset_seconds: number | null;
                duration_seconds: number;
                earliest_start_offset_seconds: number | null;
                latest_start_offset_seconds: number | null;
                permitted_content_types: string[];
              }[];
              opportunity_assignments: {
                id: string;
                local_opportunity_id: string;
                content_item_id: string;
                hour_index: number | null;
                days_of_week: number[];
                active: boolean;
              }[];
              content_items: {
                id: string;
                expected_duration_seconds: number | null;
                components: { component_type: LogComponentType; duration_seconds: number; required: boolean }[];
              }[];
              existing_rundown_dates: string[];
            }
          | { error: string };
      };
      /** Added by 20260809150000_underwriting_rundown_provisioning.sql, widened by 20260809160000_underwriting_rundown_provisioning_returns_breaks.sql to return the resulting breaks, and again by 20260810120000_log_opportunity_assignments.sql to include each break's local_opportunity_id — inserts the same shape generateRundown() itself inserts, idempotent on log_rundowns' (program_id, air_date) constraint. Break drafts arrive precomputed (buildRundownBreakDrafts()). */
      log_generate_rundown_for_underwriting: {
        Args: {
          p_program_id: string;
          p_schedule_entry_id: string;
          p_clock_version_id: string;
          p_air_date: string;
          p_shift_start_at: string;
          p_shift_end_at: string;
          p_break_drafts: Record<string, unknown>[];
        };
        Returns:
          | {
              ok: true;
              rundown_id: string;
              already_existed: boolean;
              breaks: {
                break_id: string;
                local_opportunity_id: string;
                permitted_content_types: string[];
                scheduled_at: string;
                available_duration_seconds: number;
              }[];
            }
          | { error: string };
      };
      /** Added by 20260810130000_log_opportunity_assignment_placement_boundary.sql — writes precomputed log_rundown_items rows (planned in TS by planAssignedContentPlacements) past RLS for an underwriting-only caller. */
      log_insert_rundown_items_for_underwriting: {
        Args: { p_items: Record<string, unknown>[] };
        Returns: { ok: true; inserted: number } | { error: string };
      };
      /** Gated by has_log_access, not has_underwriting_access — see 20260809130000_underwriting_credit_relocation.sql. Moves an already-placed, not-yet-aired credit to a different open break in the same rundown. */
      log_relocate_underwriting_credit: {
        Args: { p_item_id: string; p_destination_break_id: string };
        Returns: { ok: true; item_id: string; placement_id: string } | { error: string };
      };
      /**
       * Added by 20260901120000_log_npr_episode_cache_atomic.sql. Replaces a
       * program+date's cached NPR episode (and its items) as one atomic
       * transaction — see lib/log/npr.ts's replaceEpisodeCache, which calls
       * this instead of a separate delete+insert (a real race when two
       * clients' lazy-refresh polls crossed the staleness threshold at once).
       * Security invoker: RLS on log_npr_episodes/log_npr_episode_items still
       * applies exactly as if the caller ran the statements directly.
       * p_npr_episode_id/p_title/p_raw/p_items are null for a "not_found"
       * status — the generator infers these as non-null from the SQL
       * parameter types alone (it doesn't see the not_found branch), so this
       * is a deliberate hand-correction, same as the RPC nullability notes
       * elsewhere in this file.
       */
      log_replace_npr_episode_cache: {
        Args: {
          p_program_id: string;
          p_show_date: string;
          p_npr_collection_id: number;
          p_status: LogNprEpisodeStatus;
          p_npr_episode_id: string | null;
          p_title: string | null;
          p_raw: unknown;
          p_items: { npr_item_id: string; title: string; teaser: string | null; duration_seconds: number | null; raw: unknown }[] | null;
        };
        Returns: Database["public"]["Tables"]["log_npr_episodes"]["Row"];
      };
      /**
       * The only way an ei_inquiries row is created — inserts it (snapshotting
       * the pillar's name/guiding_question) and its depth-0 root ei_questions
       * row together. Signature changed from p_seed_question (text) to
       * p_pillar_id (uuid) in 20260820130000_editorial_inquiry_grounded_
       * reasoning.sql — an inquiry is tied to a WUWF guiding question (a
       * pillar), never independently typed. Raises (not a jsonb error) if the
       * caller lacks access, the pillar isn't active, or it has no guiding
       * question set yet.
       */
      /** security invoker — rc_articles RLS scopes what it ranks. */
      rc_search_articles: {
        Args: {
          p_query: string;
          p_limit?: number;
          p_fallback_query?: string | null;
          /** A pgvector literal; null runs the keyword half alone. */
          p_embedding?: string | null;
        };
        Returns: { id: string; rank: number }[];
      };
      /** security invoker — an editor's session sees every article. */
      rc_articles_needing_embedding: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          title: string;
          summary: string | null;
          body_text: string;
          content_hash: string;
        }[];
      };
      ei_create_inquiry: {
        Args: { p_pillar_id: string };
        Returns: Database["public"]["Tables"]["ei_inquiries"]["Row"];
      };
    };
    Enums: {
      platform_role: PlatformRole;
      account_status: AccountStatus;
      tool_status: ToolStatus;
      access_request_status: AccessRequestStatus;
      sw_source_kind: SwSourceKind;
      sw_source_status: SwSourceStatus;
      sw_representation_kind: SwRepresentationKind;
      sw_representation_status: SwRepresentationStatus;
      sw_document_block_type: SwDocumentBlockType;
      ri_session_status: RiSessionStatus;
      ri_participant_role: RiParticipantRole;
      ri_track_source: RiTrackSource;
      ri_track_status: RiTrackStatus;
      al_query_status: AlQueryStatus;
      al_field_mode: AlFieldMode;
      al_transcription_mode: AlTranscriptionMode;
      al_submission_status: AlSubmissionStatus;
      al_review_state: AlReviewState;
      al_answer_status: AlAnswerStatus;
      al_transcription_state: AlTranscriptionState;
      rd_post_kind: RdPostKind;
      rd_post_status: RdPostStatus;
      rc_kind: RcKind;
      rc_source: RcSource;
      ap_partnership_type: ApPartnershipType;
      ap_stage: ApStage;
      ap_disposition: ApDisposition;
      ap_fit: ApFit;
      ap_capacity: ApCapacity;
      ap_timing: ApTiming;
      ap_event_type: ApEventType;
      bk_version_status: BkVersionStatus;
      bk_validation_state: BkValidationState;
      bk_assumption_section: BkAssumptionSection;
      bk_assumption_kind: BkAssumptionKind;
      bk_assumption_owner: BkAssumptionOwner;
      bk_pay_basis: BkPayBasis;
      bk_pool_costing: BkPoolCosting;
      bk_asset_funding: BkAssetFunding;
      bk_asset_burden: BkAssetBurden;
      bk_asset_condition: BkAssetCondition;
      bk_rate_card_line_kind: BkRateCardLineKind;
      bk_term_plan_status: BkTermPlanStatus;
      bk_hold_kind: BkHoldKind;
      bk_booking_status: BkBookingStatus;
      bk_pricing_treatment: BkPricingTreatment;
      bk_partner_kind: BkPartnerKind;
      bk_requested: BkRequested;
      bk_project_stage: BkProjectStage;
      bk_project_disposition: BkProjectDisposition;
      bk_project_source: BkProjectSource;
      bk_editorial_review: BkEditorialReview;
      bk_estimate_line_kind: BkEstimateLineKind;
      bk_airtime_treatment: BkAirtimeTreatment;
      bk_airtime_honored_in: BkAirtimeHonoredIn;
    };
    CompositeTypes: Record<string, never>;
  };
}
