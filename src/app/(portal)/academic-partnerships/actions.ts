"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  assertAcademicPartnershipsAccess,
  assertAcademicPartnershipsCoordinator,
} from "@/lib/academic-partnerships/access";
import { logSubmissionEvent } from "@/lib/academic-partnerships/activity";
import { logAuditEvent } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import {
  DISPOSITION_LABEL,
  DISPOSITIONS,
  STAGES,
  STAGE_LABEL,
  validateDispositionInput,
} from "@/lib/academic-partnerships/pipeline";
import type {
  ApCapacity,
  ApDisposition,
  ApFit,
  ApStage,
  ApTiming,
} from "@/lib/database.types";

const LIST_PATH = "/academic-partnerships";

function detailPath(id: string): string {
  return `${LIST_PATH}/${id}`;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

/**
 * Called directly from the kanban board's drag handler and its
 * keyboard-accessible "Move to…" select — not a <form action>, because the
 * board is already a client component (dnd-kit requires it) and a full page
 * navigation on every drop would defeat the point. Returns rather than
 * redirects so the client can update optimistically and roll back on error.
 */
export async function setSubmissionStage(
  submissionId: string,
  stage: ApStage,
): Promise<{ error?: string }> {
  const { profile } = await assertAcademicPartnershipsAccess();
  if (!STAGES.includes(stage)) return { error: "That is not a stage a submission can be in." };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("ap_submissions")
    .select("stage")
    .eq("id", submissionId)
    .maybeSingle();

  const { error } = await supabase
    .from("ap_submissions")
    .update({ stage, disposition: null, disposition_reason: null, disposition_by: null, disposition_at: null })
    .eq("id", submissionId);
  if (error) {
    console.error("Could not change stage", error);
    return { error: "Could not move this submission. Please try again." };
  }

  await logSubmissionEvent({
    submissionId,
    actorId: profile.id,
    eventType: "stage_changed",
    note: `Moved to ${STAGE_LABEL[stage]}.`,
    metadata: { from_stage: before?.stage ?? null, to_stage: stage },
  });
  await logAuditEvent({
    actorId: profile.id,
    action: "ap.submission.stage_changed",
    targetType: "ap_submission",
    targetId: submissionId,
    metadata: { stage },
  });

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/all`);
  revalidatePath(detailPath(submissionId));
  return {};
}

/** Form-based wrapper around setSubmissionStage(), for the detail screen's stage <select>. */
export async function setStageForm(formData: FormData): Promise<void> {
  const submissionId = field(formData, "submission_id");
  const stage = field(formData, "stage") as ApStage;
  const result = await setSubmissionStage(submissionId, stage);
  if (result.error) failWith(detailPath(submissionId), result.error);
  redirect(detailPath(submissionId));
}

export async function assignOwner(formData: FormData): Promise<void> {
  const { profile } = await assertAcademicPartnershipsAccess();
  const submissionId = field(formData, "submission_id");
  const path = detailPath(submissionId);
  const ownerId = optionalField(formData, "owner_id");

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("ap_submissions")
    .select("owner_id")
    .eq("id", submissionId)
    .maybeSingle();

  const { error } = await supabase
    .from("ap_submissions")
    .update({ owner_id: ownerId })
    .eq("id", submissionId);
  failIfError(error, path, "Could not change the owner");

  const names = await ownerNames([before?.owner_id ?? null, ownerId]);
  await logSubmissionEvent({
    submissionId,
    actorId: profile.id,
    eventType: "owner_changed",
    note: ownerId
      ? `Assigned to ${names.get(ownerId) ?? "a colleague"}.`
      : "Unassigned.",
    metadata: { from_owner: before?.owner_id ?? null, to_owner: ownerId },
  });
  await logAuditEvent({
    actorId: profile.id,
    action: "ap.submission.owner_changed",
    targetType: "ap_submission",
    targetId: submissionId,
    metadata: { owner_id: ownerId },
  });

  revalidatePath(LIST_PATH);
  redirect(path);
}

async function ownerNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, display_name").in("id", unique);
  return new Map((data ?? []).map((row) => [row.id, row.display_name]));
}

export async function addNote(formData: FormData): Promise<void> {
  const { profile } = await assertAcademicPartnershipsAccess();
  const submissionId = field(formData, "submission_id");
  const path = detailPath(submissionId);
  const note = field(formData, "note");
  if (note === "") failWith(path, "Write something before adding a note.");

  await logSubmissionEvent({ submissionId, actorId: profile.id, eventType: "note", note });
  redirect(path);
}

export async function updateAssessment(formData: FormData): Promise<void> {
  const { profile } = await assertAcademicPartnershipsAccess();
  const submissionId = field(formData, "submission_id");
  const path = detailPath(submissionId);

  const fit = (optionalField(formData, "fit") as ApFit | null) ?? null;
  const capacity = (optionalField(formData, "capacity") as ApCapacity | null) ?? null;
  const timing = (optionalField(formData, "timing") as ApTiming | null) ?? null;
  const primaryFunction = optionalField(formData, "primary_function");
  const potentialStaffLead = optionalField(formData, "potential_staff_lead");
  const keyConsiderations = optionalField(formData, "key_considerations");

  const supabase = await createClient();
  const { error } = await supabase
    .from("ap_submissions")
    .update({
      fit,
      capacity,
      timing,
      primary_function: primaryFunction,
      potential_staff_lead: potentialStaffLead,
      key_considerations: keyConsiderations,
    })
    .eq("id", submissionId);
  failIfError(error, path, "Could not save the assessment");

  await logSubmissionEvent({
    submissionId,
    actorId: profile.id,
    eventType: "assessment_updated",
    metadata: { fit, capacity, timing },
  });

  revalidatePath(LIST_PATH);
  redirect(path);
}

export async function setNextAction(formData: FormData): Promise<void> {
  const { profile } = await assertAcademicPartnershipsAccess();
  const submissionId = field(formData, "submission_id");
  const path = detailPath(submissionId);
  const nextAction = optionalField(formData, "next_action");
  const nextActionDate = optionalField(formData, "next_action_date");

  const supabase = await createClient();
  const { error } = await supabase
    .from("ap_submissions")
    .update({ next_action: nextAction, next_action_date: nextActionDate })
    .eq("id", submissionId);
  failIfError(error, path, "Could not save the next action");

  await logSubmissionEvent({
    submissionId,
    actorId: profile.id,
    eventType: "next_action_updated",
    note: nextAction ?? undefined,
    metadata: { next_action_date: nextActionDate },
  });

  revalidatePath(LIST_PATH);
  redirect(path);
}

export async function setDisposition(formData: FormData): Promise<void> {
  const { profile } = await assertAcademicPartnershipsAccess();
  const submissionId = field(formData, "submission_id");
  const path = detailPath(submissionId);
  const dispositionRaw = field(formData, "disposition");
  if (!DISPOSITIONS.includes(dispositionRaw as ApDisposition)) {
    failWith(path, "That is not a disposition a submission can have.");
  }
  const disposition = dispositionRaw as ApDisposition;
  const reason = field(formData, "reason");

  const problem = validateDispositionInput(disposition, reason);
  if (problem) failWith(path, problem);

  const supabase = await createClient();
  const { error } = await supabase
    .from("ap_submissions")
    .update({
      disposition,
      disposition_reason: reason || null,
      disposition_by: profile.id,
      disposition_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
  failIfError(error, path, "Could not update the disposition");

  await logSubmissionEvent({
    submissionId,
    actorId: profile.id,
    eventType: "disposition_changed",
    note: `${DISPOSITION_LABEL[disposition]}${reason ? `: ${reason}` : ""}`,
    metadata: { disposition, reason },
  });
  await logAuditEvent({
    actorId: profile.id,
    action: "ap.submission.disposition_changed",
    targetType: "ap_submission",
    targetId: submissionId,
    metadata: { disposition },
  });

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/all`);
  redirect(path);
}

