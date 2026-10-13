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
  | "analyze"
  | "synthesis"
  | "outline"
  | "context"
  | "extraction"
  | "theme_assign"
  | "theme_review"
  | "quote_quality";

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

export const ANALYZE_GUIDE_BUILT_IN = `A finding states what the source establishes, in a sentence a reporter could attribute on the air. Keep who said it, the numbers and dates, and the speaker's own hedges ("he thinks", "around 1960"). Mark what someone lived as firsthand and what they heard as secondhand; an opinion stays an opinion. Prefer the firsthand and the specific to the general, and an official's figures to their reassurances. A source that qualifies or contradicts something already established is worth more than one that repeats it: when two accounts of the same thing differ, or an official account and a firsthand one do not match, say so in the significance.

Before you answer, check each finding against the passages it points to and correct or drop any that says more than the speaker did.

A clip earns its place by doing what narration cannot: a distinctive voice, an experience told by the person who lived it, a detail only they would know, an explanation in their words that is clearer than a paraphrase. It should make sense to someone hearing it once, start and end where the speaker does, and say something the narration will not already have said. A figure, a date or a list of facts is narration. A reassurance every official gives is not a clip. A few exceptional clips are better than many adequate ones, and none is often right.

A moment of character, a telling detail or a scene that answers no question may be offered as a clip with no finding, but only when a listener would remember it.`;

export const SYNTHESIS_GUIDE_BUILT_IN = `Write each statement so a reporter could attribute it and defend it. State no more than the findings behind it allow, and keep who said it and how they know whenever it changes how far a claim can be trusted.

Established takes more than volume. Several findings from one source are one source's claim, and an official repeating reassurance is not corroboration of it. Call a claim established when independent sources or a firsthand account and a record agree, contested when credible sources disagree, and uncertain when only one source says it or the accounts do not settle it.

A good tension changes how a claim should be understood: an official count against a local one, a memory against a record, a promise against what happened. Two sources merely emphasizing different things is not a tension. Name what each side rests on.

A gap names something a reporter could go and get: a document, a person, a number, a date. "More research is needed" is not a gap.

Offer a narrative note only for what a paraphrase would lose: a moment, a voice, a telling detail that would be remembered on the air. Most projects have few.`;

export const OUTLINE_GUIDE_BUILT_IN = `Start with the angle. Say, in one sentence a listener could repeat, what this piece is about and why it matters today. If you cannot, the material is not ready and the outline should say what is missing, in a beat marked to check.

Build the spine from what is established, and put the strongest, most specific thing early. Give a tension its own beat: an official account against a firsthand one is usually the story. Leave out what is true but does not serve the angle; a research question that matters to the project does not need a beat in every piece.

A beat that states a number, a name or an attribution should rest on more than one source, or be marked to check. Prefer a firsthand account to an official's summary of it.

Choose clips by walking the story, not by scanning the list. For each place where narration would be flat, ask whether anyone said it better in their own voice; if so, place that clip, and if not, leave the beat as narration. A good clip carries feeling, a scene, or a detail only that person knew, makes sense on its own, and does not repeat the beat before it. Do not use a clip to deliver a figure. Prefer different voices when the choice is close, but never at the cost of a better clip.

A short piece may need three beats and one clip. A longer one needs a turn: somewhere the story complicates itself. Close on something that moves the story forward, not a summary.`;

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

export const PROMPT_SLOTS: readonly PromptSlotDefinition[] = [
  {
    slot: "analyze",
    label: "Analyze guide",
    description:
      "Tells the model what makes a finding worth keeping and a clip worth offering. Used when someone chooses Analyze on a source.",
    tryable: false,
    gives: [
      "The project's title and background text, its research questions (or a note that there are none), and the findings already accepted from its other sources.",
      "The source as numbered sentences (a transcript) or numbered blocks (a document), under headers naming the speaker and time or the page. Web search is available to the model whenever it needs context.",
    ],
    returns: [
      "Findings: a claim, the question it answers (if any), whether the speaker lived it, heard it, believes it or states it as fact, one line on why it matters, and the numbers of the passages it rests on. A few candidate clips, each with a reason and the finding it serves. The web pages the model relied on.",
      "The model returns passage numbers, never text: the code derives times and words. The shape is fixed; your wording decides what is worth keeping and what makes a clip.",
    ],
    builtIn: ANALYZE_GUIDE_BUILT_IN,
  },
  {
    slot: "synthesis",
    label: "Synthesis guide",
    description:
      "Tells the model how to weigh the project's accepted findings against its research questions. Used when someone chooses Synthesize on a project.",
    tryable: false,
    gives: [
      "The project's title and background text, its research questions, and every accepted finding with who said it, how they know it and where.",
      "The current synthesis, when there is one, to revise rather than replace. Tools to search the transcripts and read a passage, so a claim can be checked against the tape.",
    ],
    returns: [
      "A section per question with statements, each with a certainty and the findings it rests on, and the gaps that remain. Tensions between accounts, and a few narrative notes pointing at passages worth keeping.",
      "The model returns finding and passage numbers, never text: the code supplies the words and times. The shape is fixed; your wording decides what counts as established and what is a tension.",
    ],
    builtIn: SYNTHESIS_GUIDE_BUILT_IN,
  },
  {
    slot: "outline",
    label: "Outline guide",
    description:
      "Tells the model what makes a good outline and which clips earn a place in it. Used when someone chooses Outline on a piece.",
    tryable: false,
    gives: [
      "The reporter's direction, the piece's format, the project's research questions, the current synthesis, the accepted findings (numbered) and every excerpt the project has (numbered, with speaker, length and words).",
      "Tools to search the transcripts and read around a finding, so a thin finding can be checked and tape not yet cut can be found.",
    ],
    returns: [
      "An ordered list of beats and actualities. A beat says what that part of the story has to do, which findings carry it, whether to check it, and optionally a stretch of tape worth a look. An actuality is an excerpt, placed by number.",
      "The model returns finding numbers, excerpt numbers and tape refs, never text from a recording or a time: the code supplies those. The shape is fixed; your wording decides what makes a story and which clips earn a place.",
    ],
    builtIn: OUTLINE_GUIDE_BUILT_IN,
  },
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
