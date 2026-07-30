"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertEditorialRole } from "@/lib/editorial/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import {
  getDefaultRubricProfile,
  getSettings,
  listCriteria,
  listRubricProfiles,
  unwrapRead,
} from "@/lib/editorial/data";
import { validateReviewScores, type CriterionDef } from "@/lib/editorial/scoring";
import { CONCERN_FLAGS, RECOMMENDATIONS } from "@/lib/editorial/review";
import { logAuditEvent } from "@/lib/audit";
import type { EpConcernFlag, EpDecisionOutcome, EpRecommendation } from "@/lib/database.types";

const MEETINGS_PATH = "/editorial/meetings";

async function getMeeting(
  meetingId: string,
): Promise<{ status: string; rubric_profile_id: string } | null> {
  const supabase = await createClient();
  const data = unwrapRead(
    await supabase
      .from("ep_meetings")
      .select("status, rubric_profile_id")
      .eq("id", meetingId)
      .maybeSingle(),
    "the meeting",
  );
  return data ?? null;
}

export async function createMeeting(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const meetingDate = String(formData.get("meeting_date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) {
    failWith(MEETINGS_PATH, "Pick a meeting date.");
  }

  const requestedProfileId = String(formData.get("rubric_profile_id") ?? "") || null;
  const profiles = await listRubricProfiles({ activeOnly: true });
  const profile = requestedProfileId
    ? (profiles.find((p) => p.id === requestedProfileId) ?? null)
    : await getDefaultRubricProfile();
  if (!profile) failWith(MEETINGS_PATH, "No active rubric profile is configured.");

  const supabase = await createClient();
  const { data: meeting, error } = await supabase
    .from("ep_meetings")
    .insert({
      meeting_date: meetingDate,
      created_by: editor.profile.id,
      rubric_profile_id: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, MEETINGS_PATH, "Could not create the meeting");
  if (!meeting) failWith(MEETINGS_PATH, "Could not create the meeting — no row was created.");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.meeting.created",
    targetType: "ep_meeting",
    targetId: meeting.id,
    metadata: { meeting_date: meetingDate, rubric_profile_id: profile.id },
  });

  redirect(`${MEETINGS_PATH}/${meeting.id}`);
}

export async function addPitchToSlate(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const meetingId = String(formData.get("meeting_id") ?? "");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;
  const pitchId = String(formData.get("pitch_id") ?? "");
  if ((await getMeeting(meetingId))?.status !== "open") redirect(meetingPath);

  const supabase = await createClient();
  // ignoreDuplicates makes a double-add (two editors, same pitch) a real no-op
  // against the (meeting_id, pitch_id) unique constraint rather than an error.
  const { error } = await supabase
    .from("ep_meeting_pitches")
    .upsert(
      { meeting_id: meetingId, pitch_id: pitchId, added_by: editor.profile.id },
      { onConflict: "meeting_id,pitch_id", ignoreDuplicates: true },
    );
  failIfError(error, meetingPath, "Could not add the pitch to the slate");

  redirect(meetingPath);
}

export async function removePitchFromSlate(formData: FormData): Promise<void> {
  await assertEditorialRole("editor");
  const meetingId = String(formData.get("meeting_id") ?? "");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;
  const entryId = String(formData.get("entry_id") ?? "");
  if ((await getMeeting(meetingId))?.status !== "open") redirect(meetingPath);

  const supabase = await createClient();
  const { error } = await supabase
    .from("ep_meeting_pitches")
    .delete()
    .eq("id", entryId)
    .eq("meeting_id", meetingId);
  failIfError(error, meetingPath, "Could not remove the pitch from the slate");

  redirect(meetingPath);
}

/**
 * Upsert the caller's review of one slate item: per-criterion scores plus an
 * optional comment, atomic per reviewer. Scores snapshot the criterion weight
 * and the scale in force right now (see design §4.2). RLS additionally
 * guarantees this only works on the reviewer's own review while the meeting
 * is open.
 */
