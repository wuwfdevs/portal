// Editorial Planning's capability layer (docs/agent-capabilities-design.md
// §4, Phase A). Each capability is the write logic that used to live inline
// in pitches/actions.ts and meetings/actions.ts, unchanged in behavior —
// same authorization calls, same Supabase writes, same audit events, same
// error text — just returning a typed result instead of calling redirect()
// or failWith()/failIfError() (which throw via redirect, meaningless outside
// a request/response cycle). Those files are now thin adapters: parse
// FormData, call the capability, map the result to redirect()/failWith().
//
// The `requires` field is discovery/UI metadata only; every handler still
// calls assertEditorialRole itself, which is the real authorization check
// (see design doc §4, and §11 risk 1 on never treating `requires` as the
// boundary).

import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import type { CapabilityContext } from "@/lib/capabilities/define";
import { assertEditorialRole } from "./access";
import {
  listCriteria,
  listPitchFormFields,
  listRubricProfiles,
  getDefaultRubricProfile,
  getSettings,
  unwrapRead,
} from "./data";
import { validatePitchValues } from "./form";
import { validateReviewScores, type CriterionDef } from "./scoring";
import { CONCERN_FLAGS, RECOMMENDATIONS } from "./review";
import { logAuditEvent } from "@/lib/audit";
import type {
  EpConcernFlag,
  EpDecisionOutcome,
  EpFieldValue,
  EpRecommendation,
} from "@/lib/database.types";

