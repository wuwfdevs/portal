import "server-only";
import OpenAI from "openai";
import { humanizeOpenAIError } from "@/lib/openai-error";
import type { DiagnosisKind, EvidentiaryStatus } from "./tree";

// Editorial Inquiry's reasoning engine — one function, runEditorialTurn(),
// handles Drill down, Evaluate, and every ordinary Discuss turn. See
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

// Mid-tier of the 5.6 series ($2/$12 per M tokens vs the old gpt-5.4-mini's
// $0.75/$4.50 — ~8¢ vs ~3¢ per worst-case turn). Upgraded after a real turn
// skipped the framing's mandatory search, wrote no prose, and double-called
// the action tool — instruction-following failures under long context the
// mini tier makes far more often (design doc §16).
const MODEL = "gpt-5.6-terra";
// max_output_tokens includes reasoning tokens, not just the visible reply —
// at 2048, a real multi-search turn burned the whole budget on reasoning and
// was truncated (status "incomplete") before writing any reply or action at
// all, which is what an all-empty-reasoning-items turn in the OpenAI logs
// was. Sized so reasoning across several search rounds still leaves room for
// the reply.
const MAX_OUTPUT_TOKENS = 8192;
// Each internal web-search round re-processes the entire conversation, so
// unbounded searching multiplies input tokens (8 rounds ≈ 37k input observed
// against a 100k TPM org cap). Enough for real grounding, bounded.
const MAX_WEB_SEARCHES = 4;

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

// "branch" is no longer a turn mode — the dedicated Branch action was
// consolidated into Drill down from the parent (design doc §15). It survives
// as a ProposedAction kind: a discuss turn can still propose a sibling.
export type TurnMode = "discuss" | "drilldown" | "evaluate";

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

export interface RelatedQuestionContext {
  text: string;
  /** The reporter rejected this angle — a dead line, not an open one. */
  rejected: boolean;
}

/** Everything one reasoning call needs — see design doc §7. */
export interface EditorialTurnContext {
  pillarName: string;
  guidingQuestion: string;
  /** Root-first path down to the question being acted on, the last entry. */
  ancestry: AncestryEntry[];
  /** Context notes inherited down this branch (own + every ancestor's), labeled by evidentiary status. */
  inheritedContext: InheritedNoteContext[];
  /** Children (drilldown) or siblings (discuss/evaluate) already at this position — rejected ones included, labeled. */
  existingRelated: RelatedQuestionContext[];
  /** Prior turns in this question's discuss thread, oldest first. */
  priorMessages: ChatTurnMessage[];
  /** WUWF's current core editorial criteria, from Editorial Planning — prose guidance, never a scoring target. */
  criteria: EditorialCriterionContext[];
}

export interface ProposedAction {
  kind: "branch" | "drilldown" | "context" | "reframe" | "diagnosis" | "assessment" | "promote";
  text: string | null;
  /** branch/drilldown: what grounds the new question — becomes a context note on the new node. */
  grounding: string | null;
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
  "too_narrow_process_step",
] as const;

const EVIDENTIARY_STATUSES = [
  "hunch",
  "source_claim",
  "established_fact",
  "web_finding",
  "inference",
  "open_question",
] as const;

// Kept deliberately tight: with the built-in web_search tool, the API
// re-processes these instructions once per internal search round, so every
// token here is billed several times per turn (a real turn was observed
// re-billing an earlier, wordier version of this prompt ~8x for ~37k input
// tokens). Condense, don't add.

const VOICE = `You are an editorial reasoning assistant for WUWF, the public radio station serving Pensacola and Northwest Florida. Voice: calm, factual, precise — NPR member station; no hype, no emoji. When searching the web, prefer current, attributable developments in WUWF's coverage area — local and regional sources over national think-pieces.

ALWAYS write a short prose reply for the reporter, even when you call propose_editorial_action — a tool call with no prose reads as a blank message. Plain markdown is fine; keep it tight.

The reporter works on a question-tree canvas, and calling propose_editorial_action is your ONLY way to change it. A question that appears only in your prose does not exist in the tree. Never say you added, attached, or changed anything unless you called the tool this turn — if the reporter asks you to add something to the canvas, the answer is a tool call, not a claim.`;

