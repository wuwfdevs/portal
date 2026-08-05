import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type {
  ApDisposition,
  ApPartnershipType,
  ApStage,
  Database,
} from "@/lib/database.types";
import { ACADEMIC_PARTNERSHIPS_TOOL_KEY } from "./access";

/**
 * Data access for Academic Partnerships. Every read goes through the
 * RLS-scoped server client, so private.has_academic_partnerships_access is
 * what actually decides what comes back — these functions add shape, not
 * authorization. Reads are unwrapped rather than defaulted to `[]`, per
 * CLAUDE.md: a query that errors and falls back to empty renders exactly
 * like a healthy empty state.
 */

export type ApSubmissionRow = Database["public"]["Tables"]["ap_submissions"]["Row"];
export type ApSubmissionEventRow = Database["public"]["Tables"]["ap_submission_events"]["Row"];
export type ApSettingsRow = Database["public"]["Tables"]["ap_settings"]["Row"];
export type ApEmailTemplateRow = Database["public"]["Tables"]["ap_email_templates"]["Row"];

export interface SubmissionFilters {
  stage?: ApStage;
  disposition?: ApDisposition | "any" | "none";
  ownerId?: string;
  department?: string;
  partnershipType?: ApPartnershipType;
  search?: string;
}

export interface SubmissionListItem extends ApSubmissionRow {
  ownerName: string | null;
}

/**
 * Display names are a courtesy column: `profiles` RLS only shows a non-admin
 * their own row, so this read is frequently short and must never be an
 * error. Same commented exception as lib/roadmap/queries.ts.
 */
async function displayNames(userIds: (string | null)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) return new Map();

  const supabase = await createClient();
  const result = await supabase.from("profiles").select("id, display_name").in("id", unique);
  const rows = result.error ? [] : (result.data ?? []);
  return new Map(rows.map((row) => [row.id, row.display_name]));
}

/** The kanban board: every submission still active in the pipeline (disposition is null). */
export async function listPipelineSubmissions(): Promise<SubmissionListItem[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("ap_submissions")
        .select("*")
        .is("disposition", null)
        .order("stage_changed_at", { ascending: true }),
      "the partnership pipeline",
    ) ?? [];

  const names = await displayNames(rows.map((row) => row.owner_id));
  return rows.map((row) => ({ ...row, ownerName: row.owner_id ? (names.get(row.owner_id) ?? null) : null }));
}

/** All submissions, active and historical, with the filters the table screen offers. */
export async function listAllSubmissions(filters: SubmissionFilters): Promise<SubmissionListItem[]> {
  const supabase = await createClient();
  let query = supabase.from("ap_submissions").select("*");

  if (filters.stage) query = query.eq("stage", filters.stage);
  if (filters.disposition === "none") query = query.is("disposition", null);
  else if (filters.disposition && filters.disposition !== "any") {
    query = query.eq("disposition", filters.disposition);
  }
  if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);
  if (filters.department) query = query.eq("department", filters.department);
  if (filters.partnershipType) query = query.eq("partnership_type", filters.partnershipType);
  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[%,]/g, "");
    query = query.or(
      `faculty_name.ilike.%${term}%,email.ilike.%${term}%,department.ilike.%${term}%,course_title.ilike.%${term}%,description.ilike.%${term}%`,
    );
  }

  const rows =
    unwrapRead(await query.order("created_at", { ascending: false }), "the partnership submissions") ??
    [];

  const names = await displayNames(rows.map((row) => row.owner_id));
  return rows.map((row) => ({ ...row, ownerName: row.owner_id ? (names.get(row.owner_id) ?? null) : null }));
}

/** Distinct departments seen so far, for the filter dropdown. */
export async function listSubmittedDepartments(): Promise<string[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase.from("ap_submissions").select("department").order("department"),
      "the list of departments",
    ) ?? [];
  return Array.from(new Set(rows.map((row) => row.department))).sort();
}

export interface SubmissionDetail extends ApSubmissionRow {
  ownerName: string | null;
  events: (ApSubmissionEventRow & { actorName: string | null })[];
}

export async function getSubmissionDetail(id: string): Promise<SubmissionDetail | null> {
  const supabase = await createClient();
  const submission = unwrapRead(
    await supabase.from("ap_submissions").select("*").eq("id", id).maybeSingle(),
    "this submission",
  );
  if (!submission) return null;

  const events =
    unwrapRead(
      await supabase
        .from("ap_submission_events")
        .select("*")
        .eq("submission_id", id)
        .order("created_at", { ascending: false }),
      "this submission's activity log",
    ) ?? [];

  const names = await displayNames([submission.owner_id, ...events.map((event) => event.actor_id)]);

  return {
    ...submission,
    ownerName: submission.owner_id ? (names.get(submission.owner_id) ?? null) : null,
    events: events.map((event) => ({
      ...event,
      actorName: event.actor_id ? (names.get(event.actor_id) ?? "A colleague") : null,
    })),
  };
}

/** Active staff who hold a grant on this tool — the owner-assignment picker's options. */
export async function listToolMembers(): Promise<{ id: string; displayName: string }[]> {
  const supabase = await createClient();
  const { data: tool } = await supabase
    .from("tools")
    .select("id")
    .eq("key", ACADEMIC_PARTNERSHIPS_TOOL_KEY)
    .maybeSingle();
  if (!tool) return [];

  const grants =
    unwrapRead(
      await supabase.from("tool_access").select("user_id").eq("tool_id", tool.id).is("revoked_at", null),
      "the list of tool members",
    ) ?? [];
  if (grants.length === 0) return [];

  const names = await displayNames(grants.map((grant) => grant.user_id));
  return grants
    .map((grant) => ({ id: grant.user_id, displayName: names.get(grant.user_id) ?? "A colleague" }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getSettings(): Promise<ApSettingsRow> {
  const supabase = await createClient();
  const settings = unwrapRead(
    await supabase.from("ap_settings").select("*").eq("id", true).maybeSingle(),
    "the form settings",
  );
  // The migration seeds the singleton; the fallback only covers a missing row.
  return (
    settings ?? {
      id: true,
      is_open: false,
      intro_copy: "",
      confirmation_copy: "",
      enabled_partnership_types: [],
      google_appointments_url: null,
      updated_at: "",
      updated_by: null,
    }
  );
}

export async function listEmailTemplates(): Promise<ApEmailTemplateRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase.from("ap_email_templates").select("*").order("key"),
      "the email templates",
    ) ?? []
  );
}

export async function getEmailTemplate(key: string): Promise<ApEmailTemplateRow | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("ap_email_templates").select("*").eq("key", key).maybeSingle(),
    "this email template",
  );
}