async function getMeeting(
  { supabase }: CapabilityContext,
  meetingId: string,
): Promise<{ status: string; rubric_profile_id: string } | null> {
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

// --- Pitches ---------------------------------------------------------------

export type SavePitchResult =
  | { ok: true; pitchId: string }
  | { ok: false; kind: "invalid"; fieldErrors: Record<string, string> }
  | { ok: false; kind: "error"; message: string };

/**
 * Create or update a pitch (update when pitchId is present). Submitter edit
 * rights (own pitch, still open, not on an active slate) are enforced by
 * RLS; this check exists to fail with a readable message instead of a
 * silent no-op write.
 */
export const savePitch = defineCapability({
  id: "editorial.pitch.save",
  summary: "Create a pitch, or update an existing open pitch's title and field values",
  input: z.object({
    pitchId: z.string().optional(),
    title: z.string(),
    fieldValues: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  }),
  requires: { tool: "editorial-planning", role: "contributor" },
  confirmation: "none",
  async handler({ supabase }, input): Promise<SavePitchResult> {
    const { profile, role } = await assertEditorialRole("contributor");
    const fields = await listPitchFormFields();
    const raw: Record<string, EpFieldValue> = input.fieldValues;

    const { values, errors } = validatePitchValues(fields, raw);
    if (!input.title) errors.title = "Give the pitch a title.";
    if (Object.keys(errors).length > 0) {
      return { ok: false, kind: "invalid", fieldErrors: errors };
    }

    if (input.pitchId) {
      const pitchId = input.pitchId;
      const pitch = unwrapRead(
        await supabase
          .from("ep_pitches")
          .select("id, submitted_by, status")
          .eq("id", pitchId)
          .maybeSingle(),
        "the pitch",
      );
      if (!pitch) {
        return { ok: false, kind: "error", message: "This pitch no longer exists." };
      }
      const isOwn = pitch.submitted_by === profile.id;
      if (!isOwn && role !== "editor") {
        return { ok: false, kind: "error", message: "You can only edit your own pitches." };
      }
      if (pitch.status !== "open" && role !== "editor") {
        return {
          ok: false,
          kind: "error",
          message: "This pitch has been decided and can no longer be edited.",
        };
      }

      const { error: updateError } = await supabase
        .from("ep_pitches")
        .update({ title: input.title })
        .eq("id", pitchId);
      if (updateError) {
        console.error("Could not update the pitch:", updateError);
        return {
          ok: false,
          kind: "error",
          message: "Could not save the pitch — it may be under review right now.",
        };
      }

      // Replace-all, so a field the writer cleared actually goes away. If the
      // insert half fails the pitch would silently lose its details, so report it.
      const { error: clearError } = await supabase
        .from("ep_pitch_values")
        .delete()
        .eq("pitch_id", pitchId);
      if (clearError) {
        console.error("Could not clear the pitch's details:", clearError);
        return {
          ok: false,
          kind: "error",
          message: "Could not save the pitch's details. Try again.",
        };
      }
      if (values.length > 0) {
        const { error: valuesError } = await supabase
          .from("ep_pitch_values")
          .insert(
            values.map(({ fieldId, value }) => ({ pitch_id: pitchId, field_id: fieldId, value })),
          );
        if (valuesError) {
          console.error("Could not save the pitch's details:", valuesError);
          return {
            ok: false,
            kind: "error",
            message: "Could not save the pitch's details. Try again.",
          };
        }
      }
      return { ok: true, pitchId };
    }

    const { data: created, error: insertError } = await supabase
      .from("ep_pitches")
      .insert({ title: input.title, submitted_by: profile.id })
      .select("id")
      .single();
    if (insertError || !created) {
      console.error("Could not create the pitch:", insertError);
      return {
        ok: false,
        kind: "error",
        message: insertError
          ? `Could not submit the pitch: ${insertError.message}`
          : "Could not submit the pitch. Try again.",
      };
    }

    if (values.length > 0) {
      const { error: valuesError } = await supabase
        .from("ep_pitch_values")
        .insert(
          values.map(({ fieldId, value }) => ({ pitch_id: created.id, field_id: fieldId, value })),
        );
      if (valuesError) {
        console.error("Could not save the new pitch's details:", valuesError);
        return {
          ok: false,
          kind: "error",
          message: "The pitch was created but its details could not be saved. Edit it to retry.",
        };
      }
    }
    return { ok: true, pitchId: created.id };
  },
});

export type SimpleCapabilityResult = { ok: true } | { ok: false; message: string };

export const archivePitch = defineCapability({
  id: "editorial.pitch.archive",
  summary: "Archive an open pitch, removing it from the backlog",
  input: z.object({ pitchId: z.string(), reason: z.string().trim().optional() }),
  requires: { tool: "editorial-planning", role: "editor" },
  confirmation: "required",
  async handler({ supabase }, input): Promise<SimpleCapabilityResult> {
    const editor = await assertEditorialRole("editor");
    const reason = input.reason || null;
    const { error } = await supabase
      .from("ep_pitches")
      .update({
        status: "archived",
        archived_reason: reason,
        archived_by: editor.profile.id,
        archived_at: new Date().toISOString(),
      })
      .eq("id", input.pitchId)
      .eq("status", "open");
    if (error) {
      console.error("Could not archive the pitch:", error);
      return { ok: false, message: `Could not archive the pitch: ${error.message}` };
    }

    await logAuditEvent({
      actorId: editor.profile.id,
      action: "ep.pitch.archived",
      targetType: "ep_pitch",
      targetId: input.pitchId,
      metadata: reason ? { reason } : {},
    });
    return { ok: true };
  },
});

export const unarchivePitch = defineCapability({
  id: "editorial.pitch.unarchive",
  summary: "Restore an archived pitch to the open backlog",
  input: z.object({ pitchId: z.string() }),
  requires: { tool: "editorial-planning", role: "editor" },
  confirmation: "required",
  async handler({ supabase }, input): Promise<SimpleCapabilityResult> {
    const editor = await assertEditorialRole("editor");
    const { error } = await supabase
      .from("ep_pitches")
      .update({ status: "open", archived_reason: null, archived_by: null, archived_at: null })
      .eq("id", input.pitchId)
      .eq("status", "archived");
    if (error) {
      console.error("Could not restore the pitch:", error);
      return { ok: false, message: `Could not restore the pitch: ${error.message}` };
    }

    await logAuditEvent({
      actorId: editor.profile.id,
      action: "ep.pitch.reopened",
      targetType: "ep_pitch",
      targetId: input.pitchId,
    });
    return { ok: true };
  },
});

export const archiveSelectedPitches = defineCapability({
  id: "editorial.pitch.bulkArchive",
  summary: "Archive several open pitches at once, from a backlog review",
  input: z.object({
    pitchIds: z.array(z.string()),
    reason: z.string().trim().optional(),
  }),
  requires: { tool: "editorial-planning", role: "editor" },
  confirmation: "required",
  async handler({ supabase }, input): Promise<SimpleCapabilityResult> {
    const editor = await assertEditorialRole("editor");
    if (input.pitchIds.length === 0) return { ok: true };
    const reason = input.reason || "Archived in a backlog review.";

    const { error } = await supabase
      .from("ep_pitches")
      .update({
        status: "archived",
        archived_reason: reason,
        archived_by: editor.profile.id,
        archived_at: new Date().toISOString(),
      })
      .in("id", input.pitchIds)
      .eq("status", "open");
    if (error) {
      console.error("Could not archive the selected pitches:", error);
      return { ok: false, message: `Could not archive the selected pitches: ${error.message}` };
    }

    await logAuditEvent({
      actorId: editor.profile.id,
      action: "ep.pitch.bulk_archived",
      targetType: "ep_pitch",
      metadata: { pitch_ids: input.pitchIds, reason },
    });
    return { ok: true };
  },
});

// --- Meetings ----------------------------------------------------------------

export type CreateMeetingResult = { ok: true; meetingId: string } | { ok: false; message: string };

export const createMeeting = defineCapability({
  id: "editorial.meeting.create",
  summary: "Create a new weekly meeting against a rubric profile",
  input: z.object({ meetingDate: z.string(), rubricProfileId: z.string().optional() }),
  requires: { tool: "editorial-planning", role: "editor" },
  confirmation: "none",
  async handler({ supabase }, input): Promise<CreateMeetingResult> {
    const editor = await assertEditorialRole("editor");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.meetingDate)) {
      return { ok: false, message: "Pick a meeting date." };
    }

    const profiles = await listRubricProfiles({ activeOnly: true });
    const profile = input.rubricProfileId
      ? (profiles.find((p) => p.id === input.rubricProfileId) ?? null)
      : await getDefaultRubricProfile();
    if (!profile) return { ok: false, message: "No active rubric profile is configured." };

    const { data: meeting, error } = await supabase
      .from("ep_meetings")
      .insert({
        meeting_date: input.meetingDate,
        created_by: editor.profile.id,
        rubric_profile_id: profile.id,
      })
      .select("id")
      .single();
    if (error) {
      console.error("Could not create the meeting:", error);
      return { ok: false, message: `Could not create the meeting: ${error.message}` };
    }
    if (!meeting)
      return { ok: false, message: "Could not create the meeting — no row was created." };

    await logAuditEvent({
      actorId: editor.profile.id,
      action: "ep.meeting.created",
      targetType: "ep_meeting",
      targetId: meeting.id,
      metadata: { meeting_date: input.meetingDate, rubric_profile_id: profile.id },
    });
    return { ok: true, meetingId: meeting.id };
  },
});

