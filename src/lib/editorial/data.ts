import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { unwrapRead } from "@/lib/read-result";
import { EDITORIAL_TOOL_KEY } from "./access";
import { normalizeToolRole, type EditorialRole } from "./roles";
import { isStalePitch } from "./staleness";
import type { EpPitchStatus } from "@/lib/database.types";

// Reads throw rather than falling back to empty — see lib/read-result.ts.
// Re-exported so the call sites below (and the tool's other modules) keep
// importing it from the place they always have.
export { unwrapRead };

export type FormFieldRow = Database["public"]["Tables"]["ep_form_fields"]["Row"];
export type CriterionRow = Database["public"]["Tables"]["ep_criteria"]["Row"];
export type SettingsRow = Database["public"]["Tables"]["ep_settings"]["Row"];
export type PitchRow = Database["public"]["Tables"]["ep_pitches"]["Row"];
export type PitchValueRow = Database["public"]["Tables"]["ep_pitch_values"]["Row"];
export type MeetingRow = Database["public"]["Tables"]["ep_meetings"]["Row"];
export type MeetingPitchRow = Database["public"]["Tables"]["ep_meeting_pitches"]["Row"];
export type ReviewRow = Database["public"]["Tables"]["ep_reviews"]["Row"];
export type ReviewScoreRow = Database["public"]["Tables"]["ep_review_scores"]["Row"];

export async function getSettings(): Promise<SettingsRow> {
  const supabase = await createClient();
  const data = unwrapRead(
    await supabase.from("ep_settings").select("*").maybeSingle(),
    "the scoring scale",
  );
  // The migration seeds the singleton; the fallback only covers a missing row.
  return data ?? { id: true, scale_min: 1, scale_max: 5, updated_at: "" };
}

export async function listFormFields(options?: { activeOnly?: boolean }): Promise<FormFieldRow[]> {
  const supabase = await createClient();
  let query = supabase.from("ep_form_fields").select("*").order("sort_order").order("created_at");
  if (options?.activeOnly) query = query.eq("active", true);
  return unwrapRead(await query, "the submission form") ?? [];
}

export async function listCriteria(options?: { activeOnly?: boolean }): Promise<CriterionRow[]> {
  const supabase = await createClient();
  let query = supabase.from("ep_criteria").select("*").order("sort_order").order("created_at");
  if (options?.activeOnly) query = query.eq("active", true);
  return unwrapRead(await query, "the rubric") ?? [];
}

/** Display names for arbitrary profile ids (submitters, reviewers, assignees). */
export async function getProfileNames(ids: Iterable<string | null>): Promise<Map<string, string>> {
  const unique = Array.from(new Set(Array.from(ids).filter((id): id is string => id !== null)));
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const data = unwrapRead(
    await supabase.from("profiles").select("id, display_name").in("id", unique),
    "member names",
  );
  return new Map((data ?? []).map((row) => [row.id, row.display_name]));
}

export interface Member {
  id: string;
  displayName: string;
  role: EditorialRole;
}