/** Reopens a closed submission back into the active pipeline, at its last stage. */
export async function reopenSubmission(formData: FormData): Promise<void> {
  const { profile } = await assertAcademicPartnershipsAccess();
  const submissionId = field(formData, "submission_id");
  const path = detailPath(submissionId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("ap_submissions")
    .update({ disposition: null, disposition_reason: null, disposition_by: null, disposition_at: null })
    .eq("id", submissionId);
  failIfError(error, path, "Could not reopen this submission");

  await logSubmissionEvent({
    submissionId,
    actorId: profile.id,
    eventType: "disposition_changed",
    note: "Reopened.",
    metadata: { disposition: null },
  });

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/all`);
  redirect(path);
}

/**
 * Permanently deletes an inquiry — unlike a disposition (Deferred/Declined/
 * Withdrawn/Archived), which pulls a submission out of the active pipeline
 * while keeping its record, this removes the row and its activity log for
 * good (ap_submission_events cascades via its foreign key). Coordinator-only
 * (see the delete migration's comment) since it can't be undone; the button
 * that calls this is also gated on isCoordinator, but that's a courtesy —
 * ap_submissions_delete's RLS policy is the actual boundary.
 */
export async function deleteSubmission(formData: FormData): Promise<void> {
  const { profile } = await assertAcademicPartnershipsCoordinator();
  const submissionId = field(formData, "submission_id");

  const supabase = await createClient();
  const { data: submission } = await supabase
    .from("ap_submissions")
    .select("faculty_name")
    .eq("id", submissionId)
    .maybeSingle();

  const { error } = await supabase.from("ap_submissions").delete().eq("id", submissionId);
  failIfError(error, detailPath(submissionId), "Could not delete this submission");

  await logAuditEvent({
    actorId: profile.id,
    action: "ap.submission.deleted",
    targetType: "ap_submission",
    targetId: submissionId,
    metadata: { faculty_name: submission?.faculty_name ?? null },
  });

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/all`);
  redirect(LIST_PATH);
}