export type MeetingWriteResult =
  | { ok: true }
  | { ok: false; reason: "not_open" | "not_agenda" }
  | { ok: false; reason: "error"; message: string };

export const addPitchToSlate = defineCapability({
  id: "editorial.meeting.addPitch",
  summary: "Add a pitch to an open meeting's slate",
  input: z.object({ meetingId: z.string(), pitchId: z.string() }),
  requires: { tool: "editorial-planning", role: "editor" },
  confirmation: "none",
  async handler(ctx, input): Promise<MeetingWriteResult> {
    const editor = await assertEditorialRole("editor");
    if ((await getMeeting(ctx, input.meetingId))?.status !== "open") {
      return { ok: false, reason: "not_open" };
    }

    // ignoreDuplicates makes a double-add (two editors, same pitch) a real no-op
    // against the (meeting_id, pitch_id) unique constraint rather than an error.
    const { error } = await ctx.supabase
      .from("ep_meeting_pitches")
      .upsert(
        { meeting_id: input.meetingId, pitch_id: input.pitchId, added_by: editor.profile.id },
        { onConflict: "meeting_id,pitch_id", ignoreDuplicates: true },
      );
    if (error) {
      console.error("Could not add the pitch to the slate:", error);
      return {
        ok: false,
        reason: "error",
        message: `Could not add the pitch to the slate: ${error.message}`,
      };
    }
    return { ok: true };
  },
});

