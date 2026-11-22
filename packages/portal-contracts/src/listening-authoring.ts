// Listening authoring: the first staff action (staff-actions.ts holds what every staff action shares: the secret, the actor, the refusal codes).
// Staff write a listening query (its titles, intro, window and up to five questions) and open or close it from the CMS's block editor, instead of
// switching to the Portal. The Portal still owns the data and every rule: the CMS holds nothing, and all it sends is what a staff member typed.
// The tool whose grant the Portal checks for these calls is Audience Listening.
//
// WHAT IS NOT HERE. Who is asked for what (name, email, phone, city), the consent wording, transcription, the hub listing and a public
// event stay in the Portal's own screens and keep their defaults on a query made here. A query made here is a draft until someone opens it.
//
// Types and light shape checks only. Each side validates what it receives.

import type { StaffActionResult, StaffActionRequestBase } from "./staff-actions";

/** Paths the Portal exposes for this channel. All are POST with a JSON body, signed over that exact body (signing.ts). */
export const LISTENING_AUTHORING_PATHS = {
  list: "/api/site/staff/listening/list",
  get: "/api/site/staff/listening/get",
  save: "/api/site/staff/listening/save",
  setStatus: "/api/site/staff/listening/set-status",
} as const;

export type ListeningAuthoringPath = (typeof LISTENING_AUTHORING_PATHS)[keyof typeof LISTENING_AUTHORING_PATHS];

/** The Portal's actions, as the route's last segment. */
export const LISTENING_AUTHORING_ACTIONS = ["list", "get", "save", "set-status"] as const;
export type ListeningAuthoringAction = (typeof LISTENING_AUTHORING_ACTIONS)[number];

/** The Portal's limits, repeated so the site's form can say them before a request is sent. The Portal enforces them again. */
export const AUTHORING_MAX_QUESTIONS = 5;
export const AUTHORING_MIN_DURATION_SECONDS = 15;
export const AUTHORING_MAX_DURATION_SECONDS = 600;
export const AUTHORING_DEFAULT_DURATION_SECONDS = 120;
export const AUTHORING_MAX_TITLE_LENGTH = 200;
export const AUTHORING_MAX_INTRO_LENGTH = 2000;
export const AUTHORING_MAX_PROMPT_LENGTH = 500;
export const AUTHORING_MAX_GUIDANCE_LENGTH = 500;
export const AUTHORING_MAX_LABEL_LENGTH = 120;
export const AUTHORING_MAX_NOTES_LENGTH = 2000;

export type ListeningAuthoringRequestBase = StaffActionRequestBase;

/** The Portal's AlQueryStatus. Only the Portal decides what a query may become (opening needs a question). */
export const AUTHORING_STATUSES = ["draft", "open", "closed", "archived"] as const;
export type ListeningAuthoringStatus = (typeof AUTHORING_STATUSES)[number];

export function isListeningAuthoringStatus(value: unknown): value is ListeningAuthoringStatus {
  return typeof value === "string" && (AUTHORING_STATUSES as readonly string[]).includes(value);
}

/** What an editor types about one question. `id` is present for a question the Portal already holds, absent for a new one. */
export interface ListeningAuthoringQuestionInput {
  id?: string;
  prompt: string;
  guidance: string | null;
  required: boolean;
  maxDurationSeconds: number;
}

/** What an editor types about the query itself. Timestamps are ISO 8601 or null. */
export interface ListeningAuthoringQueryInput {
  internalTitle: string;
  publicTitle: string;
  publicIntro: string;
  internalNotes: string | null;
  askedBy: string | null;
  fromLabel: string | null;
  contextLabel: string | null;
  allowTextAnswers: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export interface ListeningAuthoringQuestion extends ListeningAuthoringQuestionInput {
  id: string;
  position: number;
}

/** One query as staff see it: the typed fields, plus what the Portal decides (the code, the status, how many have answered). */
export interface ListeningAuthoringQuery extends ListeningAuthoringQueryInput {
  publicId: string;
  status: ListeningAuthoringStatus;
  submissionCount: number;
  updatedAt: string;
  questions: ListeningAuthoringQuestion[];
}

/** A row of the picker: enough to choose by, nothing more. */
export interface ListeningAuthoringSummary {
  publicId: string;
  internalTitle: string;
  publicTitle: string;
  status: ListeningAuthoringStatus;
  questionCount: number;
  updatedAt: string;
}

export type ListeningAuthoringResult<T> = StaffActionResult<T>;

export type ListeningAuthoringListRequest = ListeningAuthoringRequestBase;
export type ListeningAuthoringListResponse = ListeningAuthoringResult<{ queries: ListeningAuthoringSummary[] }>;

export interface ListeningAuthoringGetRequest extends ListeningAuthoringRequestBase {
  publicId: string;
}
export type ListeningAuthoringGetResponse = ListeningAuthoringResult<{ query: ListeningAuthoringQuery }>;

/**
 * Create (no `publicId`) or change (with one) a query, with its questions in order. Questions that carry an `id` are updated, those without
 * one are added, and a held question that is missing is removed. A query that already has submissions keeps every question it has: the
 * answers refer to them, so the Portal refuses a removal or a reorder with `conflict` and lets the wording be edited.
 */
export interface ListeningAuthoringSaveRequest extends ListeningAuthoringRequestBase {
  publicId?: string;
  query: ListeningAuthoringQueryInput;
  questions: ListeningAuthoringQuestionInput[];
}
export type ListeningAuthoringSaveResponse = ListeningAuthoringResult<{ query: ListeningAuthoringQuery; created: boolean }>;

export interface ListeningAuthoringSetStatusRequest extends ListeningAuthoringRequestBase {
  publicId: string;
  status: ListeningAuthoringStatus;
}
export type ListeningAuthoringSetStatusResponse = ListeningAuthoringResult<{ query: ListeningAuthoringQuery }>;
