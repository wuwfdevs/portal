// Pure state-derivation and validation for a query and its questions. No
// Supabase, no React — colocated tests cover it directly, per CLAUDE.md's
// testing expectations.

import { MAX_MAX_DURATION_SECONDS, MIN_MAX_DURATION_SECONDS } from "@/lib/audience-listening/media";
import type { AlQueryStatus } from "@/lib/database.types";

/** A query holds at most five questions — also enforced by a database trigger. */
export const MAX_QUESTIONS = 5;

/**
 * What the public route does with this query right now.
 *
 * Deliberately a mirror of the CASE inside al_public_query() (and of
 * private.al_is_accepting() for the `open` branch). The database is the
 * enforcement point; this exists so the staff preview and the workspace can
 * describe the same thing without a round trip, and so the rule is written
 * down somewhere a test can read it.
 *
 * "unavailable" has no counterpart in the SQL on purpose: al_public_query()
 * returns null for a draft exactly as it does for a public id that does not
 * exist, so a draft link cannot be probed for existence.
 */
export type PublicAvailability = "unavailable" | "not_yet_open" | "open" | "closed";

export function derivePublicAvailability(
  query: { status: AlQueryStatus; opens_at: string | null; closes_at: string | null },
  now: Date = new Date(),
): PublicAvailability {
  if (query.status === "draft") return "unavailable";
  if (query.status !== "open") return "closed";
  if (query.opens_at && new Date(query.opens_at).getTime() > now.getTime()) {
    return "not_yet_open";
  }
  if (query.closes_at && new Date(query.closes_at).getTime() <= now.getTime()) {
    return "closed";
  }
  return "open";
}

/**
 * What a reporter may still do to the question set.
 *
 * The rule that matters: once a submission exists, wording stays editable —
 * the first few responses are how a reporter learns what the question should
 * have said — but questions can no longer be removed or renumbered, because
 * every existing answer carries the position and wording it was given and
 * renumbering would make history ambiguous.
 */
export interface QuestionEditability {
  canAdd: boolean;
  canRemove: boolean;
  canReorder: boolean;
  /** Non-null when something above is false, phrased for the screen. */
  notice: string | null;
}

export function deriveQuestionEditability(params: {
  questionCount: number;
  submissionCount: number;
}): QuestionEditability {
  const atCeiling = params.questionCount >= MAX_QUESTIONS;
  const hasSubmissions = params.submissionCount > 0;

  const notices = [
    hasSubmissions
      ? "This query has received submissions. Wording changes apply to future participants only — existing answers keep the exact question they were asked, so questions can no longer be removed or reordered."
      : null,
    atCeiling ? `A query can have at most ${MAX_QUESTIONS} questions.` : null,
  ].filter((value): value is string => value !== null);

  return {
    canAdd: !atCeiling,
    canRemove: !hasSubmissions,
    canReorder: !hasSubmissions,
    notice: notices.length > 0 ? notices.join(" ") : null,
  };
}

/** Which status transitions the workspace offers, and what to call them. */
export function availableStatusActions(status: AlQueryStatus): AlQueryStatus[] {
  switch (status) {
    case "draft":
      return ["open"];
    case "open":
      return ["closed"];
    case "closed":
      return ["open", "archived"];
    case "archived":
      return [];
  }
}

export const STATUS_ACTION_LABEL: Record<AlQueryStatus, string> = {
  draft: "Return to draft",
  open: "Open for responses",
  closed: "Close query",
  archived: "Archive query",
};

/** Null when valid; otherwise a sentence for the screen. */
export function validateQueryInput(input: {
  internalTitle: string;
  publicTitle: string;
  opensAt?: string | null;
  closesAt?: string | null;
}): string | null {
  if (!input.internalTitle.trim()) return "Give the query an internal title.";
  if (!input.publicTitle.trim()) return "Give the query a public title.";
  if (input.opensAt && input.closesAt) {
    if (new Date(input.closesAt).getTime() <= new Date(input.opensAt).getTime()) {
      return "The closing date must be after the opening date.";
    }
  }
  return null;
}

/** Null when valid; otherwise a sentence for the screen. */
export function validateQuestionInput(input: {
  prompt: string;
  maxDurationSeconds: number;
}): string | null {
  if (!input.prompt.trim()) return "A question needs a prompt.";
  if (!Number.isInteger(input.maxDurationSeconds)) {
    return "Maximum recording length must be a whole number of seconds.";
  }
  if (
    input.maxDurationSeconds < MIN_MAX_DURATION_SECONDS ||
    input.maxDurationSeconds > MAX_MAX_DURATION_SECONDS
  ) {
    return `Maximum recording length must be between ${MIN_MAX_DURATION_SECONDS} and ${MAX_MAX_DURATION_SECONDS} seconds.`;
  }
  return null;
}

/**
 * Positions rewritten as 1..n after a move, matching how the Editorial
 * Planning settings screens reorder sort_order. Returns the new ordering; the
 * caller writes back only the rows whose position actually changed.
 */
export function reorderPositions<T extends { id: string; position: number }>(
  questions: T[],
  id: string,
  direction: "up" | "down",
): T[] {
  const ordered = [...questions].sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((question) => question.id === id);
  if (index === -1) return ordered;

  const target = direction === "up" ? index - 1 : index + 1;
  const moving = ordered[index];
  const displaced = ordered[target];
  if (!moving || !displaced) return ordered;

  ordered[index] = displaced;
  ordered[target] = moving;
  return ordered.map((question, position) => ({ ...question, position: position + 1 }));
}