/** Active members of the editorial tool — the assignee picker and reviewer roster. */
export async function listMembers(): Promise<Member[]> {
  const supabase = await createClient();
  const tool = unwrapRead(
    await supabase.from("tools").select("id").eq("key", EDITORIAL_TOOL_KEY).maybeSingle(),
    "the tool registry",
  );
  if (!tool) return [];

  const grants = unwrapRead(
    await supabase
      .from("tool_access")
      .select("user_id, tool_role")
      .eq("tool_id", tool.id)
      .is("revoked_at", null),
    "the member roster",
  );
  if (!grants || grants.length === 0) return [];

  const profiles = unwrapRead(
    await supabase
      .from("profiles")
      .select("id, display_name, account_status")
      .in(
        "id",
        grants.map((grant) => grant.user_id),
      ),
    "the member roster",
  );
  const activeNames = new Map(
    (profiles ?? [])
      .filter((profile) => profile.account_status === "active")
      .map((profile) => [profile.id, profile.display_name]),
  );

  return grants
    .filter((grant) => activeNames.has(grant.user_id))
    .map((grant) => ({
      id: grant.user_id,
      displayName: activeNames.get(grant.user_id) as string,
      role: normalizeToolRole(grant.tool_role),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export interface PitchListEntry {
  pitch: PitchRow;
  submitterName: string | null;
  assigneeName: string | null;
  deferralCount: number;
  lastReviewedAt: string | null;
  stale: boolean;
}

/**
 * Pitches in the given statuses, annotated with the review-history stats the
 * backlog shows (deferral count, last decision date, staleness). Derived from
 * ep_meeting_pitches rows — nothing is maintained separately.
 */
export async function listPitchesWithActivity(
  statuses: EpPitchStatus[],
): Promise<PitchListEntry[]> {
  const supabase = await createClient();
  const pitches = unwrapRead(
    await supabase
      .from("ep_pitches")
      .select("*")
      .in("status", statuses)
      .order("created_at", { ascending: false }),
    "the backlog",
  );
  if (!pitches || pitches.length === 0) return [];

  const pitchIds = pitches.map((pitch) => pitch.id);
  const rounds = unwrapRead(
    await supabase
      .from("ep_meeting_pitches")
      .select("pitch_id, outcome, decided_at")
      .in("pitch_id", pitchIds),
    "review history",
  );

  const statsByPitch = new Map<string, { deferralCount: number; lastReviewedAt: string | null }>();
  for (const round of rounds ?? []) {
    const stats = statsByPitch.get(round.pitch_id) ?? { deferralCount: 0, lastReviewedAt: null };
    if (round.outcome === "deferred") stats.deferralCount += 1;
    if (round.decided_at && (!stats.lastReviewedAt || round.decided_at > stats.lastReviewedAt)) {
      stats.lastReviewedAt = round.decided_at;
    }
    statsByPitch.set(round.pitch_id, stats);
  }

  const names = await getProfileNames(
    pitches.flatMap((pitch) => [pitch.submitted_by, pitch.assigned_to]),
  );
  const now = new Date();

  return pitches.map((pitch) => {
    const stats = statsByPitch.get(pitch.id) ?? { deferralCount: 0, lastReviewedAt: null };
    return {
      pitch,
      submitterName: pitch.submitted_by ? (names.get(pitch.submitted_by) ?? null) : null,
      assigneeName: pitch.assigned_to ? (names.get(pitch.assigned_to) ?? null) : null,
      deferralCount: stats.deferralCount,
      lastReviewedAt: stats.lastReviewedAt,
      stale:
        pitch.status === "open" &&
        isStalePitch(
          {
            createdAt: pitch.created_at,
            lastReviewedAt: stats.lastReviewedAt,
            deferralCount: stats.deferralCount,
          },
          now,
        ),
    };
  });
}

/** Row counts per status, so every backlog tab can show its size, not just the open one. */
export async function countPitchesByStatus(): Promise<Record<EpPitchStatus, number>> {
  const supabase = await createClient();
  const rows = unwrapRead(await supabase.from("ep_pitches").select("status"), "the backlog") ?? [];
  const counts: Record<EpPitchStatus, number> = { open: 0, assigned: 0, archived: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

export async function getPitchValues(pitchIds: string[]): Promise<Map<string, PitchValueRow[]>> {
  if (pitchIds.length === 0) return new Map();
  const supabase = await createClient();
  const data = unwrapRead(
    await supabase.from("ep_pitch_values").select("*").in("pitch_id", pitchIds),
    "pitch details",
  );
  const byPitch = new Map<string, PitchValueRow[]>();
  for (const row of data ?? []) {
    const list = byPitch.get(row.pitch_id) ?? [];
    list.push(row);
    byPitch.set(row.pitch_id, list);
  }
  return byPitch;
}

export interface ReviewWithScores {
  review: ReviewRow;
  scores: ReviewScoreRow[];
}

export interface MeetingBundle {
  meeting: MeetingRow;
  slate: { entry: MeetingPitchRow; pitch: PitchRow }[];
  /** Reviews visible to the caller (RLS hides colleagues' reviews while open). */
  reviewsByEntry: Map<string, ReviewWithScores[]>;
}

export async function getMeetingBundle(meetingId: string): Promise<MeetingBundle | null> {
  const supabase = await createClient();
  const meeting = unwrapRead(
    await supabase.from("ep_meetings").select("*").eq("id", meetingId).maybeSingle(),
    "the meeting",
  );
  if (!meeting) return null;

  const entries = unwrapRead(
    await supabase.from("ep_meeting_pitches").select("*").eq("meeting_id", meetingId),
    "the slate",
  );
  const slateEntries = entries ?? [];

  const pitchesById = new Map<string, PitchRow>();
  if (slateEntries.length > 0) {
    const pitches = unwrapRead(
      await supabase
        .from("ep_pitches")
        .select("*")
        .in(
          "id",
          slateEntries.map((entry) => entry.pitch_id),
        ),
      "the slate's pitches",
    );
    for (const pitch of pitches ?? []) pitchesById.set(pitch.id, pitch);
  }

  const reviewsByEntry = new Map<string, ReviewWithScores[]>();
  if (slateEntries.length > 0) {
    const reviews = unwrapRead(
      await supabase
        .from("ep_reviews")
        .select("*")
        .in(
          "meeting_pitch_id",
          slateEntries.map((entry) => entry.id),
        ),
      "reviews",
    );
    const reviewRows = reviews ?? [];
    const scoresByReview = new Map<string, ReviewScoreRow[]>();
    if (reviewRows.length > 0) {
      const scores = unwrapRead(
        await supabase
          .from("ep_review_scores")
          .select("*")
          .in(
            "review_id",
            reviewRows.map((review) => review.id),
          ),
        "review scores",
      );
      for (const score of scores ?? []) {
        const list = scoresByReview.get(score.review_id) ?? [];
        list.push(score);
        scoresByReview.set(score.review_id, list);
      }
    }
    for (const review of reviewRows) {
      const list = reviewsByEntry.get(review.meeting_pitch_id) ?? [];
      list.push({ review, scores: scoresByReview.get(review.id) ?? [] });
      reviewsByEntry.set(review.meeting_pitch_id, list);
    }
  }

  return {
    meeting,
    slate: slateEntries
      .map((entry) => ({ entry, pitch: pitchesById.get(entry.pitch_id) }))
      .filter(
        (item): item is { entry: MeetingPitchRow; pitch: PitchRow } => item.pitch !== undefined,
      ),
    reviewsByEntry,
  };
}
