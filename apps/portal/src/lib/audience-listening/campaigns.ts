// Pure rules for campaigns: how a status reads, what each status allows, and what makes a campaign, a prompt or a tag acceptable.
// No Supabase, no React. The database checks the same shapes (al_campaigns, al_campaign_prompts and al_campaign_tags constraints);
// this is for the screens and the tests. The event-inside-the-span rule has a SQL twin, al_events_check_span().

import type { BadgeVariant } from "@/components/ui/badge";
import type { AlCampaignStatus, AlPromptKind } from "@/lib/database.types";

export const CAMPAIGN_STATUSES: readonly AlCampaignStatus[] = ["draft", "open", "closed", "archived"];

export const CAMPAIGN_STATUS_BADGE: Record<AlCampaignStatus, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "neutral" },
  open: { label: "Open", variant: "success" },
  closed: { label: "Closed", variant: "muted" },
  archived: { label: "Archived", variant: "muted" },
};

export const PROMPT_KINDS: readonly AlPromptKind[] = ["intro", "question", "prompt"];

export const PROMPT_KIND_LABEL: Record<AlPromptKind, string> = {
  intro: "Read to the table first",
  question: "The question",
  prompt: "A follow-up",
};

export const MAX_TITLE_LENGTH = 200;
export const MAX_QUESTION_LENGTH = 500;
export const MAX_INTRO_LENGTH = 4000;
export const MAX_PROMPT_LENGTH = 500;
export const MAX_HINT_LENGTH = 300;
export const MAX_SLUG_LENGTH = 60;
export const MAX_TAG_LENGTH = 40;
export const MAX_TAGS = 24;
export const MIN_PROMPT_SECONDS = 15;
export const MAX_PROMPT_SECONDS = 1800;

export function isCampaignStatus(value: string): value is AlCampaignStatus {
  return (CAMPAIGN_STATUSES as readonly string[]).includes(value);
}
export function isPromptKind(value: string): value is AlPromptKind {
  return (PROMPT_KINDS as readonly string[]).includes(value);
}

/**
 * A URL-safe slug from a title: lowercase letters and digits joined by single hyphens, at most 60 characters, never ending in a
 * hyphen. The slug is internal (the public never sees the word campaign) but it is what the website's pages key on, so it is made
 * to the same shape the database checks.
 */
export function slugify(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

export interface CampaignInput {
  title: string;
  question: string;
  slug: string;
  intro?: string;
  opensAt?: string | null;
  closesAt?: string | null;
}

/** The first thing wrong with a campaign's fields, or null. */
export function validateCampaignInput(input: CampaignInput): string | null {
  if (!input.title.trim()) return "Give the campaign a title.";
  if (input.title.trim().length > MAX_TITLE_LENGTH) return `The title can be at most ${MAX_TITLE_LENGTH} characters.`;
  if (!input.question.trim()) return "Write the question the campaign asks.";
  if (input.question.trim().length > MAX_QUESTION_LENGTH) return `The question can be at most ${MAX_QUESTION_LENGTH} characters.`;
  if ((input.intro ?? "").length > MAX_INTRO_LENGTH) return `The introduction can be at most ${MAX_INTRO_LENGTH} characters.`;
  if (!isValidSlug(input.slug)) return "The short name can use lowercase letters, digits and single hyphens, up to 60 characters.";
  if (input.opensAt && input.closesAt && Date.parse(input.closesAt) <= Date.parse(input.opensAt)) {
    return "The campaign has to close after it opens.";
  }
  return null;
}

export interface PromptInput {
  kind: string;
  text: string;
  hint?: string | null;
  suggestedSeconds?: number | null;
}

export function validatePromptInput(input: PromptInput): string | null {
  if (!isPromptKind(input.kind)) return "Choose what kind of prompt this is.";
  if (!input.text.trim()) return "Write the prompt.";
  if (input.text.trim().length > MAX_PROMPT_LENGTH) return `A prompt can be at most ${MAX_PROMPT_LENGTH} characters.`;
  if ((input.hint ?? "").length > MAX_HINT_LENGTH) return `A hint can be at most ${MAX_HINT_LENGTH} characters.`;
  const seconds = input.suggestedSeconds;
  if (seconds != null && (!Number.isInteger(seconds) || seconds < MIN_PROMPT_SECONDS || seconds > MAX_PROMPT_SECONDS)) {
    return `Suggested time is between ${MIN_PROMPT_SECONDS} seconds and ${MAX_PROMPT_SECONDS / 60} minutes.`;
  }
  return null;
}

/**
 * The tag vocabulary from what a person typed, one per line or comma-separated: trimmed, blanks dropped, repeats (ignoring case)
 * kept once in their first spelling. `tooLong` and `tooMany` name what was left out, so the screen can say so rather than silently
 * dropping a tag.
 */
export function parseTagList(text: string): { tags: string[]; tooLong: string[]; tooMany: number } {
  const seen = new Set<string>();
  const tags: string[] = [];
  const tooLong: string[] = [];
  let tooMany = 0;
  for (const raw of text.split(/[\n,]/)) {
    const label = raw.trim().replace(/\s+/g, " ");
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (label.length > MAX_TAG_LENGTH) {
      tooLong.push(label);
      continue;
    }
    if (tags.length >= MAX_TAGS) {
      tooMany += 1;
      continue;
    }
    tags.push(label);
  }
  return { tags, tooLong, tooMany };
}

export type CampaignAction = "open" | "close" | "reopen" | "archive";

export const CAMPAIGN_ACTION_LABEL: Record<CampaignAction, string> = {
  open: "Open the campaign",
  close: "Close the campaign",
  reopen: "Reopen",
  archive: "Archive",
};

/** The status each action leads to. */
export const CAMPAIGN_ACTION_TARGET: Record<CampaignAction, AlCampaignStatus> = {
  open: "open",
  close: "closed",
  reopen: "open",
  archive: "archived",
};

export function availableCampaignActions(status: AlCampaignStatus): CampaignAction[] {
  switch (status) {
    case "draft":
      return ["open"];
    case "open":
      return ["close"];
    case "closed":
      return ["reopen", "archive"];
    case "archived":
      return [];
  }
}

/**
 * Why a campaign cannot open yet, or null. A campaign with nothing to ask a table reads as a draft nobody finished, so opening
 * needs the question's prompts; the closing date, if there is one, must not already have passed.
 */
export function openingProblem(input: { promptCount: number; closesAt: string | null }, now: Date): string | null {
  if (input.promptCount < 1) return "Add at least one prompt before opening, so a table has something to be asked.";
  if (input.closesAt && Date.parse(input.closesAt) <= now.getTime()) return "The closing date has passed. Change it before opening.";
  return null;
}

/**
 * Whether an event that starts at `startsAt` is inside a campaign's span, with the sentence to show when it is not. The SQL twin is
 * al_events_check_span(); a missing bound is no bound.
 */
export function eventSpanProblem(startsAt: string, span: { opensAt: string | null; closesAt: string | null }): string | null {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return "Choose when the event starts.";
  if (span.opensAt && start < Date.parse(span.opensAt)) return "The event starts before the campaign opens.";
  if (span.closesAt && start > Date.parse(span.closesAt)) return "The event starts after the campaign closes.";
  return null;
}
