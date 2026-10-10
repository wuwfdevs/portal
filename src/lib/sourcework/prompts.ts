// The prompt slots editors maintain, with their built-in text (docs/sourcework-
// analysis-design.md §8). Editors own the *wording*; code owns the output
// schema, the categories and the variables, so a slot's text is plain language
// appended to a fixed framing (extraction-prompt.ts, context-prompt.ts) and can
// never change the shape of an answer. Pure.
//
// A slot with no published version runs on the built-in text here. Publishing
// writes a sw_prompt_versions row and moves sw_prompt_live; the run records the
// version it used (null = built-in).

export type PromptSlot =
  | "context"
  | "extraction"
  | "theme_assign"
  | "theme_review"
  | "quote_quality"
  | "piece_draft"
  | "piece_assistant";

export interface PromptSlotDefinition {
  slot: PromptSlot;
  /** The name in the slot list and headings. */
  label: string;
  /** One line under the heading. */
  description: string;
  /** Whether "Try this draft" exists for it yet (§8.1: the extraction guide first, the others follow). */
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

export const THEME_ASSIGN_BUILT_IN = `A data point belongs in a theme when it is evidence about what the theme claims, not merely about the same place, person or period.

Supports: the data point is evidence that the claim is true, from this speaker's or document's own experience or knowledge.

Complicates: the data point qualifies, limits or contradicts the claim. A speaker who was forbidden to enter the tunnels complicates "Locals treated the fort's tunnels as a private playground". Always report it; it is kept beside the supporting evidence.

A data point can belong to more than one theme. If it fits none, leave it out.`;

export const THEME_REVIEW_BUILT_IN = `Write each theme as a claim a reporter could defend or challenge: one sentence saying who did, thought or experienced what, and how. It is not a subject heading.

Prefer themes that more than one source or speaker bears on. Propose a theme resting on one source only when it is vivid and specific, and do not claim more in its definition than that source can bear.

Put evidence that cuts against a theme inside it, marked as complicating, rather than starting a theme for the opposite view.

Suggest merging two accepted themes only when, put together, they would be one claim.`;

export const QUOTE_QUALITY_BUILT_IN = `A good clip is one a host can play straight after a sentence of narration and then talk over. Judge the clip by how it sounds on air, not by how much it says about the theme.

- It sings. It is concrete and emotionally specific, and it is in the speaker's own voice: an image, a detail, a turn of phrase, a laugh. A summary of what happened is a data point, not a clip.
- It stands alone. A listener who has heard nothing else understands it. Skip clips that lean on "he" or "that place" without saying who or where.
- It starts and ends cleanly. It begins on the start of a sentence and ends where the speaker lands, with no false start, filler or half sentence at either edge. If the best clip needs a word or two trimmed, say which in your reason.
- It is a usable length: roughly five to twenty-five seconds. Shorter is a button after narration; longer needs a reason.
- It sounds clean. Say if you can tell that something under it is wrong, such as noise, crosstalk or the interviewer talking over the speaker.

Prefer a clip that shows over one that explains. Prefer a different speaker or source over a second clip of the same point. When nothing in the evidence works on air, say so by returning no clips.`;

export const PIECE_DRAFT_BUILT_IN = `Write the way a public radio reporter writes for the ear: short sentences in plain spoken language, attribution first, the present tense for what is true now.

Use only what the material says. Attribute each claim to the person who made it, and where sources differ, let the difference show rather than smoothing it over. Complicating evidence is part of the story. When a sentence needs a fact the material doesn't give, write a bracketed placeholder such as [CHECK: year the gap was closed] instead of guessing.

The narration carries the facts and leads with the strongest one. A clip carries what narration can't: an experience, a feeling, an opinion in the speaker's own voice. Before a clip, the narration says who is speaking and why they matter; it doesn't tell the listener what the clip is about to say. An anchor intro sets up the story without repeating the reporter's first line.

The format says what kind of piece this is; it isn't an outline. Decide how many narration blocks the story needs and where the clips go. The actuality count is a usual range, not a quota: use fewer clips when fewer earn their place, and keep them short.`;

export const PIECE_ASSISTANT_BUILT_IN = `You are editing a radio piece with its reporter. Read the piece before you change it, and read what comes back after each change: its checks list anything that looks wrong.

Make the change that was asked for, and fix what it breaks. The narration that introduces a clip belongs to that clip, so when you move, swap or remove one, handle the other. If you change what the opening claims, make sure the rest of the piece still agrees with it.

Stay inside the material. You can reword, tighten, reorder and trim, but don't add a fact, name, number or claim that the piece and its clips don't already support, and don't take a claim further than its source did. If you need one, write a [CHECK: …] placeholder or ask.

Write for the ear: short sentences, attribution first, the present tense for what is true now. Follow the format's guidance. If you aren't sure what's wrong, say what you think it is and make one change rather than several.

When you finish, say briefly what you changed and what you left alone.`;

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
  {
    slot: "theme_assign",
    label: "Theme assignment",
    description:
      "Tells the model when an accepted data point belongs in an existing theme, and whether it supports or complicates it. Runs by itself after a data point is accepted.",
    tryable: false,
    gives: [
      "The project's accepted themes that are nearest the data points being filed, each with its title and one-sentence definition.",
      "The data points, each with its claim, its source, its speaker and the question it answers.",
    ],
    returns: [
      "For every data point, the themes it bears on and whether it supports or complicates each. An empty list means it fits none and waits for Review themes.",
      "The model returns numbers, never text. The shape and the two stances are fixed; your wording decides what counts as bearing on a claim.",
    ],
    builtIn: THEME_ASSIGN_BUILT_IN,
  },
  {
    slot: "theme_review",
    label: "Theme review",
    description:
      "Tells the model how a theme should read, and when two themes are one. Used when someone chooses Review themes on a project.",
    tryable: false,
    gives: [
      "The project's research questions and its accepted themes, which the model never rewords.",
      "The titles of themes already proposed or turned down, so they are not proposed again.",
      "The accepted data points that sit in no theme yet.",
    ],
    returns: [
      "New themes, each with a title, a one-sentence definition and the data points behind it, marked as supporting or complicating. Merge suggestions between accepted themes, each with a reason.",
      "Everything returned is a suggestion the reporter accepts, edits or rejects. The shape is fixed by the code; your wording decides what a good theme looks like.",
    ],
    builtIn: THEME_REVIEW_BUILT_IN,
  },
  {
    slot: "quote_quality",
    label: "Quote quality guide",
    description:
      "Tells the model what makes a clip work on air. Used when someone chooses Suggest quotes on a theme.",
    tryable: true,
    gives: [
      "The theme's title and one-sentence definition.",
      "The accepted data points that support it, by source and speaker.",
      "For each source, the transcript around those data points as numbered sentences, under headers naming the speaker and the time.",
    ],
    returns: [
      "Up to eight clips, best first: the first and last sentence, a tier (strong, good or usable), a one-line reason it works, and the data points it exemplifies.",
      "The model returns sentence numbers, never text or times: the code derives the start, the end and the words. Your wording decides what counts as a clip that works on air; the tiers and the shape are fixed.",
    ],
    builtIn: QUOTE_QUALITY_BUILT_IN,
  },
  {
    slot: "piece_draft",
    label: "Piece drafting guide",
    description:
      "Tells the model how to write a piece, whatever the format. Used when Draft with AI writes a piece; each format adds its own length, style and actuality range after it.",
    tryable: false,
    gives: [
      "The format's guidance, after your wording: its length, its usual actuality range and its style.",
      "The reporter's direction, if any, and the project's accepted themes with their accepted data points.",
      "The project's excerpts, numbered, each with its speaker, its length and its words.",
    ],
    returns: [
      "An ordered list of blocks: narration, an optional anchor intro first, and actualities placed by excerpt number.",
      "The model never types a quote: the code plays the excerpt itself. The block kinds, the numbering and the length arithmetic are fixed; your wording decides how the piece is written.",
    ],
    builtIn: PIECE_DRAFT_BUILT_IN,
  },
  {
    slot: "piece_assistant",
    label: "Piece assistant guide",
    description:
      "Tells the assistant how to work when someone has a piece open. Used on every assistant turn in a piece.",
    tryable: false,
    gives: [
      "Which piece is open, and the portal assistant's standing instructions.",
      "Tools to read the piece, search its excerpts, and edit, move, trim, swap or remove its blocks. Reading a piece returns the format's guidance and a list of checks.",
    ],
    returns: [
      "Edits, each saved as a version the reporter can undo and marked in the piece, and a short reply.",
      "Clips are placed by excerpt id only, so the assistant can't change what a speaker said. Your wording decides how it edits.",
    ],
    builtIn: PIECE_ASSISTANT_BUILT_IN,
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
