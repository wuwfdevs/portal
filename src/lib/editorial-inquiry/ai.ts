import "server-only";
import OpenAI from "openai";
import { humanizeOpenAIError } from "@/lib/openai-error";
import type { DiagnosisKind, EvidentiaryStatus } from "./tree";

// Editorial Inquiry's reasoning engine — one function, runEditorialTurn(),
// handles Branch, Drill down, Evaluate, and every ordinary Discuss turn. See
// docs/editorial-inquiry-design.md §7 for the full rationale; the short
// version: milestone 1 used the Responses API's strict JSON-schema structured
// output (text.format.type: "json_schema") for two separate calls (a
// generator and a discuss turn). That approach can't cleanly produce natural
// prose with inline web citations alongside an optional structural action, so
// this revision uses the API's ordinary tool-calling shape instead — the same
// general mechanism src/lib/agent/chat.ts already uses for the in-portal
// agent, purpose-built here with a narrower, fixed tool set:
//
//   - `web_search` — OpenAI's built-in tool. Resolved entirely server-side
//     within the same API call; nothing in this repo executes a search or
//     holds a search-provider key. Citations arrive as `url_citation`
//     annotations on the reply's output text.
//   - `propose_editorial_action` — a custom function tool, strict JSON
//     schema. The model's one chance per turn to propose a structural action
//     (branch/drilldown/context/reframe/diagnosis/assessment). Calling it is
//     always optional (tool_choice: "auto") — a turn with no call is a plain
//     reply, which is a decline by construction, not a special case to detect
//     (design doc §6 "Letting the model decline").
//
// One responses.stream() call therefore returns, in one round trip: zero or
// more resolved web searches, a prose reply with citations, and at most one
// proposed action. The reply streams token-by-token (the same
// ResponseStream/finalResponse() pattern src/lib/agent/chat.ts uses) so the
// route can forward deltas to the browser while web search and reasoning are
// still running. Nothing about a proposed action executes itself — the
// caller (this tool's turn.ts) reads it from the final response and performs
// the matching write, exactly as milestone 1's discuss turn already did.
//
// Same optional-key posture as every integration in this repo: absent
// OPENAI_API_KEY, every call here throws the same message chat.ts's
// getOpenAIClient() throws.

const MODEL = "gpt-5.4-mini";
const MAX_OUTPUT_TOKENS = 2048;

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

export type TurnMode = "discuss" | "branch" | "drilldown" | "evaluate";

export interface AncestryEntry {
  depth: number;
  text: string;
}

export interface InheritedNoteContext {
  kind: string;
  body: string;
  evidentiaryStatus: EvidentiaryStatus;
  sourceTitle: string | null;
  sourceUrl: string | null;
}

export interface EditorialCriterionContext {
  name: string;
  description: string;
  guidance: string | null;
}

export interface ChatTurnMessage {
  role: "user" | "assistant";
  body: string;
}

/** Everything one reasoning call needs — see design doc §7. */
export interface EditorialTurnContext {
  pillarName: string;
  guidingQuestion: string;
  /** Root-first path down to the question being acted on, the last entry. */
  ancestry: AncestryEntry[];
  /** Context notes inherited down this branch (own + every ancestor's), labeled by evidentiary status. */
  inheritedContext: InheritedNoteContext[];
  /** Active siblings (for branch) or children (for drilldown) already at this position, to avoid duplicating. */
  existingRelated: string[];
  /** Prior turns in this question's discuss thread, oldest first. */
  priorMessages: ChatTurnMessage[];
  /** WUWF's current core editorial criteria, from Editorial Planning — prose guidance, never a scoring target. */
  criteria: EditorialCriterionContext[];
}

export interface ProposedAction {
  kind: "branch" | "drilldown" | "context" | "reframe" | "diagnosis" | "assessment";
  text: string | null;
  evidentiaryStatus: EvidentiaryStatus | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  diagnosisKind: DiagnosisKind | null;
}

export interface TurnCitation {
  title: string;
  url: string;
}

export interface EditorialTurnResult {
  reply: string;
  citations: TurnCitation[];
  action: ProposedAction | null;
}