export async function submitReview(formData: FormData): Promise<void> {
  const reviewer = await assertEditorialRole("reviewer");
  const meetingId = String(formData.get("meeting_id") ?? "");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;
  const entryId = String(formData.get("entry_id") ?? "");
  const meeting = await getMeeting(meetingId);
  if (meeting?.status !== "open") redirect(meetingPath);

  const [criteria, settings] = await Promise.all([
    listCriteria({ activeOnly: true, profileId: meeting.rubric_profile_id }),
    getSettings(),
  ]);
  const raw: Record<string, string | undefined> = {};
  for (const criterion of criteria) {
    const value = formData.get(`score_${criterion.id}`);
    raw[criterion.id] = value === null ? undefined : String(value);
  }
  const criterionDefs: CriterionDef[] = criteria.map((criterion) => ({
    id: criterion.id,
    criterionType: criterion.criterion_type,
    scaleMin: criterion.scale_min,
    scaleMax: criterion.scale_max,
  }));
  const { scores, error } = validateReviewScores(criterionDefs, raw, {
    min: settings.scale_min,
    max: settings.scale_max,
  });
  if (error) failWith(meetingPath, error);

  const recommendationRaw = String(formData.get("recommendation") ?? "");
  if (!RECOMMENDATIONS.includes(recommendationRaw as EpRecommendation)) {
    failWith(meetingPath, "Pick a recommendation before saving your review.");
  }
  const recommendation = recommendationRaw as EpRecommendation;

  const concernFlags = formData
    .getAll("concern_flags")
    .map(String)
    .filter((flag): flag is EpConcernFlag => CONCERN_FLAGS.includes(flag as EpConcernFlag));

  const comment = String(formData.get("comment") ?? "").trim() || null;
  const criterionById = new Map(criteria.map((criterion) => [criterion.id, criterion]));

  const supabase = await createClient();
  const { data: review, error: reviewError } = await supabase
    .from("ep_reviews")
    .upsert(
      {
        meeting_pitch_id: entryId,
        reviewer_id: reviewer.profile.id,
        comment,
        recommendation,
        concern_flags: concernFlags,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "meeting_pitch_id,reviewer_id" },
    )
    .select("id")
    .single();
  failIfError(reviewError, meetingPath, "Could not save your review");
  if (!review) failWith(meetingPath, "Could not save your review — no row was written.");

  const { error: clearError } = await supabase
    .from("ep_review_scores")
    .delete()
    .eq("review_id", review.id);
  failIfError(clearError, meetingPath, "Could not save your review");

  if (scores.length > 0) {
    const { error: scoreError } = await supabase.from("ep_review_scores").insert(
      scores.map(({ criterionId, score }) => {
        const criterion = criterionById.get(criterionId);
        return {
          review_id: review.id,
          criterion_id: criterionId,
          score,
          weight_snapshot: criterion?.weight ?? 1,
          scale_snapshot: criterion?.scale_max ?? settings.scale_max,
          scale_min_snapshot: criterion?.scale_min ?? settings.scale_min,
        };
      }),
    );
    failIfError(scoreError, meetingPath, "Could not save your scores");
  }

  redirect(meetingPath);
}

/** open -> agenda: scoring locks, scores unlock for everyone, ranking appears. */
export async function closeScoring(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const meetingId = String(formData.get("meeting_id") ?? "");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;

  const supabase = await createClient();
  const { error } = await supabase
    .from("ep_meetings")
    .update({ status: "agenda", agenda_at: new Date().toISOString() })
    .eq("id", meetingId)
    .eq("status", "open");
  failIfError(error, meetingPath, "Could not close scoring");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.meeting.scoring_closed",
    targetType: "ep_meeting",
    targetId: meetingId,
  });

  redirect(meetingPath);
}

const OUTCOMES: EpDecisionOutcome[] = ["assigned", "deferred", "archived"];

/**
 * Record the editorial decision for one slate item and move the pitch
 * accordingly. Decisions can be revised while the meeting stays in agenda;
 * each write fully determines the pitch's resulting state.
 */