export const removePitchFromSlate = defineCapability({
  id: "editorial.meeting.removePitch",
  summary: "Remove a pitch from an open meeting's slate",
  input: z.object({ meetingId: z.string(), entryId: z.string() }),
  requires: { tool: "editorial-planning", role: "editor" },
  confirmation: "none",
  async handler(ctx, input): Promise<MeetingWriteResult> {
    await assertEditorialRole("editor");
    if ((await getMeeting(ctx, input.meetingId))?.status !== "open") {
      return { ok: false, reason: "not_open" };
    }

    const { error } = await ctx.supabase
      .from("ep_meeting_pitches")
      .delete()
      .eq("id", input.entryId)
      .eq("meeting_id", input.meetingId);
    if (error) {
      console.error("Could not remove the pitch from the slate:", error);
      return {
        ok: false,
        reason: "error",
        message: `Could not remove the pitch from the slate: ${error.message}`,
      };
    }
    return { ok: true };
  },
});

export type SubmitReviewResult =
  | { ok: true }
  | { ok: false; reason: "not_open" }
  | { ok: false; reason: "error"; message: string };

/**
 * Upsert the caller's review of one slate item: per-criterion scores plus an
 * optional comment, atomic per reviewer. Scores snapshot the criterion weight
 * and the scale in force right now (see design §4.2). RLS additionally
 * guarantees this only works on the reviewer's own review while the meeting
 * is open.
 */
