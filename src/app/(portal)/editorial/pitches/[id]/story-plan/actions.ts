"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertEditorialRole } from "@/lib/editorial/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { getStoryPlan, listStoryPlanMilestones, unwrapRead } from "@/lib/editorial/data";
import {
  canTransitionStoryPlanStatus,
  OTR_STATUSES,
  STANDARDS_FLAGS,
} from "@/lib/editorial/story-plan";
import { logAuditEvent } from "@/lib/audit";
import type { EpOtrStatus, EpStandardsFlag, EpStoryPlanStatus } from "@/lib/database.types";

const STORY_PLAN_STATUSES: EpStoryPlanStatus[] = ["draft", "ready_for_editor", "approved"];

function planPath(pitchId: string): string {
  return `/editorial/pitches/${pitchId}/story-plan`;
}

/** Whether the caller may write this pitch's story plan: an editor, or the reporter it's assigned to. */
async function assertCanManagePlan(
  pitchId: string,
): Promise<{ profileId: string; isEditor: boolean }> {
  const { profile, role } = await assertEditorialRole("contributor");
  if (role === "editor") return { profileId: profile.id, isEditor: true };

  const supabase = await createClient();
  const pitch = unwrapRead(
    await supabase.from("ep_pitches").select("assigned_to, status").eq("id", pitchId).maybeSingle(),
    "the pitch",
  );
  if (!pitch || pitch.assigned_to !== profile.id || pitch.status !== "assigned") {
    failWith(
      `/editorial/pitches/${pitchId}`,
      "Only the assigned reporter or an editor can manage this story plan.",
    );
  }
  return { profileId: profile.id, isEditor: false };
}

export async function createStoryPlan(formData: FormData): Promise<void> {
  const pitchId = String(formData.get("pitch_id") ?? "");
  const { profileId, isEditor } = await assertCanManagePlan(pitchId);

  const supabase = await createClient();
  const pitch = unwrapRead(
    await supabase.from("ep_pitches").select("assigned_to").eq("id", pitchId).maybeSingle(),
    "the pitch",
  );
  const reporterId = pitch?.assigned_to ?? (isEditor ? null : profileId);

  const { data: created, error } = await supabase
    .from("ep_story_plans")
    .insert({
      pitch_id: pitchId,
      reporter_id: reporterId,
      created_by: profileId,
      central_question: String(formData.get("seed_question") ?? "").trim() || null,
    })
    .select("id")
    .single();
  failIfError(error, `/editorial/pitches/${pitchId}`, "Could not start the story plan");
  if (!created) failWith(`/editorial/pitches/${pitchId}`, "Could not start the story plan.");

  await logAuditEvent({
    actorId: profileId,
    action: "ep.story_plan.created",
    targetType: "ep_story_plan",
    targetId: created.id,
    metadata: { pitch_id: pitchId },
  });

  redirect(planPath(pitchId));
}

const TEXT_FIELDS = [
  "central_question",
  "public_service_value",
  "frame_scope",
  "deliverables",
  "reporting_evidence_map",
  "people_affected",
  "decision_makers",
  "expert_experiential_sources",
  "main_interpretations",
  "missing_perspective_assessment",
  "source_concentration_risks",
  "framing_risks",
  "key_claims_to_verify",
  "records_data_needed",
  "otr_requirements",
  "target_window",
] as const;

export async function updateStoryPlan(formData: FormData): Promise<void> {
  const pitchId = String(formData.get("pitch_id") ?? "");
  const storyPlanId = String(formData.get("story_plan_id") ?? "");
  await assertCanManagePlan(pitchId);

  const otrStatusRaw = String(formData.get("otr_status") ?? "not_yet_sought");
  const otrStatus: EpOtrStatus = OTR_STATUSES.includes(otrStatusRaw as EpOtrStatus)
    ? (otrStatusRaw as EpOtrStatus)
    : "not_yet_sought";
  const standardsFlags = formData
    .getAll("standards_flags")
    .map(String)
    .filter((flag): flag is EpStandardsFlag => STANDARDS_FLAGS.includes(flag as EpStandardsFlag));

  const update: Record<string, string | null> = { otr_status: otrStatus };
  for (const field of TEXT_FIELDS) {
    update[field] = String(formData.get(field) ?? "").trim() || null;
  }

  const reporterId = String(formData.get("reporter_id") ?? "") || null;
  const editorId = String(formData.get("editor_id") ?? "") || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("ep_story_plans")
    .update({
      ...update,
      standards_flags: standardsFlags,
      reporter_id: reporterId,
      editor_id: editorId,
    })
    .eq("id", storyPlanId);
  failIfError(error, planPath(pitchId), "Could not save the story plan");

  redirect(planPath(pitchId));
}

