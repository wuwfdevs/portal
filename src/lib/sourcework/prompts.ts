// The prompt slots editors maintain, with their built-in text (docs/sourcework-
// analysis-design.md §8). Editors own the *wording*; code owns the output
// schema, the categories and the variables, so a slot's text is plain language
// appended to a fixed framing (extraction-prompt.ts, context-prompt.ts) and can
// never change the shape of an answer. Pure.
//
// A slot with no published version runs on the built-in text here. Publishing
// writes a sw_prompt_versions row and moves sw_prompt_live; the run records the
// version it used (null = built-in).

export type PromptSlot = "context" | "extraction";

export interface PromptSlotDefinition {
  slot: PromptSlot;
  /** The name in the slot list and headings. */
  label: string;
  /** One line under the heading. */
  description: string;
  /** Whether "Try this draft" exists for it yet (§8.1: the extraction guide first). */
  tryable: boolean;
  /** What the model is handed, for the "What the model is given and returns" panel. */
  gives: string[];
  /** What it must hand back, and who decides the shape. */
  returns: string[];
  /** The text that runs until an editor publishes a version. */
  builtIn: string;
}

export const EXTRACTION_GUIDE_BUILT_IN = `Read the transcript as a producer looking for material for a radio story, and as a researcher answering this project's questions.

Responsive. A passage that bears on one of the research questions. Name the question it answers.

Story. A passage outside the questions that a producer would want. Use exactly one of:
- Character: shows who the speaker is, or how they talk.
- Place: a specific, vivid description of somewhere. A bare name is not enough.
- Moment: a scene or turning point with a before and an after.
- Detail: a concrete or sensory specific.
- Background: history or context the audience needs to follow the story.

Write each claim as a short paraphrase that keeps names, numbers, dates and hedges ("he thinks", "around 1960"). Do not reduce it to a topic.

Before you answer, check each claim against the passages it points to. Correct or drop any claim that says more than the speaker did.`;

export const CONTEXT_BUILT_IN = `Look up background that helps someone read these sources correctly: the places, events, institutions, public figures and terms that the project's description, its research questions and the sources mention. Prefer official and primary pages (government, museum, archive, an established news outlet) over summaries of them.

Make one note per subject: a short title, one or two sentences on what a reader needs to know, and the page that says it. Skip anything the sources explain well themselves, and skip general knowledge.

Search for places, events and public figures. Never put the name of someone who was interviewed into a search, and do not look up private individuals.`;

export const PROMPT_SLOTS: readonly PromptSlotDefinition[] = [
  {
    slot: "context",
    label: "Background",
    description:
      "Tells the model what background to look for on the web, and how. Used when a project's background notes are gathered or refreshed.",
    tryable: false,
    gives: [
      "The project's title and background text, and its research questions.",
      "The titles of its sources and a list of the capitalized names and terms their transcripts use most.",
      "The names of the people interviewed, with the instruction never to search on them.",
    ],
    returns: [
      "Up to eight notes: a title, a short summary and a web address each. The shape is fixed by the code; your wording decides which subjects are worth a note.",
      "Notes are background only: they are shown on the Setup tab, sent to extraction as unverified reference, and never quoted or counted as evidence.",
    ],
    builtIn: CONTEXT_BUILT_IN,
  },
  {
    slot: "extraction",
    label: "Extraction guide",
    description:
      "Tells the model what counts as a data point and how to word one. Used once per source.",
    tryable: true,
    gives: [
      "The project's research questions, numbered, and its active background notes (labelled unverified).",
      "The source as numbered sentences (a transcript) or numbered blocks (a document), under headers naming the speaker and time or the page.",
    ],
    returns: [
      "Data points: a claim, whether it answers a question or is story material (character, place, moment, detail or background), whether the speaker lived it, heard it, believes it or states it as fact, and the numbers of the passages it rests on.",
      "The model returns passage numbers, never text: the code derives the timestamps or page and block from them. The categories and the shape are fixed; your wording decides what is worth a data point and how a claim reads.",
    ],
    builtIn: EXTRACTION_GUIDE_BUILT_IN,
  },
];

export function promptSlotDefinition(
  value: string | null | undefined,
): PromptSlotDefinition | null {
  return PROMPT_SLOTS.find((definition) => definition.slot === value) ?? null;
}

export const PROMPT_BODY_MAX = 20000;
export const PROMPT_NOTE_MAX = 300;

export type PromptValidation = { ok: true; body: string } | { ok: false; error: string };

/**
 * Saving checks the text before it can be published (§8): something to say, a
 * sane length, and no placeholders — these slots take no variables, so a
 * `{{like_this}}` left in would reach the model as literal braces.
 */
export function validatePromptBody(slot: PromptSlot, raw: string): PromptValidation {
  void slot;
  const body = raw.replace(/\r\n/g, "\n").trim();
  if (body === "") return { ok: false, error: "A prompt can't be empty." };
  if (body.length > PROMPT_BODY_MAX) {
    return {
      ok: false,
      error: `A prompt can be at most ${PROMPT_BODY_MAX.toLocaleString("en-US")} characters.`,
    };
  }
  const placeholder = /\{\{\s*([^{}]*?)\s*\}\}/.exec(body);
  if (placeholder) {
    return {
      ok: false,
      error: `“{{${placeholder[1]}}}” is a placeholder, and this prompt doesn't take any. Describe it in words instead.`,
    };
  }
  return { ok: true, body };
}

/** The one-line note a publish asks for; blank is allowed, over-long is trimmed by the caller's error. */
export function validatePublishNote(
  raw: string,
): { ok: true; note: string } | { ok: false; error: string } {
  const note = raw.trim();
  if (note.length > PROMPT_NOTE_MAX) {
    return { ok: false, error: `Keep the note under ${PROMPT_NOTE_MAX} characters.` };
  }
  return { ok: true, note };
}

/** "78% accepted" from the reviewed points of a version, or null while nothing has been reviewed. */
export function acceptRateLabel(accepted: number, rejected: number): string | null {
  const reviewed = accepted + rejected;
  if (reviewed === 0) return null;
  return `${Math.round((accepted / reviewed) * 100)}% accepted`;
}
