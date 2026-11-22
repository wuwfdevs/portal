import {
  STAFF_ACTOR_ID,
  AUTHORING_MAX_GUIDANCE_LENGTH,
  AUTHORING_MAX_INTRO_LENGTH,
  AUTHORING_MAX_LABEL_LENGTH,
  AUTHORING_MAX_NOTES_LENGTH,
  AUTHORING_MAX_PROMPT_LENGTH,
  AUTHORING_MAX_QUESTIONS,
  AUTHORING_MAX_TITLE_LENGTH,
  isListeningAuthoringStatus,
  type ListeningAuthoringAction,
  type ListeningAuthoringQueryInput,
  type ListeningAuthoringQuestionInput,
  type ListeningAuthoringStatus,
} from "@wuwf/portal-contracts";
import { validateQueryInput, validateQuestionInput } from "@/lib/audience-listening/query-state";

/**
 * The pure half of the site's signed listening authoring (a staff action; packages/portal-contracts, listening-authoring.ts): reading a request into typed
 * values, applying the same rules the staff screens apply (validateQueryInput, validateQuestionInput, the five-question ceiling, no removing or
 * reordering once a query has submissions, no opening an empty query), and working out what a save changes. No database and no `server-only`,
 * so every rule here is tested; authoring-api.ts only carries the result to the tables.
 */

export interface ParseProblem {
  ok: false;
  /** `invalid` carries a sentence for the person who typed it. */
  error: "invalid";
  message: string;
}

export type Parsed<T> = { ok: true; value: T } | ParseProblem;

const problem = (message: string): ParseProblem => ({ ok: false, error: "invalid", message });
const PUBLIC_ID = /^[a-z0-9]{16}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** A required string, trimmed, within a length. */
function text(value: unknown, label: string, max: number): Parsed<string> {
  if (typeof value !== "string") return problem(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) return problem(`${label} can be at most ${max} characters.`);
  return { ok: true, value: trimmed };
}

/** An optional string: empty or missing is null. */
function optionalText(value: unknown, label: string, max: number): Parsed<string | null> {
  if (value === null || value === undefined) return { ok: true, value: null };
  const parsed = text(value, label, max);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value === "" ? null : parsed.value };
}

function optionalTimestamp(value: unknown, label: string): Parsed<string | null> {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) return problem(`${label} is not a date and time.`);
  return { ok: true, value: new Date(value).toISOString() };
}

export function parseActor(value: unknown): Parsed<string> {
  const actor = asRecord(value);
  const id = actor?.["portalUserId"];
  if (typeof id !== "string" || !STAFF_ACTOR_ID.test(id)) return problem("Who is making this change could not be read.");
  return { ok: true, value: id.toLowerCase() };
}

export function parseQueryInput(value: unknown): Parsed<ListeningAuthoringQueryInput> {
  const raw = asRecord(value);
  if (!raw) return problem("The question's details are missing.");

  const internalTitle = text(raw["internalTitle"], "The internal title", AUTHORING_MAX_TITLE_LENGTH);
  if (!internalTitle.ok) return internalTitle;
  const publicTitle = text(raw["publicTitle"], "The public title", AUTHORING_MAX_TITLE_LENGTH);
  if (!publicTitle.ok) return publicTitle;
  const publicIntro = text(raw["publicIntro"] ?? "", "The introduction", AUTHORING_MAX_INTRO_LENGTH);
  if (!publicIntro.ok) return publicIntro;
  const internalNotes = optionalText(raw["internalNotes"], "The internal notes", AUTHORING_MAX_NOTES_LENGTH);
  if (!internalNotes.ok) return internalNotes;
  const askedBy = optionalText(raw["askedBy"], "Who is asking", AUTHORING_MAX_LABEL_LENGTH);
  if (!askedBy.ok) return askedBy;
  const fromLabel = optionalText(raw["fromLabel"], "Where it is from", AUTHORING_MAX_LABEL_LENGTH);
  if (!fromLabel.ok) return fromLabel;
  const contextLabel = optionalText(raw["contextLabel"], "What it belongs to", AUTHORING_MAX_LABEL_LENGTH);
  if (!contextLabel.ok) return contextLabel;
  const opensAt = optionalTimestamp(raw["opensAt"], "The opening time");
  if (!opensAt.ok) return opensAt;
  const closesAt = optionalTimestamp(raw["closesAt"], "The closing time");
  if (!closesAt.ok) return closesAt;
  if (typeof raw["allowTextAnswers"] !== "boolean") return problem("Whether people may write an answer must be yes or no.");

  const rule = validateQueryInput({ internalTitle: internalTitle.value, publicTitle: publicTitle.value, opensAt: opensAt.value, closesAt: closesAt.value });
  if (rule) return problem(rule);

  return {
    ok: true,
    value: {
      internalTitle: internalTitle.value,
      publicTitle: publicTitle.value,
      publicIntro: publicIntro.value,
      internalNotes: internalNotes.value,
      askedBy: askedBy.value,
      fromLabel: fromLabel.value,
      contextLabel: contextLabel.value,
      allowTextAnswers: raw["allowTextAnswers"],
      opensAt: opensAt.value,
      closesAt: closesAt.value,
    },
  };
}