/** What streamEditorialTurn yields: reply tokens as they arrive, then exactly one terminal result. */
export type ReasoningStreamEvent =
  { type: "delta"; text: string } | { type: "result"; result: EditorialTurnResult };

const DIAGNOSIS_KINDS = [
  "still_thematic",
  "too_broad",
  "compound_question",
  "unverified_premise",
  "already_known",
  "unclear_stakes",
  "no_uncertainty",
  "implausible_reporting_path",
  "trivial",
  "descriptive_not_investigative",
] as const;

const EVIDENTIARY_STATUSES = [
  "hunch",
  "source_claim",
  "established_fact",
  "web_finding",
  "inference",
  "open_question",
] as const;

const VOICE = `You are an editorial reasoning assistant for WUWF, the public radio station serving Pensacola and Northwest Florida, in NPR-member-station voice: calm, factual, precise, investigatable. No hype, no rhetorical flourishes, no emoji. When you search the web, prioritize current, attributable developments in WUWF's own coverage area — local and regional sources over national think-pieces.

ALWAYS write a short prose reply for the reporter, even when you call propose_editorial_action — your reply text is the only thing they read directly; a tool call with no accompanying prose reads as a blank message. Plain markdown formatting (short paragraphs, **bold**, lists) is fine; keep it tight.`;

const REASONING_ORDER = `Your reasoning must follow this order, every time — never skip straight from the guiding question to a plausible-sounding invented question:

  REAL-WORLD SIGNAL (something the reporter brought, or something you found)
          +
  WUWF'S GUIDING QUESTION (the durable question this whole inquiry organizes)
          ->
  WHAT IS ACTUALLY KNOWN?
          ->
  WHAT REMAINS UNKNOWN OR UNRESOLVED?
          ->
  LINES OF INQUIRY
          ->
  PROPERLY SCOPED STORY QUESTIONS
          ->
  EDITORIAL EVALUATION

A branch or drill-down you propose has to trace back to something in that chain — the inherited context on the branch it's growing from, or something you just found by searching. You are not entitled to invent a new factual premise just to justify another branch existing. If the material on hand doesn't support a genuinely different or narrower angle, say so plainly instead of manufacturing one — declining is a normal, expected outcome, not a failure.`;

const EDITORIAL_LEVELS = `Three levels, and it matters which one a question is at:

- GUIDING QUESTION: durable, broad, organizes sustained coverage over time. Intentionally too large for one story. Never something you propose — it comes from a WUWF coverage pillar.
- LINE OF INQUIRY: a meaningful dimension, tension, mechanism, uncertainty, change, or relationship within the guiding question. Capable of producing multiple stories over time. Normally still too broad to be one central reporting question on its own.
- STORY QUESTION: the central unknown of one finite reporting project. A GOOD one is: genuinely open (not answer-presupposing), specific enough to investigate, consequential, appropriately bounded, grounded in a real uncertainty/tension/mechanism/decision/change/discrepancy, answerable through realistic reporting (sources, documents, records, data, observation), capable of producing discovery rather than illustrating something already known, and clear enough that a reporter can tell what evidence would answer it.

Tree depth describes structure, not editorial quality. A deeply-nested question can still be a bad story question; a shallow one a reporter has genuinely narrowed through conversation can be ready sooner than its position suggests. Never treat "this has been drilled down enough times" as a substitute for actually checking the criteria above.`;

const DIAGNOSIS_GUIDE = `When a question is not yet a strong story question, name the specific reason rather than handing back a vaguer restatement. The ten recognized reasons: still_thematic (still a topic/theme, not an investigable question), too_broad, compound_question (actually contains two or three separate questions), unverified_premise (assumes something not yet confirmed), already_known (the answer is already substantially established), unclear_stakes, no_uncertainty (nothing genuinely unresolved), implausible_reporting_path (no realistic way to actually answer it), trivial (specific but not consequential), descriptive_not_investigative (would produce description rather than discovery). When you diagnose one of these, try to fix that SPECIFIC problem when you propose a branch or drill-down — narrow a compound question into its real parts, name what needs verifying first, surface the actual uncertainty — not a generic narrower paraphrase.`;