const REASONING_ORDER = `Reason in this order, every time: real-world signal (brought by the reporter, or found by your search) + the guiding question -> what is actually known -> what remains unknown or unresolved -> lines of inquiry -> properly scoped story questions -> editorial evaluation. Never skip straight from the guiding question to a plausible-sounding invented question. Anything you propose must trace back to inherited context or something you just found — never a factual premise invented to justify a branch. A proposal must also be a genuine dimension of the GUIDING QUESTION itself, not merely share a newsworthy topic with one: a development whose central question belongs to a different coverage area is not a line of this inquiry, however local or current. If the material doesn't support a genuinely different or narrower angle, say so plainly; declining is a normal, expected outcome.`;

const EDITORIAL_LEVELS = `Three levels: a GUIDING QUESTION is durable, broad, organizes sustained coverage, intentionally too large for one story — never something you propose. A LINE OF INQUIRY is a meaningful dimension, tension, mechanism, or uncertainty within it — can yield multiple stories, usually still too broad to be one reporting question. A STORY QUESTION is the central unknown of one finite reporting project: genuinely open, specific, consequential, bounded, grounded in a real uncertainty or tension, answerable through realistic reporting (sources, documents, records, data, observation), capable of discovery rather than illustration, and clear enough that a reporter can tell what evidence would answer it. There is NO level below a story question: beneath it sit reporting TASKS — a records request, a document pull, a yes/no verification step — which belong in a reporting plan, never as questions in this tree. A "question" whose answer is one step of reporting a larger story has overshot; the story question is the thing that step serves. Tree depth describes structure, not quality — never treat "drilled down enough times" as story-readiness.`;

const DIAGNOSIS_GUIDE = `When a question isn't a strong story question, name the specific reason — one of: still_thematic, too_broad, compound_question, unverified_premise, already_known, unclear_stakes, no_uncertainty, implausible_reporting_path, trivial, descriptive_not_investigative, too_narrow_process_step. The last one runs the OPPOSITE direction from the rest: the question has been narrowed past story level into a reporting task, and the fix is stepping back UP to the story that task serves, never narrowing further. For the others, when you then propose a branch or drill-down, fix that SPECIFIC problem (split the compound question, name what needs verifying, surface the real uncertainty) — not a generic narrower paraphrase.`;

const EVIDENTIARY_DISCIPLINE = `Classify all context by evidentiary status: hunch, source_claim, established_fact, web_finding (always keep title/URL), inference, open_question. Never treat a hunch or source_claim as an established fact when reasoning about what's known — an unverified assertion stays a hunch or source_claim even when the reporter states it confidently.`;

function criteriaBlock(criteria: EditorialCriterionContext[]): string {
  if (criteria.length === 0) {
    return "(WUWF's current editorial criteria are not available right now — reason about newsworthiness and public value in general terms instead.)";
  }
  const lines = criteria
    .map((c) => `- ${c.name}: ${c.description}${c.guidance ? ` (${c.guidance})` : ""}`)
    .join("\n");
  return `WUWF's current core editorial criteria — use them to INFORM judgment and critique. Never reverse-engineer a question to sound like it would score well, and never emit a score or rating yourself.\n${lines}`;
}