export function parseQuestionInputs(value: unknown): Parsed<ListeningAuthoringQuestionInput[]> {
  if (!Array.isArray(value)) return problem("The questions are missing.");
  if (value.length > AUTHORING_MAX_QUESTIONS) return problem(`A query can have at most ${AUTHORING_MAX_QUESTIONS} questions.`);
  const questions: ListeningAuthoringQuestionInput[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const raw = asRecord(entry);
    const label = `Question ${index + 1}`;
    if (!raw) return problem(`${label} could not be read.`);
    const prompt = text(raw["prompt"], `${label}`, AUTHORING_MAX_PROMPT_LENGTH);
    if (!prompt.ok) return prompt;
    const guidance = optionalText(raw["guidance"], `${label}'s guidance`, AUTHORING_MAX_GUIDANCE_LENGTH);
    if (!guidance.ok) return guidance;
    if (typeof raw["required"] !== "boolean") return problem(`${label}: whether it is required must be yes or no.`);
    const maxDurationSeconds = raw["maxDurationSeconds"];
    if (typeof maxDurationSeconds !== "number") return problem(`${label}: the longest recording must be a number of seconds.`);
    const rule = validateQuestionInput({ prompt: prompt.value, maxDurationSeconds });
    if (rule) return problem(`${label}: ${rule}`);
    const id = raw["id"];
    if (id !== undefined && id !== null) {
      if (typeof id !== "string" || !UUID.test(id)) return problem(`${label} has an id that is not recognised.`);
      const lower = id.toLowerCase();
      if (seen.has(lower)) return problem(`${label} appears twice.`);
      seen.add(lower);
      questions.push({ id: lower, prompt: prompt.value, guidance: guidance.value, required: raw["required"], maxDurationSeconds });
    } else {
      questions.push({ prompt: prompt.value, guidance: guidance.value, required: raw["required"], maxDurationSeconds });
    }
  }
  return { ok: true, value: questions };
}

export function parsePublicId(value: unknown): Parsed<string> {
  return typeof value === "string" && PUBLIC_ID.test(value) ? { ok: true, value } : problem("That question's code is not valid.");
}

export type AuthoringCall =
  | { action: "list"; actor: string }
  | { action: "get"; actor: string; publicId: string }
  | { action: "save"; actor: string; publicId: string | null; query: ListeningAuthoringQueryInput; questions: ListeningAuthoringQuestionInput[] }
  | { action: "set-status"; actor: string; publicId: string; status: ListeningAuthoringStatus };