/**
 * The activity-log/audit/stage-transition tail shared by both email
 * actions below — the only difference between "I sent this email" (a
 * manual confirmation) and "Send email" (an actual Resend send) is how the
 * email itself left this system; what gets recorded afterward is identical.
 */
async function afterEmailAction(params: {
  profileId: string;
  submissionId: string;
  templateKey: string;
  auditAction: string;
  moveToMeetingRequested: boolean;
  appointmentLinkShared: boolean;
}): Promise<void> {
  await logAuditEvent({
    actorId: params.profileId,
    action: params.auditAction,
    targetType: "ap_submission",
    targetId: params.submissionId,
    metadata: { template_key: params.templateKey },
  });

  if (params.templateKey === "meeting_invite" && params.moveToMeetingRequested) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("ap_submissions")
      .update({ stage: "meeting_requested", disposition: null })
      .eq("id", params.submissionId);
    if (!error) {
      await logSubmissionEvent({
        submissionId: params.submissionId,
        actorId: params.profileId,
        eventType: "stage_changed",
        note: `Moved to ${STAGE_LABEL.meeting_requested}.`,
        metadata: { to_stage: "meeting_requested" },
      });
    }
  }

  if (params.templateKey === "meeting_invite" && params.appointmentLinkShared) {
    await logSubmissionEvent({
      submissionId: params.submissionId,
      actorId: params.profileId,
      eventType: "appointment_shared",
      note: "Included the Google Appointments link.",
    });
  }
}

/**
 * Records that a staff member prepared and confirmed sending an email
 * manually (a mailto: draft or a copied-and-pasted message) — never that it
 * was delivered, since this system has no visibility into what happened
 * after the draft left it. The counterpart to sendInquiryEmail() below, for
 * when Resend isn't configured or a coordinator wants manual control (CC'ing
 * someone, personalizing beyond the template). Optionally offers (and, if
 * checked, performs) the Meeting Requested stage transition — the brief's
 * "when this action is completed, move or offer to move the record to
 * Meeting Requested."
 */
export async function recordEmailAction(formData: FormData): Promise<void> {
  const { profile } = await assertAcademicPartnershipsAccess();
  const submissionId = field(formData, "submission_id");
  const path = detailPath(submissionId);
  const templateKey = field(formData, "template_key");
  const templateLabel = field(formData, "template_label");

  await logSubmissionEvent({
    submissionId,
    actorId: profile.id,
    eventType: "email_action",
    note: `Prepared and confirmed sending "${templateLabel}".`,
    metadata: { template_key: templateKey },
  });
  await afterEmailAction({
    profileId: profile.id,
    submissionId,
    templateKey,
    auditAction: "ap.submission.email_prepared",
    moveToMeetingRequested: formData.get("move_to_meeting_requested") === "on",
    appointmentLinkShared: formData.get("appointment_link_shared") === "on",
  });

  revalidatePath(LIST_PATH);
  redirect(path);
}

/**
 * Actually sends the email via Resend (lib/email.ts) — the real counterpart
 * to recordEmailAction()'s manual confirmation. Only reachable from the UI
 * when isEmailSendingConfigured() is true; the form still validates on the
 * server regardless; a send failure bounces back with the reason rather than
 * silently recording success.
 */
export async function sendInquiryEmail(formData: FormData): Promise<void> {
  const { profile } = await assertAcademicPartnershipsAccess();
  const submissionId = field(formData, "submission_id");
  const path = detailPath(submissionId);
  const to = field(formData, "to");
  const subject = field(formData, "subject");
  const body = field(formData, "body");
  const templateKey = field(formData, "template_key");
  const templateLabel = field(formData, "template_label");

  const result = await sendEmail({ to, subject, text: body, replyTo: profile.email });
  if (!result.ok) {
    failWith(path, `Could not send the email: ${result.error}`);
  }

  await logSubmissionEvent({
    submissionId,
    actorId: profile.id,
    eventType: "email_action",
    note: `Sent "${templateLabel}" to ${to}.`,
    metadata: { template_key: templateKey, delivery: "sent" },
  });
  await afterEmailAction({
    profileId: profile.id,
    submissionId,
    templateKey,
    auditAction: "ap.submission.email_sent",
    moveToMeetingRequested: formData.get("move_to_meeting_requested") === "on",
    appointmentLinkShared: formData.get("appointment_link_shared") === "on",
  });

  revalidatePath(LIST_PATH);
  redirect(path);
}
