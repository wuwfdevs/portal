// Hand-written to match supabase/migrations/*, verified field-by-field
// against `supabase gen types` output from the live preview project
// (2026-07-25) — accurate as of that check. Kept hand-written rather than
// swapped for the generator's raw output on purpose: the generator emits a
// differently-shaped module (generic Tables<>/TablesInsert<>/Enums<>
// helpers, no named exports) that every existing import of PlatformRole,
// ToolStatus, EpFieldType, etc. across both tools would break against.
// Re-run `npm run db:types` to re-verify after a schema change, but
// reconcile its output into this file's existing shape rather than
// replacing it outright.

export type PlatformRole = "administrator" | "staff" | "student" | "faculty_partner";
export type AccountStatus = "invited" | "pending" | "active" | "disabled";
export type ToolStatus = "available" | "in_development" | "planned";
export type AccessRequestStatus = "pending" | "approved" | "denied";
export type ToolDefaultAccess = "invite_only" | "approved_staff" | "open";
export type TwProjectStatus = "uploading" | "processing" | "ready" | "failed";

// Editorial Planning (ep_*) — see supabase/migrations/20260722130000_editorial_planning.sql.
export type EpFieldType = "short_text" | "long_text" | "select" | "multi_select" | "date" | "url";
export type EpPitchStatus = "open" | "assigned" | "archived";
export type EpMeetingStatus = "open" | "agenda" | "concluded";
export type EpDecisionOutcome = "assigned" | "deferred" | "archived";
/** ep_pitch_values.value: a string for most field types, string[] for multi_select. */
export type EpFieldValue = string | string[];

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
          interview_date: string | null;
          status: TwProjectStatus;
          /** Generated column (title + description) — read-only. */
          search: string;
          media_storage_path: string | null;
          media_content_type: string | null;
          media_size_bytes: number | null;
          media_duration_ms: number | null;
          transcription_provider_job_id: string | null;
          error_message: string | null;
          transcribed_at: string | null;
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
      tw_speakers: {
        Row: {
          id: string;
          project_id: string;
          diarization_label: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tw_speakers"]["Row"]> & {
          project_id: string;
          diarization_label: string;
        };
        Update: Partial<Database["public"]["Tables"]["tw_speakers"]["Row"]>;
        Relationships: [];
      };
      tw_segments: {
        Row: {
          id: string;
          project_id: string;
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
          project_id: string;
          position: number;
          start_ms: number;
          end_ms: number;
        };
        Update: Partial<Database["public"]["Tables"]["tw_segments"]["Row"]>;
        Relationships: [];
      };
      tw_clips: {
        Row: {
          id: string;
          project_id: string;
          title: string;
          start_ms: number;
          end_ms: number;
          excerpt: string;
          /** Generated column (title + excerpt) — read-only. */
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
        Insert: Partial<Database["public"]["Tables"]["tw_clips"]["Row"]> & {
          project_id: string;
          title: string;
          start_ms: number;
          end_ms: number;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["tw_clips"]["Row"]>;
        Relationships: [];
      };
      tw_chunks: {
        Row: {
          id: string;
          project_id: string;
          start_ms: number;
          end_ms: number;
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
          project_id: string;
          start_ms: number;
          end_ms: number;
          text: string;
        };
        Update: Partial<Database["public"]["Tables"]["tw_chunks"]["Row"]>;
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
        };
        Insert: Partial<Database["public"]["Tables"]["ep_criteria"]["Row"]> & {
          name: string;
          description: string;
        };
        Update: Partial<Database["public"]["Tables"]["ep_criteria"]["Row"]>;
        Relationships: [];
      };
      ep_settings: {
        Row: {
          id: boolean;
          scale_min: number;
          scale_max: number;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ep_settings"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["ep_settings"]["Row"]>;
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
        };
        Insert: Database["public"]["Tables"]["ep_review_scores"]["Row"];
        Update: Partial<Database["public"]["Tables"]["ep_review_scores"]["Row"]>;
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
    };
    Views: Record<string, never>;
    Functions: {
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
        Args: { p_project_id: string; after_position: number; delta: number };
        Returns: undefined;
      };
      /**
       * Hybrid keyword + semantic search (20260728120000_transcription_search.sql).
       * query_embedding is a pgvector literal string, or null for keyword-only.
       */
      tw_search: {
        Args: {
          query_text: string;
          query_embedding?: string | null;
          match_limit?: number;
        };
        Returns: {
          kind: string;
          result_id: string;
          project_id: string;
          project_title: string;
          project_description: string | null;
          interview_date: string | null;
          start_ms: number | null;
          end_ms: number | null;
          title: string | null;
          snippet: string;
          speaker_label: string | null;
          score: number;
        }[];
      };
    };
    Enums: {
      platform_role: PlatformRole;
      account_status: AccountStatus;
      tool_status: ToolStatus;
      access_request_status: AccessRequestStatus;
      tw_project_status: TwProjectStatus;
      ri_session_status: RiSessionStatus;
      ri_participant_role: RiParticipantRole;
      ri_track_source: RiTrackSource;
      ri_track_status: RiTrackStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