export async function recordDecision(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const meetingId = String(formData.get("meeting_id") ?? "");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;
  const entryId = String(formData.get("entry_id") ?? "");
  const outcomeRaw = String(formData.get("outcome") ?? "");
  const assignedTo = String(formData.get("assigned_to") ?? "") || null;
  const rationale = String(formData.get("rationale") ?? "").trim() || null;

  if (!OUTCOMES.includes(outcomeRaw as EpDecisionOutcome)) redirect(meetingPath);
  const outcome = outcomeRaw as EpDecisionOutcome;
  if (outcome === "assigned" && !assignedTo) {
    failWith(meetingPath, "Pick who the story is assigned to.");
  }
  if ((await getMeeting(meetingId))?.status !== "agenda") redirect(meetingPath);

  const supabase = await createClient();
  const entry = unwrapRead(
    await supabase
      .from("ep_meeting_pitches")
      .select("id, pitch_id")
      .eq("id", entryId)
      .eq("meeting_id", meetingId)
      .maybeSingle(),
    "the slate item",
  );
  if (!entry) redirect(meetingPath);

  const now = new Date().toISOString();
  const { error: decisionError } = await supabase
    .from("ep_meeting_pitches")
    .update({
      outcome,
      assigned_to: outcome === "assigned" ? assignedTo : null,
      rationale,
      decided_by: editor.profile.id,
      decided_at: now,
    })
    .eq("id", entryId);
  failIfError(decisionError, meetingPath, "Could not record the decision");

  const pitchUpdate =
    outcome === "assigned"
      ? { status: "assigned" as const, assigned_to: assignedTo }
      : outcome === "archived"
        ? {
            status: "archived" as const,
            assigned_to: null,
            archived_reason: rationale,
            archived_by: editor.profile.id,
            archived_at: now,
          }
        : {
            status: "open" as const,
            assigned_to: null,
            archived_reason: null,
            archived_by: null,
            archived_at: null,
          };
  const { error: pitchError } = await supabase
    .from("ep_pitches")
    .update(pitchUpdate)
    .eq("id", entry.pitch_id);
  failIfError(pitchError, meetingPath, "Recorded the decision but could not update the pitch");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: `ep.pitch.${outcome === "assigned" ? "assigned" : outcome === "archived" ? "archived" : "deferred"}`,
    targetType: "ep_pitch",
    targetId: entry.pitch_id,
    metadata: {
      meeting_id: meetingId,
      ...(outcome === "assigned" && assignedTo ? { assigned_to: assignedTo } : {}),
      ...(rationale ? { rationale } : {}),
    },
  });

  redirect(meetingPath);
}

/** agenda -> concluded: anything undecided is recorded as deferred. */
export async function concludeMeeting(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const meetingId = String(formData.get("meeting_id") ?? "");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;
  if ((await getMeeting(meetingId))?.status !== "agenda") redirect(meetingPath);

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error: deferError } = await supabase
    .from("ep_meeting_pitches")
    .update({ outcome: "deferred", decided_by: editor.profile.id, decided_at: now })
    .eq("meeting_id", meetingId)
    .is("outcome", null);
  failIfError(deferError, meetingPath, "Could not defer the undecided pitches");

  const { error } = await supabase
    .from("ep_meetings")
    .update({ status: "concluded", concluded_at: now })
    .eq("id", meetingId)
    .eq("status", "agenda");
  failIfError(error, meetingPath, "Could not conclude the meeting");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.meeting.concluded",
    targetType: "ep_meeting",
    targetId: meetingId,
  });

  redirect(meetingPath);
}

export async function updateMeetingNotes(formData: FormData): Promise<void> {
  await assertEditorialRole("editor");
  const meetingId = String(formData.get("meeting_id") ?? "");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from("ep_meetings").update({ notes }).eq("id", meetingId);
  failIfError(error, meetingPath, "Could not save the notes");

  redirect(meetingPath);
}
