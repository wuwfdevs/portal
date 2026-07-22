// Hand-written to match supabase/migrations/*. Once a real Supabase project
// exists, regenerate with `npm run db:types` and replace this file.

export type PlatformRole = "administrator" | "staff" | "student" | "faculty_partner";
export type AccountStatus = "invited" | "pending" | "active" | "disabled";
export type ToolStatus = "available" | "in_development" | "planned";
export type AccessRequestStatus = "pending" | "approved" | "denied";
export type ToolDefaultAccess = "invite_only" | "approved_staff" | "open";

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
