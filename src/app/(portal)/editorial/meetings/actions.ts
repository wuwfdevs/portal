"use server";

import { redirect } from "next/navigation";
import { failWith } from "@/lib/editorial/action-result";
import { invokeCapability } from "@/lib/capabilities/registry";
import {
  addPitchToSlate as addPitchToSlateCapability,
  closeScoring as closeScoringCapability,
  concludeMeeting as concludeMeetingCapability,
  createMeeting as createMeetingCapability,
  recordDecision as recordDecisionCapability,
  removePitchFromSlate as removePitchFromSlateCapability,
  submitReview as submitReviewCapability,
  updateMeetingNotes as updateMeetingNotesCapability,
} from "@/lib/editorial/capabilities";
import { field, optionalField } from "@/lib/form-fields";
import { requireEditorialAccess } from "@/lib/editorial/access";
import { getMeetingBundle } from "@/lib/editorial/data";
import { nextUnscoredEntryId, slateOrder } from "@/lib/editorial/slate-navigation";

const MEETINGS_PATH = "/editorial/meetings";

export async function createMeeting(formData: FormData): Promise<void> {
  const meetingDate = field(formData, "meeting_date");

  const result = await invokeCapability(createMeetingCapability, { meetingDate });
  if (!result.ok) failWith(MEETINGS_PATH, result.error);

  redirect(`${MEETINGS_PATH}/${result.meetingId}`);
}

export async function addPitchToSlate(formData: FormData): Promise<void> {
  const meetingId = field(formData, "meeting_id");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;
  const pitchId = field(formData, "pitch_id");

  const result = await invokeCapability(addPitchToSlateCapability, { meetingId, pitchId });
  if (!result.ok && result.reason === "error") failWith(meetingPath, result.error);

  redirect(meetingPath);
}

export async function removePitchFromSlate(formData: FormData): Promise<void> {
  const meetingId = field(formData, "meeting_id");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;
  const entryId = field(formData, "entry_id");

  const result = await invokeCapability(removePitchFromSlateCapability, { meetingId, entryId });
  if (!result.ok && result.reason === "error") failWith(meetingPath, result.error);

  redirect(meetingPath);
}

export async function submitReview(formData: FormData): Promise<void> {
  const meetingId = field(formData, "meeting_id");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;
  const entryId = field(formData, "entry_id");

  // Criterion scores arrive as score_<criterionId> fields; the capability
  // validates them against the meeting's actual rubric, so every key is
  // passed through and unknown ones are simply ignored there.
  const scores: Record<string, string | undefined> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("score_")) scores[key.slice("score_".length)] = String(value);
  }

  const result = await invokeCapability(submitReviewCapability, {
    meetingId,
    entryId,
    scores,
    recommendation: field(formData, "recommendation"),
    concernFlags: formData.getAll("concern_flags").map(String),
    comment: optionalField(formData, "comment") ?? undefined,
  });
  if (!result.ok && result.reason === "error")
    failWith(`${meetingPath}?pitch=${entryId}`, result.error);

  // "Save and go to next unscored": land on the next pitch this reviewer has
  // not scored, in the slate's display order; with none left, stay put.
  if (optionalField(formData, "next") === "1") {
    const { profile } = await requireEditorialAccess();
    const bundle = await getMeetingBundle(meetingId);
    if (bundle) {
      const order = slateOrder(bundle.slate).map(({ entry }) => entry.id);
      const scored = new Set(
        order.filter((id) =>
          (bundle.reviewsByEntry.get(id) ?? []).some(
            ({ review }) => review.reviewer_id === profile.id,
          ),
        ),
      );
      const next = nextUnscoredEntryId(order, scored, entryId);
      redirect(`${meetingPath}?pitch=${next ?? entryId}`);
    }
  }

  redirect(`${meetingPath}?pitch=${entryId}`);
}

/** open -> agenda: scoring locks, scores unlock for everyone, ranking appears. */
export async function closeScoring(formData: FormData): Promise<void> {
  const meetingId = field(formData, "meeting_id");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;

  const result = await invokeCapability(closeScoringCapability, { meetingId }, { confirmed: true });
  if (!result.ok) failWith(meetingPath, result.error);

  redirect(meetingPath);
}

/**
 * Record the editorial decision for one slate item and move the pitch
 * accordingly. Decisions can be revised while the meeting stays in agenda;
 * each write fully determines the pitch's resulting state.
 */
export async function recordDecision(formData: FormData): Promise<void> {
  const meetingId = field(formData, "meeting_id");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;
  const entryId = field(formData, "entry_id");
  const outcome = field(formData, "outcome");
  const assignedTo = optionalField(formData, "assigned_to") ?? undefined;
  const rationale = optionalField(formData, "rationale") ?? undefined;

  const result = await invokeCapability(
    recordDecisionCapability,
    { meetingId, entryId, outcome, assignedTo, rationale },
    { confirmed: true },
  );
  if (!result.ok && result.reason === "error") failWith(meetingPath, result.error);

  redirect(meetingPath);
}

/** agenda -> concluded: anything undecided is recorded as deferred. */
export async function concludeMeeting(formData: FormData): Promise<void> {
  const meetingId = field(formData, "meeting_id");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;

  const result = await invokeCapability(
    concludeMeetingCapability,
    { meetingId },
    { confirmed: true },
  );
  if (!result.ok && result.reason === "error") failWith(meetingPath, result.error);

  redirect(meetingPath);
}

export async function updateMeetingNotes(formData: FormData): Promise<void> {
  const meetingId = field(formData, "meeting_id");
  const meetingPath = `${MEETINGS_PATH}/${meetingId}`;
  const notes = optionalField(formData, "notes") ?? undefined;

  const result = await invokeCapability(updateMeetingNotesCapability, { meetingId, notes });
  if (!result.ok) failWith(meetingPath, result.error);

  redirect(meetingPath);
}