function contextBlock(context: EditorialTurnContext): string {
  const ancestryLines = context.ancestry.map((a) => `- (depth ${a.depth}) ${a.text}`).join("\n");
  const existing = context.existingRelated.length
    ? context.existingRelated
        .map((q) => `- ${q.rejected ? "[rejected by the reporter] " : ""}${q.text}`)
        .join("\n")
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

Already at this position in the tree — any question you propose must be genuinely distinct from ALL of these; a reworded variation of one is a duplicate. An entry marked [rejected by the reporter] is a dead angle they already turned down: never re-propose it or a variation of it:
${existing}

Context inherited on this branch, each labeled with its evidentiary status:
${notes}

${criteriaBlock(context.criteria)}`;
}

const MODE_FRAMING: Record<TurnMode, string> = {
  discuss: `An ordinary discuss turn. Reply to what the reporter said — challenge an assumption, concede a fair point, separate claim from fact, identify missing evidence, search if current information would help, or just answer plainly. At most ONE propose_editorial_action call, only if the conversation genuinely warrants it — most turns warrant none. Exception: when the reporter asks you to add a question or note to the canvas/tree, that IS the warrant — call the tool (kind "drilldown", "branch", or "context" as fits) with the agreed text; replying without the call adds nothing.`,
  drilldown: `The reporter clicked Drill down: propose the next question DOWN, one level at a time. From the guiding question (the root), that normally means a LINE OF INQUIRY — a real dimension or tension grounded in a current development you found or the attached context — not a leap straight to a story question. From a line of inquiry, move toward or land on a STORY QUESTION, answering whatever currently blocks it (see the diagnosis reasons) — not a generic narrower paraphrase. Searching for current developments is part of this action by default. FIRST check whether the question already meets the story-question bar: if it does, there is nothing below it but reporting tasks — do NOT propose one; say it's story-ready and call kind "promote" to nominate it (the reporter confirms). Never propose a question that is substantially the acted-on question reworded — if nothing genuinely narrower and still story-shaped exists, that is a promote, a diagnosis, or a plain decline, never a paraphrase. When questions ALREADY sit beneath this one (listed below), the new question must explore genuinely DISTINCT territory from ALL of them — never a rephrase, variation, or adjacent angle on one, and your own earlier proposals in this conversation are taken territory, not a track to continue. In that case ALWAYS search first — a genuinely distinct line needs its own fresh real-world signal, and re-using the material that grounded an existing question reliably produces a variation of it. When the existing questions cluster around one topic or news event, distinct means a DIFFERENT domain of the guiding question entirely: your search queries must name other domains of it and must not contain the covered topic's terms at all — add exclusion operators (e.g. -"data center") if a query risks drifting back. If search and the attached context both come up empty, decline plainly. Your grounding must state how the proposed question probes the GUIDING QUESTION itself — a newsworthy local question whose core belongs to a different coverage pillar is a decline, not a proposal. Say in your reply which level the proposed question sits at and what would advance it next. If you have a real next question, you MUST call propose_editorial_action with kind "drilldown" plus its grounding — presenting it only in prose leaves the canvas unchanged.`,
  evaluate: `The reporter clicked Evaluate: give two SEPARATE judgments in your reply, never collapsed into one verdict. First: is this a well-formed, reportable story question by the structural criteria above? Search when it bears on this — especially whether the answer is already substantially known, or whether a real development grounds it. If not well-formed, name the diagnosis reason and call kind "diagnosis". Second, only then: would answering it likely make a strong WUWF story, reasoned in prose against the editorial criteria — never a score. When BOTH judgments come out favorable, call kind "promote" to nominate it as a validated story question (the reporter confirms) — a favorable evaluation that stops at prose leaves the reporter guessing whether you meant it. Otherwise kind "assessment" carries the editorial-value discussion if substantive. One tool call total — pick the most decision-relevant kind and cover the rest in prose.`,
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
        enum: ["branch", "drilldown", "context", "reframe", "diagnosis", "assessment", "promote"],
        description:
          "branch/drilldown: a new question (give its full text). context: attach what the reporter told you as a context note. reframe: propose a rewritten version of the CURRENT question (the reporter applies it, you don't). diagnosis: explain what's blocking story-readiness, naming one of the recognized reasons. assessment: a qualitative editorial-value discussion against current criteria, never a score. promote: nominate the CURRENT question as a validated, story-ready story question (the reporter confirms — use only when it genuinely meets the story-question bar).",
      },
      text: {
        type: ["string", "null"],
        description:
          "The new question's full text (branch/drilldown), the context note's body (context), the reframed question's full text (reframe), the assessment discussion (assessment), or one or two sentences on why it's story-ready (promote). For diagnosis, REQUIRED (non-null): 1-2 sentences applying the named reason to this specific question — stored as its diagnosis note.",
      },
      grounding: {
        type: ["string", "null"],
        description:
          "REQUIRED (non-null) when kind is branch/drilldown: 1-3 plain sentences stating what grounds this question — the concrete development, facts, or attached context it traces to. Attached to the new node as a context note so the node is understandable on its own, without this conversation. Null for other kinds.",
      },
      evidentiary_status: {
        type: ["string", "null"],
        enum: [...EVIDENTIARY_STATUSES, null],
        description:
          "Required (non-null) when kind is context, and alongside grounding for branch/drilldown — your honest classification of what you're attaching (web_finding when it came from your search).",
      },
      source_title: {
        type: ["string", "null"],
        description: "When the attached context or grounding is a web_finding: the source's title.",
      },
      source_url: {
        type: ["string", "null"],
        description: "When the attached context or grounding is a web_finding: the source's URL.",
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
      "grounding",
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
        grounding: string | null;
        evidentiary_status: EvidentiaryStatus | null;
        source_title: string | null;
        source_url: string | null;
        diagnosis_kind: DiagnosisKind | null;
      };
      return {
        kind: parsed.kind,
        text: parsed.text?.trim() || null,
        grounding: parsed.grounding?.trim() || null,
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
 * One turn of editorial reasoning about one question — Drill down, Evaluate,
 * or an ordinary Discuss message all funnel through here (design doc §7).
 * `userMessage` is either the reporter's own words (discuss) or a
 * fixed canned directive (drilldown/evaluate — see directives.ts) so
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
      ? `\n\nThe question being acted on is the inquiry's root — WUWF's guiding question itself. Being thematic and broad is its nature, not a defect: never call propose_editorial_action with kind "diagnosis" on the root — no diagnosis applies to a guiding question. Work beneath it instead — help the reporter find grounded lines of inquiry, or say plainly what real-world signal would be needed to open one.`
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
      // Stored deliberately (an explicit request, 2026-08-20, portal-wide —
      // lib/agent/chat.ts matches): the OpenAI dashboard's Logs page only
      // lists stored responses, and with store: false these turns were
      // invisible there — a real observability gap while debugging the org's
      // rate-limit exhaustion. The tradeoff is real and accepted: OpenAI
      // retains each turn's content, queryable in the dashboard, for its
      // standard 30-day window.
      store: true,
      max_tool_calls: MAX_WEB_SEARCHES,
      tools: [
        {
          type: "web_search",
          // "low" injects a smaller slice of each search's results into
          // context — citations still arrive; each round's results are
          // re-billed on every subsequent round, so this compounds.
          search_context_size: "low",
          // Geolocates search toward the coverage area directly, which the
          // prompt could only ask for. Central time, not Eastern — see
          // lib/log/timezone.ts.
          user_location: {
            type: "approximate",
            city: "Pensacola",
            region: "Florida",
            country: "US",
            timezone: "America/Chicago",
          },
        },
        PROPOSE_ACTION_TOOL,
      ],
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
    // The raw SDK error carries the diagnostic payload (org/project response
    // headers, ratelimit counters) — log it server-side before replacing it
    // with the user-facing message; Vercel logs are where that detail is
    // actually read.
    console.error("Editorial Inquiry OpenAI call failed:", error);
    throw humanizeOpenAIError(error);
  }

  if (response.status === "failed") {
    throw new Error(response.error?.message ?? "The assistant failed to respond.");
  }

  const result: EditorialTurnResult = {
    reply: extractReplyText(response),
    citations: extractCitations(response),
    action: extractProposedAction(response),
  };

  // Truncated mid-reasoning with nothing usable produced — persisting this
  // would store an empty exchange (and replay it as context on later turns).
  // Better to fail the turn cleanly so nothing is written and a retry starts
  // fresh. With a partial reply or an action, the turn proceeds as normal.
  if (response.status === "incomplete" && !result.reply && !result.action) {
    throw new Error(
      "The model ran out of reasoning room before it could reply — try again. If this keeps happening, the turn's output budget needs raising.",
    );
  }

  yield { type: "result", result };
}