export async function transitionStoryPlanStatus(formData: FormData): Promise<void> {
  const pitchId = String(formData.get("pitch_id") ?? "");
  const storyPlanId = String(formData.get("story_plan_id") ?? "");
  const toRaw = String(formData.get("to") ?? "");
  const { profile, role } = await assertEditorialRole("contributor");

  if (!STORY_PLAN_STATUSES.includes(toRaw as EpStoryPlanStatus)) redirect(planPath(pitchId));
  const to = toRaw as EpStoryPlanStatus;

  const plan = await getStoryPlan(pitchId);
  if (!plan || plan.id !== storyPlanId) redirect(planPath(pitchId));

  const isEditor = role === "editor";
  if (!isEditor && plan.reporter_id !== profile.id) {
    failWith(
      planPath(pitchId),
      "Only the assigned reporter or an editor can change this plan's status.",
    );
  }
  if (!canTransitionStoryPlanStatus(plan.status, to, isEditor ? "editor" : "reporter")) {
    failWith(planPath(pitchId), `Cannot move this plan from ${plan.status} to ${to}.`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ep_story_plans")
    .update({ status: to })
    .eq("id", storyPlanId);
  failIfError(error, planPath(pitchId), "Could not update the story plan's status");

  await logAuditEvent({
    actorId: profile.id,
    action: "ep.story_plan.status_changed",
    targetType: "ep_story_plan",
    targetId: storyPlanId,
    metadata: { pitch_id: pitchId, from: plan.status, to },
  });

  redirect(planPath(pitchId));
}

export async function addMilestone(formData: FormData): Promise<void> {
  const pitchId = String(formData.get("pitch_id") ?? "");
  const storyPlanId = String(formData.get("story_plan_id") ?? "");
  await assertCanManagePlan(pitchId);

  const label = String(formData.get("label") ?? "").trim();
  const targetDate = String(formData.get("target_date") ?? "").trim() || null;
  if (!label) failWith(planPath(pitchId), "Give the milestone a label.");

  const existing = await listStoryPlanMilestones(storyPlanId);
  const sortOrder = Math.max(0, ...existing.map((m) => m.sort_order)) + 1;

  const supabase = await createClient();
  const { error } = await supabase
    .from("ep_story_plan_milestones")
    .insert({ story_plan_id: storyPlanId, label, target_date: targetDate, sort_order: sortOrder });
  failIfError(error, planPath(pitchId), "Could not add the milestone");

  redirect(planPath(pitchId));
}

export async function toggleMilestone(formData: FormData): Promise<void> {
  const pitchId = String(formData.get("pitch_id") ?? "");
  await assertCanManagePlan(pitchId);
  const milestoneId = String(formData.get("milestone_id") ?? "");
  const nextCompleted = String(formData.get("next_completed") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("ep_story_plan_milestones")
    .update({ completed: nextCompleted })
    .eq("id", milestoneId);
  failIfError(error, planPath(pitchId), "Could not update the milestone");

  redirect(planPath(pitchId));
}

export async function deleteMilestone(formData: FormData): Promise<void> {
  const pitchId = String(formData.get("pitch_id") ?? "");
  await assertCanManagePlan(pitchId);
  const milestoneId = String(formData.get("milestone_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("ep_story_plan_milestones").delete().eq("id", milestoneId);
  failIfError(error, planPath(pitchId), "Could not remove the milestone");

  redirect(planPath(pitchId));
}
