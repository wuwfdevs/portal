// Pure rules for an outcome: what came of a query, entered by staff as a title and an address. No Supabase, no
// React. The database checks the same shape (al_outcomes constraints); this is so the screen can say what is wrong
// in words before it gets there, and so the rule is written down where a test can read it.
//
// The Portal is CMS-agnostic (root CLAUDE.md): an outcome is never a reference to a record in any CMS, only text.

import type { AlOutcomeKind } from "@/lib/database.types";

export const OUTCOME_KINDS: readonly AlOutcomeKind[] = ["story", "episode", "report"];

export const OUTCOME_KIND_LABEL: Record<AlOutcomeKind, string> = {
  story: "A story",
  episode: "An episode",
  report: "A report",
};

export const MAX_OUTCOME_TITLE_LENGTH = 200;
export const MAX_OUTCOME_SUMMARY_LENGTH = 600;
export const MAX_OUTCOME_URL_LENGTH = 2000;

export interface OutcomeInput {
  kind: string;
  title: string;
  url: string;
  summary: string | null;
  /** `YYYY-MM-DD`. */
  publishedAt: string;
}

export function isOutcomeKind(value: string): value is AlOutcomeKind {
  return (OUTCOME_KINDS as readonly string[]).includes(value);
}

/** An https address with no credentials in it, as a reader is sent to it. Returns null if it is not one. */
export function normalizeOutcomeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_OUTCOME_URL_LENGTH || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** A calendar date as `YYYY-MM-DD` that really exists (not 2026-02-31). */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The sentence for the first thing wrong, or null when the outcome can be saved. */
export function validateOutcomeInput(input: OutcomeInput): string | null {
  if (!isOutcomeKind(input.kind)) return "Choose whether this is a story, an episode or a report.";
  const title = input.title.trim();
  if (title.length === 0) return "Give the outcome a title.";
  if (title.length > MAX_OUTCOME_TITLE_LENGTH) return `The title can be at most ${MAX_OUTCOME_TITLE_LENGTH} characters.`;
  if (normalizeOutcomeUrl(input.url) === null) {
    return "The address must be a full https:// link with no spaces, and no name or password in it.";
  }
  if (!isCalendarDate(input.publishedAt)) return "Enter the date it was published.";
  if (input.summary !== null && input.summary.length > MAX_OUTCOME_SUMMARY_LENGTH) {
    return `The summary can be at most ${MAX_OUTCOME_SUMMARY_LENGTH} characters.`;
  }
  return null;
}