const EVIDENTIARY_DISCIPLINE = `Context attached to this inquiry is not all the same kind of true. Classify everything by evidentiary status: hunch (a reporter's instinct, nothing behind it yet), source_claim (something a source said, not independently verified), established_fact (confirmed from material the reporter trusts), web_finding (found via your own web search — always keep the title/URL), inference (something reasoned to, not directly observed), open_question (a known unknown, not a claim at all). NEVER treat a hunch or source_claim as though it were an established_fact when reasoning about what's actually known — that is exactly the failure this discipline exists to prevent. When you attach new context, classify it honestly; when a reporter's own words assert something as fact, and it hasn't been verified, treat it as a hunch or source_claim, not a fact, even if they state it confidently.`;

function criteriaBlock(criteria: EditorialCriterionContext[]): string {
  if (criteria.length === 0) {
    return "(WUWF's current editorial criteria are not available right now — reason about newsworthiness and public value in general terms instead.)";
  }
  const lines = criteria
    .map((c) => `- ${c.name}: ${c.description}${c.guidance ? ` (${c.guidance})` : ""}`)
    .join("\n");
  return `WUWF's current core editorial criteria — this is what WUWF considers strong journalism. Use it to INFORM judgment and critique. Never treat it as a target to reverse-engineer: do not shape a question to sound like it would score well against these criteria, and never emit a score or numeric rating against them yourself.\n${lines}`;
}

function contextBlock(context: EditorialTurnContext): string {
  const ancestryLines = context.ancestry.map((a) => `- (depth ${a.depth}) ${a.text}`).join("\n");
  const existing = context.existingRelated.length
    ? context.existingRelated.map((t) => `- ${t}`).join("\n")
    : "(none yet)";
  const notes = context.inheritedContext.length
    ? context.inheritedContext
        .map((n) => {
          const source = n.sourceUrl ? ` [${n.sourceTitle ?? n.sourceUrl}](${n.sourceUrl})` : "";
          return `- [${n.evidentiaryStatus}] ${n.body}${source}`;
        })
        .join("\n")
    : "(none)";

  return `WUWF coverage pillar: ${context.pillarName}
Guiding question for the whole inquiry: "${context.guidingQuestion}"

Path from the guiding question down to the question being acted on (the last line is the one being acted on):
${ancestryLines}

Already at this position in the tree — do not duplicate one of these angles:
${existing}

Context inherited on this branch, each labeled with its evidentiary status:
${notes}

${criteriaBlock(context.criteria)}`;
}

const MODE_FRAMING: Record<TurnMode, string> = {
  discuss: `This is an ordinary discuss turn. Reply to what the reporter said — challenge an assumption, concede a fair point, distinguish a claim from a fact, identify what evidence is missing, search the web if current information would help answer them, or just answer plainly. You may, at most once, additionally propose ONE structural action via propose_editorial_action if the conversation genuinely warrants one (a branch, a drill-down, attaching what they told you as context, a reframe, a diagnosis of what's blocking readiness, or an editorial assessment) — most turns warrant none at all.`,
  branch: `The reporter clicked Branch on this question: given the same established context and parent question, identify a genuinely different question or line of inquiry the material actually supports — not narrower, not broader, a different way in. It must not invent a new factual premise to justify the branch existing — but "the material" is not limited to what's already attached: SEARCHING THE WEB FOR CURRENT DEVELOPMENTS IS PART OF THIS ACTION BY DEFAULT, especially when the inherited context is thin. Search first, then reason from what the context and your findings actually support. Only if both come up empty should you decline — say so plainly in your reply and do not call propose_editorial_action at all (or call it with kind "diagnosis" if there's something specific blocking it). If you do find a real branch, call propose_editorial_action with kind "branch", and attach what grounded it: cite your sources in the reply.`,
  drilldown: `The reporter clicked Drill down on this question: identify a more specific, still-unresolved question beneath it that meaningfully moves it toward reportability — responding to whatever is currently keeping it from being a strong story question (see the diagnosis reasons below), not a generic narrower paraphrase. SEARCHING THE WEB FOR CURRENT DEVELOPMENTS IS PART OF THIS ACTION BY DEFAULT, especially when the inherited context is thin — a real development is usually what turns a thematic question into an investigable one. If the question can't be usefully narrowed even after checking, say so and either call propose_editorial_action with kind "diagnosis" naming the specific reason, or don't call it at all. If you do find a real next question, call propose_editorial_action with kind "drilldown", and cite in your reply whatever grounded it.`,
  evaluate: `The reporter clicked Evaluate: give two SEPARATE judgments, both in your reply text. First: is this a well-formed, reportable story question by the structural criteria (open, specific, consequential, bounded, grounded in a real uncertainty, answerable through realistic reporting, capable of discovery, evidence-legible)? Search the web when it bears on the judgment — especially to check whether the answer is already substantially known, or whether a real current development grounds the question. If not well-formed, name which of the ten diagnosis reasons applies. Second, and only after the first: would answering it likely make a strong WUWF story, reasoned against WUWF's current editorial criteria below — in prose, never a score. These are different questions with possibly different answers; do not collapse them into one verdict. If the first judgment finds a real problem, call propose_editorial_action with kind "diagnosis". Regardless, if you have something substantive to say about the second judgment, call propose_editorial_action with kind "assessment" carrying that discussion as its text (in addition to, or instead of, a diagnosis call — but only one call total, so if both apply, use whichever is more decision-relevant right now and cover the other in your reply text alone).`,
};

