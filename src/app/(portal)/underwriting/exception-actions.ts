"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import type { UwComplianceJudgment, UwResolutionAction, UwResolutionStatus } from "@/lib/database.types";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

function exceptionPath(id: string): string {
  return `/underwriting/exceptions/${id}`;
}

const COMPLIANCE_JUDGMENTS: UwComplianceJudgment[] = ["compliant", "noncompliant", "pending"];
const RESOLUTION_STATUSES: UwResolutionStatus[] = ["open", "resolved"];
const RESOLUTION_ACTIONS: UwResolutionAction[] = [
  "accept_alternate",
  "schedule_makegood",
  "reassign",
  "waive",
  "clarification_requested",
  "corrected",
  "closed",
];

/**
 * Updates an exception's triage state. Setting resolution_action to 'waive'
 * only ever succeeds for a manager — enforced by
 * uw_guard_exception_resolution() (the migration's before-update trigger),
 * not this action, so the boundary holds no matter how this table is ever
 * written. A successful waive is audited per docs/underwriting-design.md
 * §6's four privileged actions; every other resolution is ordinary triage
 * and stays off the audit log, the same distinction Roadmap draws between
 * filing a post (ordinary) and curating one (audited).
 */
export async function resolveException(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const id = field(formData, "exception_id");
  const path = exceptionPath(id);

  const complianceJudgment = field(formData, "compliance_judgment") as UwComplianceJudgment;
  if (!COMPLIANCE_JUDGMENTS.includes(complianceJudgment)) {
    failWith(path, "That is not a recognized compliance judgment.");
  }

  const resolutionStatus = field(formData, "resolution_status") as UwResolutionStatus;
  if (!RESOLUTION_STATUSES.includes(resolutionStatus)) {
    failWith(path, "That is not a recognized resolution status.");
  }

  const resolutionActionRaw = optionalField(formData, "resolution_action");
  const resolutionAction = resolutionActionRaw as UwResolutionAction | null;
  if (resolutionAction !== null && !RESOLUTION_ACTIONS.includes(resolutionAction)) {
    failWith(path, "That is not a recognized resolution action.");
  }

  const resolved = resolutionStatus === "resolved";

  const supabase = await createClient();

  // Read the prior value first: only a genuine transition into 'waive' is
  // the privileged action — re-saving an already-waived exception (e.g.
  // editing just the notes) must not re-log the waiver against whoever
  // happened to click Save this time.
  const { data: existing } = await supabase
    .from("uw_exceptions")
    .select("resolution_action")
    .eq("id", id)
    .maybeSingle();
  const isNewWaiver = resolutionAction === "waive" && existing?.resolution_action !== "waive";

  const { error } = await supabase
    .from("uw_exceptions")
    .update({
      compliance_judgment: complianceJudgment,
      recommended_action: optionalField(formData, "recommended_action"),
      resolution_action: resolutionAction,
      resolution_notes: optionalField(formData, "resolution_notes"),
      resolution_status: resolutionStatus,
      resolved_by: resolved ? profile.id : null,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq("id", id);
  failIfError(error, path, "Could not update this exception");

  if (isNewWaiver) {
    await logAuditEvent({
      actorId: profile.id,
      action: "underwriting.exception.waived",
      targetType: "uw_exception",
      targetId: id,
    });
  }

  revalidatePath(path);
  revalidatePath("/underwriting/exceptions");
  redirect(path);
}
