"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertEditorialRole } from "@/lib/editorial/access";
import { getSettings, listCriteria } from "@/lib/editorial/data";
import { validateReviewScores } from "@/lib/editorial/scoring";
import { logAuditEvent } from "@/lib/audit";
import type { EpDecisionOutcome } from "@/lib/database.types";

async function getMeetingStatus(meetingId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ep_meetings")
    .select("status")
    .eq("id", meetingId)
    .maybeSingle();
  return data?.status ?? null;
}

export async function createMeeting(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const meetingDate = String(formData.get("meeting_date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) {
    redirect("/editorial/meetings?error=" + encodeURIComponent("Pick a meeting date."));
  }

  const supabase = await createClient();
  const { data: meeting, error } = await supabase
    .from("ep_meetings")
    .insert({ meeting_date: meetingDate, created_by: editor.profile.id })
    .select("id")
    .single();
  if (error || !meeting) {
    redirect("/editorial/meetings?error=" + encodeURIComponent("Could not create the meeting."));
  }

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.meeting.created",
    targetType: "ep_meeting",
    targetId: meeting.id,
    metadata: { meeting_date: meetingDate },
  });

  redirect(`/editorial/meetings/${meeting.id}`);
}

export async function addPitchToSlate(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const meetingId = String(formData.get("meeting_id") ?? "");
  const pitchId = String(formData.get("pitch_id") ?? "");
  if ((await getMeetingStatus(meetingId)) !== "open") redirect(`/editorial/meetings/${meetingId}`);

  const supabase = await createClient();
  // The (meeting_id, pitch_id) unique constraint makes double-adds a no-op.
  await supabase
    .from("ep_meeting_pitches")
    .insert({ meeting_id: meetingId, pitch_id: pitchId, added_by: editor.profile.id });

  redirect(`/editorial/meetings/${meetingId}`);
}

export async function removePitchFromSlate(formData: FormData): Promise<void> {
  await assertEditorialRole("editor");
  const meetingId = String(formData.get("meeting_id") ?? "");
  const entryId = String(formData.get("entry_id") ?? "");
  if ((await getMeetingStatus(meetingId)) !== "open") redirect(`/editorial/meetings/${meetingId}`);

  const supabase = await createClient();
  await supabase.from("ep_meeting_pitches").delete().eq("id", entryId).eq("meeting_id", meetingId);

  redirect(`/editorial/meetings/${meetingId}`);
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
  const entryId = String(formData.get("entry_id") ?? "");
  if ((await getMeetingStatus(meetingId)) !== "open") redirect(`/editorial/meetings/${meetingId}`);

  const [criteria, settings] = await Promise.all([
    listCriteria({ activeOnly: true }),
    getSettings(),
  ]);
  const raw: Record<string, string | undefined> = {};
  for (const criterion of criteria) {
    const value = formData.get(`score_${criterion.id}`);
    raw[criterion.id] = value === null ? undefined : String(value);
  }
  const { scores, error } = validateReviewScores(
    criteria.map((criterion) => criterion.id),
    raw,
    { min: settings.scale_min, max: settings.scale_max },
  );
  if (error) {
    redirect(`/editorial/meetings/${meetingId}?error=${encodeURIComponent(error)}`);
  }

  const comment = String(formData.get("comment") ?? "").trim() || null;
  const weightByCriterion = new Map(criteria.map((criterion) => [criterion.id, criterion.weight]));

  const supabase = await createClient();
  const { data: review, error: reviewError } = await supabase
    .from("ep_reviews")
    .upsert(
      {
        meeting_pitch_id: entryId,
        reviewer_id: reviewer.profile.id,
        comment,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "meeting_pitch_id,reviewer_id" },
    )
    .select("id")
    .single();
  if (reviewError || !review) {
    redirect(
      `/editorial/meetings/${meetingId}?error=${encodeURIComponent("Could not save your review.")}`,
    );
  }

  await supabase.from("ep_review_scores").delete().eq("review_id", review.id);
  await supabase.from("ep_review_scores").insert(
    scores.map(({ criterionId, score }) => ({
      review_id: review.id,
      criterion_id: criterionId,
      score,
      weight_snapshot: weightByCriterion.get(criterionId) ?? 1,
      scale_snapshot: settings.scale_max,
    })),
  );

  redirect(`/editorial/meetings/${meetingId}`);
}

/** open -> agenda: scoring locks, scores unlock for everyone, ranking appears. */
export async function closeScoring(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const meetingId = String(formData.get("meeting_id") ?? "");

  const supabase = await createClient();
  await supabase
    .from("ep_meetings")
    .update({ status: "agenda", agenda_at: new Date().toISOString() })
    .eq("id", meetingId)
    .eq("status", "open");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.meeting.scoring_closed",
    targetType: "ep_meeting",
    targetId: meetingId,
  });

  redirect(`/editorial/meetings/${meetingId}`);
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
  const entryId = String(formData.get("entry_id") ?? "");
  const outcomeRaw = String(formData.get("outcome") ?? "");
  const assignedTo = String(formData.get("assigned_to") ?? "") || null;
  const rationale = String(formData.get("rationale") ?? "").trim() || null;

  if (!OUTCOMES.includes(outcomeRaw as EpDecisionOutcome))
    redirect(`/editorial/meetings/${meetingId}`);
  const outcome = outcomeRaw as EpDecisionOutcome;
  if (outcome === "assigned" && !assignedTo) {
    redirect(
      `/editorial/meetings/${meetingId}?error=${encodeURIComponent("Pick who the story is assigned to.")}`,
    );
  }
  if ((await getMeetingStatus(meetingId)) !== "agenda")
    redirect(`/editorial/meetings/${meetingId}`);

  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("ep_meeting_pitches")
    .select("id, pitch_id")
    .eq("id", entryId)
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (!entry) redirect(`/editorial/meetings/${meetingId}`);

  const now = new Date().toISOString();
  await supabase
    .from("ep_meeting_pitches")
    .update({
      outcome,
      assigned_to: outcome === "assigned" ? assignedTo : null,
      rationale,
      decided_by: editor.profile.id,
      decided_at: now,
    })
    .eq("id", entryId);

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
  await supabase.from("ep_pitches").update(pitchUpdate).eq("id", entry.pitch_id);

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

  redirect(`/editorial/meetings/${meetingId}`);
}

/** agenda -> concluded: anything undecided is recorded as deferred. */
export async function concludeMeeting(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const meetingId = String(formData.get("meeting_id") ?? "");
  if ((await getMeetingStatus(meetingId)) !== "agenda")
    redirect(`/editorial/meetings/${meetingId}`);

  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase
    .from("ep_meeting_pitches")
    .update({ outcome: "deferred", decided_by: editor.profile.id, decided_at: now })
    .eq("meeting_id", meetingId)
    .is("outcome", null);
  await supabase
    .from("ep_meetings")
    .update({ status: "concluded", concluded_at: now })
    .eq("id", meetingId)
    .eq("status", "agenda");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.meeting.concluded",
    targetType: "ep_meeting",
    targetId: meetingId,
  });

  redirect(`/editorial/meetings/${meetingId}`);
}

export async function updateMeetingNotes(formData: FormData): Promise<void> {
  await assertEditorialRole("editor");
  const meetingId = String(formData.get("meeting_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const supabase = await createClient();
  await supabase.from("ep_meetings").update({ notes }).eq("id", meetingId);

  redirect(`/editorial/meetings/${meetingId}`);
}
