import "server-only";
import OpenAI from "openai";

// Editorial Inquiry's three model-backed operations: generate a sibling
// question (Explore), generate a child question (Drill down), and take one
// turn in a question's discuss thread. Reuses the `openai` dependency
// src/lib/agent/chat.ts already brought in, but the calling shape is
// different on purpose — see docs/editorial-inquiry-design.md §3. The agent
// chat is a streamed, free-text tool-calling loop; every call here has one
// well-defined answer shape, so this is this repo's first use of the
// Responses API's JSON-schema structured output
// (`text.format.type: "json_schema"`) rather than parsing free text. Calls
// are synchronous `responses.create()`, not streamed — a generated question
// or a discuss reply is a few sentences, not worth token-by-token rendering,
// and it keeps the plain "await, then return a result" Server Action shape
// the canvas UI already uses for every other mutation.
//
// Same optional-key posture as every other integration in this repo: absent
// OPENAI_API_KEY, every call here throws the same message chat.ts's
// getOpenAIClient() throws, so an AI-backed action fails clearly rather than
// silently doing nothing.

const MODEL = "gpt-5.4-mini";
const MAX_OUTPUT_TOKENS = 1024;

const VOICE =
  'You are an editorial research assistant for a public radio newsroom, in NPR-member-station voice: calm, factual, precise, investigatable. No hype, no rhetorical flourishes, no emoji. A "story question" is something a reporter could actually go find out — specific enough to eventually point at documents, people, or data, not just a topic restated as a question.';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("The assistant isn't configured yet — OPENAI_API_KEY is not set.");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

/** Everything a generation or discuss call needs to answer well — see design doc §3. */
export interface QuestionContext {
  seedQuestion: string;
  /** Root-first path down to the question being acted on, the last entry. */
  ancestry: { depth: number; text: string }[];
  /** Active siblings/children already at this position, so the model doesn't repeat an angle. */
  existingRelated: string[];
  /** Context notes inherited down this branch (own + every ancestor's). */
  inheritedContext: { kind: string; body: string }[];
}

function contextBlock(context: QuestionContext): string {
  const ancestryLines = context.ancestry.map((a) => `- (depth ${a.depth}) ${a.text}`).join("\n");
  const existing = context.existingRelated.length
    ? context.existingRelated.map((t) => `- ${t}`).join("\n")
    : "(none yet)";
  const notes = context.inheritedContext.length
    ? context.inheritedContext.map((n) => `- [${n.kind}] ${n.body}`).join("\n")
    : "(none)";
  return `Guiding question for the whole inquiry: "${context.seedQuestion}"

Path from the guiding question down to the question being acted on (the last line is the one being acted on):
${ancestryLines}

Already at this position in the tree — do not repeat one of these angles:
${existing}

Context notes attached to this branch:
${notes}`;
}

function failedResponseError(response: {
  status?: string;
  error?: { message?: string } | null;
}): Error {
  return new Error(response.error?.message ?? "The assistant failed to respond.");
}

export interface GeneratedQuestion {
  text: string;
  hasAssumption: boolean;
  assumptionText: string | null;
}

const GENERATED_QUESTION_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string" },
    has_assumption: { type: "boolean" },
    assumption_text: { type: ["string", "null"] },
  },
  required: ["question", "has_assumption", "assumption_text"],
  additionalProperties: false,
} as const;