const PROPOSE_ACTION_TOOL = {
  type: "function" as const,
  name: "propose_editorial_action",
  description:
    "Optionally propose ONE structural action arising from this turn. Do not call this at all if a plain reply is enough — declining to act is a normal, expected outcome, not something to avoid.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["branch", "drilldown", "context", "reframe", "diagnosis", "assessment"],
        description:
          "branch/drilldown: a new question (give its full text). context: attach what the reporter told you as a context note. reframe: propose a rewritten version of the CURRENT question (the reporter applies it, you don't). diagnosis: explain what's blocking story-readiness, naming one of the ten reasons. assessment: a qualitative editorial-value discussion against current criteria, never a score.",
      },
      text: {
        type: ["string", "null"],
        description:
          "The new question's full text (branch/drilldown), the context note's body (context), the reframed question's full text (reframe), or the assessment discussion (assessment). Null for diagnosis — diagnosis_kind names the reason instead.",
      },
      evidentiary_status: {
        type: ["string", "null"],
        enum: [...EVIDENTIARY_STATUSES, null],
        description:
          "Required (non-null) only when kind is context — your honest classification of what you're attaching.",
      },
      source_title: {
        type: ["string", "null"],
        description:
          "Only when kind is context and evidentiary_status is web_finding: the source's title.",
      },
      source_url: {
        type: ["string", "null"],
        description:
          "Only when kind is context and evidentiary_status is web_finding: the source's URL.",
      },
      diagnosis_kind: {
        type: ["string", "null"],
        enum: [...DIAGNOSIS_KINDS, null],
        description: "Required (non-null) only when kind is diagnosis.",
      },
    },
    required: [
      "kind",
      "text",
      "evidentiary_status",
      "source_title",
      "source_url",
      "diagnosis_kind",
    ],
    additionalProperties: false,
  },
};

function extractCitations(response: OpenAI.Responses.Response): TurnCitation[] {
  const citations: TurnCitation[] = [];
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type !== "output_text") continue;
      for (const annotation of part.annotations ?? []) {
        if (annotation.type === "url_citation") {
          citations.push({ title: annotation.title, url: annotation.url });
        }
      }
    }
  }
  return citations;
}

function extractReplyText(response: OpenAI.Responses.Response): string {
  const parts: string[] = [];
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type === "output_text") parts.push(part.text);
    }
  }
  return parts.join("\n\n").trim();
}