export const submitReview = defineCapability({
  id: "editorial.meeting.submitReview",
  summary: "Submit or update the caller's review of one slate item",
  input: z.object({
    meetingId: z.string(),
    entryId: z.string(),
    scores: z.record(z.string(), z.string().optional()),
    recommendation: z.string(),
    concernFlags: z.array(z.string()),
    comment: z.string().trim().optional(),
  }),
  requires: { tool: "editorial-planning", role: "reviewer" },
  confirmation: "none",
  async handler(ctx, input): Promise<SubmitReviewResult> {
    const reviewer = await assertEditorialRole("reviewer");
    const meeting = await getMeeting(ctx, input.meetingId);
    if (meeting?.status !== "open") return { ok: false, reason: "not_open" };

    const [criteria, settings] = await Promise.all([
      listCriteria({ activeOnly: true, profileId: meeting.rubric_profile_id }),
      getSettings(),
    ]);
    const criterionDefs: CriterionDef[] = criteria.map((criterion) => ({
      id: criterion.id,
      criterionType: criterion.criterion_type,
      scaleMin: criterion.scale_min,
      scaleMax: criterion.scale_max,
    }));
    const { scores, error: scoreError } = validateReviewScores(criterionDefs, input.scores, {
      min: settings.scale_min,
      max: settings.scale_max,
    });
    if (scoreError) return { ok: false, reason: "error", message: scoreError };

    if (!RECOMMENDATIONS.includes(input.recommendation as EpRecommendation)) {
      return {
        ok: false,
        reason: "error",
        message: "Pick a recommendation before saving your review.",
      };
    }
    const recommendation = input.recommendation as EpRecommendation;

    const concernFlags = input.concernFlags.filter((flag): flag is EpConcernFlag =>
      CONCERN_FLAGS.includes(flag as EpConcernFlag),
    );
    const comment = input.comment || null;
    const criterionById = new Map(criteria.map((criterion) => [criterion.id, criterion]));

    const { data: review, error: reviewError } = await ctx.supabase
      .from("ep_reviews")
      .upsert(
        {
          meeting_pitch_id: input.entryId,
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
    if (reviewError) {
      console.error("Could not save your review:", reviewError);
      return {
        ok: false,
        reason: "error",
        message: `Could not save your review: ${reviewError.message}`,
      };
    }
    if (!review) {
      return {
        ok: false,
        reason: "error",
        message: "Could not save your review — no row was written.",
      };
    }

    const { error: clearError } = await ctx.supabase
      .from("ep_review_scores")
      .delete()
      .eq("review_id", review.id);
    if (clearError) {
      console.error("Could not save your review:", clearError);
      return {
        ok: false,
        reason: "error",
        message: `Could not save your review: ${clearError.message}`,
      };
    }

    if (scores.length > 0) {
      const { error: scoresError } = await ctx.supabase.from("ep_review_scores").insert(
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
      if (scoresError) {
        console.error("Could not save your scores:", scoresError);
        return {
          ok: false,
          reason: "error",
          message: `Could not save your scores: ${scoresError.message}`,
        };
      }
    }
    return { ok: true };
  },
});

export type CloseScoringResult = { ok: true } | { ok: false; message: string };

// Locks scoring for the whole team, not just the caller's own record — a
// one-way transition other reviewers immediately feel, so it gets the same
// confirmation treatment as recordDecision/concludeMeeting even though it
// isn't in the design doc's illustrative confirmation-required table.
export const closeScoring = defineCapability({
  id: "editorial.meeting.closeScoring",
  summary: "Close scoring for a meeting (open -> agenda), locking further reviews",
  input: z.object({ meetingId: z.string() }),
  requires: { tool: "editorial-planning", role: "editor" },
  confirmation: "required",
  async handler({ supabase }, input): Promise<CloseScoringResult> {
    const editor = await assertEditorialRole("editor");
    const { error } = await supabase
      .from("ep_meetings")
      .update({ status: "agenda", agenda_at: new Date().toISOString() })
      .eq("id", input.meetingId)
      .eq("status", "open");
    if (error) {
      console.error("Could not close scoring:", error);
      return { ok: false, message: `Could not close scoring: ${error.message}` };
    }

    await logAuditEvent({
      actorId: editor.profile.id,
      action: "ep.meeting.scoring_closed",
      targetType: "ep_meeting",
      targetId: input.meetingId,
    });
    return { ok: true };
  },
});

const OUTCOMES: EpDecisionOutcome[] = ["assigned", "deferred", "archived"];

export type RecordDecisionResult =
  | { ok: true }
  | { ok: false; reason: "invalid_outcome" | "not_agenda" | "not_found" }
  | { ok: false; reason: "error"; message: string };

/**
 * Record the editorial decision for one slate item and move the pitch
 * accordingly. Decisions can be revised while the meeting stays in agenda;
 * each write fully determines the pitch's resulting state.
 */
export const recordDecision = defineCapability({
  id: "editorial.decision.record",
  summary: "Record the editorial decision (assign, defer, or archive) for one slate item",
  input: z.object({
    meetingId: z.string(),
    entryId: z.string(),
    outcome: z.string(),
    assignedTo: z.string().optional(),
    rationale: z.string().trim().optional(),
  }),
  requires: { tool: "editorial-planning", role: "editor" },
  confirmation: "required",
  async handler({ supabase }, input): Promise<RecordDecisionResult> {
    const editor = await assertEditorialRole("editor");
    if (!OUTCOMES.includes(input.outcome as EpDecisionOutcome)) {
      return { ok: false, reason: "invalid_outcome" };
    }
    const outcome = input.outcome as EpDecisionOutcome;
    const assignedTo = input.assignedTo || null;
    const rationale = input.rationale || null;
    if (outcome === "assigned" && !assignedTo) {
      return { ok: false, reason: "error", message: "Pick who the story is assigned to." };
    }
    if ((await getMeeting({ supabase }, input.meetingId))?.status !== "agenda") {
      return { ok: false, reason: "not_agenda" };
    }

    const entry = unwrapRead(
      await supabase
        .from("ep_meeting_pitches")
        .select("id, pitch_id")
        .eq("id", input.entryId)
        .eq("meeting_id", input.meetingId)
        .maybeSingle(),
      "the slate item",
    );
    if (!entry) return { ok: false, reason: "not_found" };

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
      .eq("id", input.entryId);
    if (decisionError) {
      console.error("Could not record the decision:", decisionError);
      return {
        ok: false,
        reason: "error",
        message: `Could not record the decision: ${decisionError.message}`,
      };
    }

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
    if (pitchError) {
      console.error("Recorded the decision but could not update the pitch:", pitchError);
      return {
        ok: false,
        reason: "error",
        message: `Recorded the decision but could not update the pitch: ${pitchError.message}`,
      };
    }

    await logAuditEvent({
      actorId: editor.profile.id,
      action: `ep.pitch.${outcome === "assigned" ? "assigned" : outcome === "archived" ? "archived" : "deferred"}`,
      targetType: "ep_pitch",
      targetId: entry.pitch_id,
      metadata: {
        meeting_id: input.meetingId,
        ...(outcome === "assigned" && assignedTo ? { assigned_to: assignedTo } : {}),
        ...(rationale ? { rationale } : {}),
      },
    });
    return { ok: true };
  },
});

export type ConcludeMeetingResult =
  | { ok: true }
  | { ok: false; reason: "not_agenda" }
  | { ok: false; reason: "error"; message: string };

/** agenda -> concluded: anything undecided is recorded as deferred. */
export const concludeMeeting = defineCapability({
  id: "editorial.meeting.conclude",
  summary: "Conclude a meeting, deferring anything left undecided",
  input: z.object({ meetingId: z.string() }),
  requires: { tool: "editorial-planning", role: "editor" },
  confirmation: "required",
  async handler({ supabase }, input): Promise<ConcludeMeetingResult> {
    const editor = await assertEditorialRole("editor");
    if ((await getMeeting({ supabase }, input.meetingId))?.status !== "agenda") {
      return { ok: false, reason: "not_agenda" };
    }

    const now = new Date().toISOString();
    const { error: deferError } = await supabase
      .from("ep_meeting_pitches")
      .update({ outcome: "deferred", decided_by: editor.profile.id, decided_at: now })
      .eq("meeting_id", input.meetingId)
      .is("outcome", null);
    if (deferError) {
      console.error("Could not defer the undecided pitches:", deferError);
      return {
        ok: false,
        reason: "error",
        message: `Could not defer the undecided pitches: ${deferError.message}`,
      };
    }

    const { error } = await supabase
      .from("ep_meetings")
      .update({ status: "concluded", concluded_at: now })
      .eq("id", input.meetingId)
      .eq("status", "agenda");
    if (error) {
      console.error("Could not conclude the meeting:", error);
      return {
        ok: false,
        reason: "error",
        message: `Could not conclude the meeting: ${error.message}`,
      };
    }

    await logAuditEvent({
      actorId: editor.profile.id,
      action: "ep.meeting.concluded",
      targetType: "ep_meeting",
      targetId: input.meetingId,
    });
    return { ok: true };
  },
});

export const updateMeetingNotes = defineCapability({
  id: "editorial.meeting.updateNotes",
  summary: "Update a meeting's freeform notes",
  input: z.object({ meetingId: z.string(), notes: z.string().trim().optional() }),
  requires: { tool: "editorial-planning", role: "editor" },
  confirmation: "none",
  async handler({ supabase }, input): Promise<SimpleCapabilityResult> {
    await assertEditorialRole("editor");
    const { error } = await supabase
      .from("ep_meetings")
      .update({ notes: input.notes || null })
      .eq("id", input.meetingId);
    if (error) {
      console.error("Could not save the notes:", error);
      return { ok: false, message: `Could not save the notes: ${error.message}` };
    }
    return { ok: true };
  },
});