/** Explore (a sibling angle) or drill down (a narrower child) — one new question. */
export async function generateRelatedQuestion(
  kind: "sibling" | "child",
  context: QuestionContext,
): Promise<GeneratedQuestion> {
  const client = getOpenAIClient();
  const instructions =
    kind === "sibling"
      ? `${VOICE}\n\nGenerate ONE new sibling question for the question being acted on: a different angle at the same level, under the same parent — not narrower, not broader, a genuinely different way in. If the new question quietly rests on an assumption worth flagging, say so.`
      : `${VOICE}\n\nGenerate ONE new child question for the question being acted on: something one level more specific that narrows it toward a concrete, reportable story question. If the new question quietly rests on an assumption worth flagging, say so.`;

  const response = await client.responses.create({
    model: MODEL,
    instructions,
    input: contextBlock(context),
    max_output_tokens: MAX_OUTPUT_TOKENS,
    reasoning: { effort: "low" },
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "generated_question",
        schema: GENERATED_QUESTION_SCHEMA,
        strict: true,
      },
    },
  });

  if (response.status === "failed") throw failedResponseError(response);

  const parsed = JSON.parse(response.output_text) as {
    question: string;
    has_assumption: boolean;
    assumption_text: string | null;
  };
  return {
    text: parsed.question.trim(),
    hasAssumption: parsed.has_assumption,
    assumptionText: parsed.has_assumption ? parsed.assumption_text : null,
  };
}

export interface ChatTurnMessage {
  role: "user" | "assistant";
  body: string;
}

export type DiscussAction =
  | { kind: "reframe"; text: string }
  | { kind: "sibling"; text: string }
  | { kind: "context"; text: string }
  | null;

export interface DiscussResult {
  reply: string;
  action: DiscussAction;
}

const DISCUSS_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    action: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["none", "reframe", "sibling", "context"] },
        text: { type: ["string", "null"] },
      },
      required: ["kind", "text"],
      additionalProperties: false,
    },
  },
  required: ["reply", "action"],
  additionalProperties: false,
} as const;

/**
 * One turn of a discuss thread scoped to one question. The model may reply
 * plainly, or additionally propose a reframe (the reporter applies it with a
 * click — never automatic), spin off a sibling, or attach a context note
 * (both of the latter execute immediately, per design doc §2/§4).
 */
export async function runDiscussTurn(
  question: { text: string; hasAssumption: boolean; assumptionText: string | null },
  context: QuestionContext,
  priorMessages: ChatTurnMessage[],
  userMessage: string,
): Promise<DiscussResult> {
  const client = getOpenAIClient();
  const assumptionNote = question.hasAssumption
    ? ` It's currently flagged as resting on an assumption: "${question.assumptionText}".`
    : "";
  const instructions = `${VOICE}

You are discussing exactly one question with the reporter: "${question.text}"${assumptionNote}

Reply plainly to what the reporter said — challenge an assumption, concede a fair point, or just answer. You may, at most once per turn, additionally take ONE of these actions:
- "reframe": propose a rewritten version of THIS question for the reporter to apply — use this when they've surfaced a real problem with how it's framed. You are proposing it, not applying it.
- "sibling": spin off a new, different-angle question at the same level as this one, under the same parent — use this when the discussion surfaces a genuinely different angle worth its own branch (e.g. another stakeholder's perspective). Executes immediately.
- "context": attach what the reporter just told you as a context note on this question's branch — use this when they've given you a fact, source, or observation worth remembering rather than something that changes the question itself. Executes immediately.
- "none": just reply, no tree action.

When you take an action, "text" is the full text of the reframe/sibling question or the context note's body. Otherwise "text" is null.

Prior conversation on this question, oldest first:
${priorMessages.map((m) => `${m.role}: ${m.body}`).join("\n") || "(none yet)"}

${contextBlock(context)}`;

  const response = await client.responses.create({
    model: MODEL,
    instructions,
    input: userMessage,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    reasoning: { effort: "low" },
    store: false,
    text: {
      format: { type: "json_schema", name: "discuss_turn", schema: DISCUSS_SCHEMA, strict: true },
    },
  });

  if (response.status === "failed") throw failedResponseError(response);

  const parsed = JSON.parse(response.output_text) as {
    reply: string;
    action: { kind: "none" | "reframe" | "sibling" | "context"; text: string | null };
  };
  const action: DiscussAction =
    parsed.action.kind === "none" || !parsed.action.text
      ? null
      : { kind: parsed.action.kind, text: parsed.action.text.trim() };
  return { reply: parsed.reply.trim(), action };
}