function extractProposedAction(response: OpenAI.Responses.Response): ProposedAction | null {
  for (const item of response.output) {
    if (item.type !== "function_call" || item.name !== "propose_editorial_action") continue;
    try {
      const parsed = JSON.parse(item.arguments) as {
        kind: ProposedAction["kind"];
        text: string | null;
        evidentiary_status: EvidentiaryStatus | null;
        source_title: string | null;
        source_url: string | null;
        diagnosis_kind: DiagnosisKind | null;
      };
      return {
        kind: parsed.kind,
        text: parsed.text?.trim() || null,
        evidentiaryStatus: parsed.evidentiary_status,
        sourceTitle: parsed.source_title,
        sourceUrl: parsed.source_url,
        diagnosisKind: parsed.diagnosis_kind,
      };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * One turn of editorial reasoning about one question — Branch, Drill down,
 * Evaluate, or an ordinary Discuss message all funnel through here (design
 * doc §7). `userMessage` is either the reporter's own words (discuss) or a
 * fixed canned directive (branch/drilldown/evaluate — see directives.ts) so
 * every mode runs through the identical pipeline and lands in the same
 * visible thread. An async generator, not a Promise: reply tokens are
 * yielded as "delta" events while the model works, then one terminal
 * "result" event carries the full reply, citations, and proposed action —
 * turn.ts persists nothing until that terminal event.
 */
export async function* streamEditorialTurn(
  mode: TurnMode,
  question: {
    text: string;
    depth: number;
    diagnosisKind: DiagnosisKind | null;
    diagnosisNote: string | null;
  },
  context: EditorialTurnContext,
  userMessage: string,
): AsyncGenerator<ReasoningStreamEvent> {
  const client = getOpenAIClient();

  const diagnosisNote = question.diagnosisKind
    ? `\n\nThis question is currently diagnosed as "${question.diagnosisKind}"${question.diagnosisNote ? `: ${question.diagnosisNote}` : ""}.`
    : "";

  // The root IS the guiding question — durable and intentionally too large
  // for one story. Without this, a brand-new inquiry's first drill-down
  // reliably came back "still_thematic" — technically true of every guiding
  // question by definition, and a dead end for the reporter who just started.
  const rootFraming =
    question.depth === 0
      ? `\n\nThe question being acted on is the inquiry's root — WUWF's guiding question itself. Being thematic and broad is its nature, not a defect: never diagnose the root as still_thematic or too_broad. Work beneath it instead — help the reporter find grounded lines of inquiry, or say plainly what real-world signal would be needed to open one.`
      : "";

  const instructions = `${VOICE}

${REASONING_ORDER}

${EDITORIAL_LEVELS}

${DIAGNOSIS_GUIDE}

${EVIDENTIARY_DISCIPLINE}

You are working on exactly one question: "${question.text}"${diagnosisNote}${rootFraming}

${MODE_FRAMING[mode]}

Prior conversation on this question, oldest first:
${context.priorMessages.map((m) => `${m.role}: ${m.body}`).join("\n") || "(none yet)"}

${contextBlock(context)}`;

  let response: OpenAI.Responses.Response;
  try {
    const stream = client.responses.stream({
      model: MODEL,
      instructions,
      input: userMessage,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      // Deviates from this repo's usual "low" reasoning effort (see chat.ts) —
      // deliberately: distinguishing evidentiary status, diagnosing a specific
      // one of ten reasons, and keeping two editorial judgments separate is a
      // more demanding reasoning task than a single generation or a general
      // tool-calling loop.
      reasoning: { effort: "medium" },
      store: false,
      tools: [{ type: "web_search" }, PROPOSE_ACTION_TOOL],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
    });

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        yield { type: "delta", text: event.delta };
      }
    }

    // Same cast as chat.ts's streaming loop: ResponseStream's finalResponse()
    // types output as ParsedResponseOutputItem<null>[] (it supports
    // .parse()-based structured outputs this call never uses); runtime shape
    // matches the plain Response the extract helpers expect.
    response = (await stream.finalResponse()) as unknown as OpenAI.Responses.Response;
  } catch (error) {
    throw humanizeOpenAIError(error);
  }

  if (response.status === "failed") {
    throw new Error(response.error?.message ?? "The assistant failed to respond.");
  }

  yield {
    type: "result",
    result: {
      reply: extractReplyText(response),
      citations: extractCitations(response),
      action: extractProposedAction(response),
    },
  };
}
