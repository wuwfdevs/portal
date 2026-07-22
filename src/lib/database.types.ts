// Hand-written to match supabase/migrations/*. Once a real Supabase project
// exists, regenerate with `npm run db:types` and replace this file.

export type PlatformRole = "administrator" | "staff" | "student" | "faculty_partner";
export type AccountStatus = "invited" | "pending" | "active" | "disabled";
export type ToolStatus = "available" | "in_development" | "planned";
export type AccessRequestStatus = "pending" | "approved" | "denied";
export type ToolDefaultAccess = "invite_only" | "approved_staff" | "open";

// Editorial Planning (ep_*) — see supabase/migrations/20260722130000_editorial_planning.sql.
export type EpFieldType = "short_text" | "long_text" | "select" | "multi_select" | "date" | "url";
export type EpPitchStatus = "open" | "assigned" | "archived";
export type EpMeetingStatus = "open" | "agenda" | "concluded";
export type EpDecisionOutcome = "assigned" | "deferred" | "archived";
/** ep_pitch_values.value: a string for most field types, string[] for multi_select. */
export type EpFieldValue = string | string[];

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      platform_role: PlatformRole;
      account_status: AccountStatus;
      tool_status: ToolStatus;
      access_request_status: AccessRequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
