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
export type LogSlotFillMode = "required" | "optional" | "host_fillable";
export type LogSlotAssignmentMode = "automatic" | "preassigned" | "host_selected";
export type LogSlotTimingMode = "fixed" | "float";
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

// Roadmap (rd_*) — see supabase/migrations/20260801121000_roadmap.sql.
export type RdPostKind = "feature" | "improvement" | "bug" | "new_tool";
export type RdPostStatus =
  | "open"
  | "under_review"
  | "planned"
  | "in_progress"
  | "shipped"
  | "declined";
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
          /** ProseMirror JSON — see lib/roadmap/rich-text.ts for the whitelist. */
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
      // Insert-only, same reasoning as log_clock_versions.
      log_clock_slots: {
        Row: {
          id: string;
          clock_version_id: string;
          position: number;
          start_offset_seconds: number | null;
          duration_seconds: number;
          permitted_content_types: string[];
          fill_mode: LogSlotFillMode;
          assignment_mode: LogSlotAssignmentMode;
          replaceable: boolean;
          shortenable: boolean;
          allow_empty: boolean;
          allow_multiple: boolean;
          timing_mode: LogSlotTimingMode;
          lock_on_air: boolean;
          label: string | null;
          /** Set only when timing_mode = 'float' — see 20260806140000_log_clock_slot_windows_and_schedule_times.sql. */
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
          audio_object_path: string | null;
          summary: string | null;
          expected_duration_seconds: number | null;
          effective_from: string;
          effective_to: string | null;
          owner_id: string | null;
          approval_status: LogApprovalStatus;
          eligible_program_ids: string[];
          priority: number | null;
          frequency_guidance: string | null;
          reusable: boolean;
          geography_tags: string[];
          subject_tags: string[];
          community_issue_tags: string[];
          reporter_or_editor: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
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
          audio_object_path: string | null;
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
    };
    Views: Record<string, never>;
    Functions: {
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
      ap_partnership_type: ApPartnershipType;
      ap_stage: ApStage;
      ap_disposition: ApDisposition;
      ap_fit: ApFit;
      ap_capacity: ApCapacity;
      ap_timing: ApTiming;
      ap_event_type: ApEventType;
    };
    CompositeTypes: Record<string, never>;
  };
}