/** Reads a request body for an action, or says in a sentence what is wrong with it. */
export function parseAuthoringRequest(action: ListeningAuthoringAction, json: unknown): Parsed<AuthoringCall> {
  const body = asRecord(json);
  if (!body) return problem("The request could not be read.");
  const actor = parseActor(body["actor"]);
  if (!actor.ok) return actor;

  switch (action) {
    case "list":
      return { ok: true, value: { action, actor: actor.value } };
    case "get": {
      const publicId = parsePublicId(body["publicId"]);
      if (!publicId.ok) return publicId;
      return { ok: true, value: { action, actor: actor.value, publicId: publicId.value } };
    }
    case "save": {
      let publicId: string | null = null;
      if (body["publicId"] !== undefined && body["publicId"] !== null) {
        const parsed = parsePublicId(body["publicId"]);
        if (!parsed.ok) return parsed;
        publicId = parsed.value;
      }
      const query = parseQueryInput(body["query"]);
      if (!query.ok) return query;
      const questions = parseQuestionInputs(body["questions"]);
      if (!questions.ok) return questions;
      return { ok: true, value: { action, actor: actor.value, publicId, query: query.value, questions: questions.value } };
    }
    case "set-status": {
      const publicId = parsePublicId(body["publicId"]);
      if (!publicId.ok) return publicId;
      const status = body["status"];
      if (!isListeningAuthoringStatus(status)) return problem("That isn't a status a question can be in.");
      return { ok: true, value: { action, actor: actor.value, publicId: publicId.value, status } };
    }
  }
}

// What a save changes -----------------------------------------------------------

export interface HeldQuestion {
  id: string;
  position: number;
}

export interface QuestionPlan {
  /** Held questions to delete, by id. */
  remove: string[];
  /** Held questions to rewrite, with the position each ends in. */
  update: Array<{ id: string; position: number; input: ListeningAuthoringQuestionInput }>;
  /** New questions, with the position each takes. */
  add: Array<{ position: number; input: ListeningAuthoringQuestionInput }>;
}

export type PlanResult = { ok: true; plan: QuestionPlan } | { ok: false; error: "invalid" | "conflict"; message: string };

const HAS_SUBMISSIONS_REMOVE =
  "This question already has answers, so questions can no longer be removed. Existing answers keep the exact question they were asked.";
const HAS_SUBMISSIONS_REORDER = "This question already has answers, so questions can no longer be reordered.";

/**
 * Compares the questions the Portal holds with the ones a save sends, in the order the editor arranged them. Positions end as 1..n in that
 * order. A question that carries an id the query does not hold is refused (it belongs to another query, or was removed in another window). Once
 * the query has submissions a removal or a reorder is a `conflict`: the answers refer to those questions, as in the staff screens.
 */
export function planQuestionChanges(held: readonly HeldQuestion[], desired: readonly ListeningAuthoringQuestionInput[], hasSubmissions: boolean): PlanResult {
  const heldIds = new Set(held.map((q) => q.id.toLowerCase()));
  const keptIds = new Set<string>();
  for (const q of desired) {
    if (q.id === undefined) continue;
    if (!heldIds.has(q.id.toLowerCase())) {
      return { ok: false, error: "invalid", message: "A question in this form is no longer part of this query. Reload it and try again." };
    }
    keptIds.add(q.id.toLowerCase());
  }
  const remove = held.filter((q) => !keptIds.has(q.id.toLowerCase())).map((q) => q.id);
  if (remove.length > 0 && hasSubmissions) return { ok: false, error: "conflict", message: HAS_SUBMISSIONS_REMOVE };

  if (hasSubmissions) {
    // Held questions must keep their order, and new ones may only come after them.
    const order = [...held].sort((a, b) => a.position - b.position).map((q) => q.id.toLowerCase());
    const sent = desired.filter((q) => q.id !== undefined).map((q) => q.id!.toLowerCase());
    const lastHeld = desired.reduce((last, q, i) => (q.id === undefined ? last : i), -1);
    const addedBefore = desired.slice(0, lastHeld + 1).some((q) => q.id === undefined);
    if (sent.join() !== order.join() || addedBefore) return { ok: false, error: "conflict", message: HAS_SUBMISSIONS_REORDER };
  }

  const update: QuestionPlan["update"] = [];
  const add: QuestionPlan["add"] = [];
  desired.forEach((input, index) => {
    const position = index + 1;
    if (input.id === undefined) add.push({ position, input });
    else update.push({ id: input.id, position, input });
  });
  return { ok: true, plan: { remove, update, add } };
}

/** Whether a status change may happen. Opening needs a question: a live public page with nothing to answer is worse than a draft. */
export function statusChangeProblem(status: ListeningAuthoringStatus, questionCount: number): string | null {
  if (status === "open" && questionCount === 0) return "Add at least one question before opening it.";
  return null;
}
