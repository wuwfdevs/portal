// The prompt slots editors maintain, with their built-in text (docs/sourcework-
// analysis-design.md §8). Editors own the *wording*; code owns the output
// schema, the categories and the variables, so a slot's text is plain language
// appended to a fixed framing (analyze-prompt.ts, synthesis-prompt.ts, piece-outline-prompt.ts) and can
// never change the shape of an answer. Pure.
//
// A slot with no published version runs on the built-in text here. Publishing
// writes a sw_prompt_versions row and moves sw_prompt_live; the run records the
// version it used (null = built-in).

export type PromptSlot = "analyze" | "synthesis" | "outline" | "writing";

export interface PromptSlotDefinition {
  slot: PromptSlot;
  /** The name in the slot list and headings. */
  label: string;
  /** One line under the heading. */
  description: string;
  /** What the model is handed, for the "What the model is given and returns" panel. */
  gives: string[];
  /** What it must hand back, and who decides the shape. */
  returns: string[];
  /** The text that runs until an editor publishes a version. */
  builtIn: string;
}

export const ANALYZE_GUIDE_BUILT_IN = `A finding states what the source establishes, in a sentence a reporter could attribute on the air. Keep who said it, the numbers and dates, and the speaker's own hedges ("he thinks", "around 1960"). Mark what someone lived as firsthand and what they heard as secondhand; an opinion stays an opinion. Prefer the firsthand and the specific to the general, and an official's figures to their reassurances. A source that qualifies or contradicts something already established is worth more than one that repeats it: when two accounts of the same thing differ, or an official account and a firsthand one do not match, say so in the significance.

Before you answer, check each finding against the passages it points to and correct or drop any that says more than the speaker did.

A clip earns its place by doing what narration cannot: a distinctive voice, an experience told by the person who lived it, a detail only they would know, an explanation in their words that is clearer than a paraphrase. It should make sense to someone hearing it once, start and end where the speaker does, and say something the narration will not already have said. A figure, a date or a list of facts is narration. A reassurance every official gives is not a clip. Do not hold a clip back because it answers no research question: the questions say what a finding is for, not what makes good audio. A moment of character, a telling detail, a scene or a way of putting it that a listener would remember should be offered as a clip with no finding, when a listener would remember it. A few exceptional clips are better than many adequate ones, and none is often right.`;

export const SYNTHESIS_GUIDE_BUILT_IN = `Write each statement so a reporter could attribute it and defend it. State no more than the findings behind it allow, and keep who said it and how they know whenever it changes how far a claim can be trusted.

Established takes more than volume. Several findings from one source are one source's claim, and an official repeating reassurance is not corroboration of it. Call a claim established when independent sources or a firsthand account and a record agree, contested when credible sources disagree, and uncertain when only one source says it or the accounts do not settle it.

A good tension changes how a claim should be understood: an official count against a local one, a memory against a record, a promise against what happened. Two sources merely emphasizing different things is not a tension. Name what each side rests on.

A gap names something a reporter could go and get: a document, a person, a number, a date. "More research is needed" is not a gap.

Offer a narrative note only for what a paraphrase would lose: a moment, a voice, a telling detail that would be remembered on the air. Most projects have few.

An emerging theme is what a seasoned reporter would notice going back through this material that the research questions did not ask for: something different people describe on their own, in their own terms, that says more together than any one of them said alone. Neighbors organizing to help one another instead of waiting for official help is the kind of thing meant. You know the project; trust your own read of what matters in it, and offer a theme when you would want the reporter to see it.`;

export const OUTLINE_GUIDE_BUILT_IN = `Start with the angle. Say, in one sentence a listener could repeat, what this piece is about and why it matters today. If you cannot, the material is not ready and the outline should say what is missing, in a beat marked to check.

Build the spine from what is established, and put the strongest, most specific thing early. Give a tension its own beat: an official account against a firsthand one is usually the story. Leave out what is true but does not serve the angle; a research question that matters to the project does not need a beat in every piece.

A beat that states a number, a name or an attribution should rest on more than one source, or be marked to check. Prefer a firsthand account to an official's summary of it.

Choose clips by walking the story, not by scanning the list. For each place where narration would be flat, ask whether anyone said it better in their own voice; if so, place that clip, and if not, leave the beat as narration. A good clip carries feeling, a scene, or a detail only that person knew, makes sense on its own, and does not repeat the beat before it. Do not use a clip to deliver a figure. Prefer different voices when the choice is close, but never at the cost of a better clip.

A short piece may need three beats and one clip. A longer one needs a turn: somewhere the story complicates itself. Close on something that moves the story forward, not a summary.`;

export const WRITING_GUIDE_BUILT_IN = `Write attribution in the past tense, as a professional journalist does: "the mayor said", "she told us", "he remembered", "officials reported". Use the present tense only when the speaker is stating something that is still true and is being said now, in this piece (a live interview, a statement made today), or for a standing fact that needs no attribution. "Says" and "tells" are not the default; "said" and "told" are.

Write for the ear. Short sentences, one idea each, in plain spoken language that can be read aloud in one breath. Put the attribution first when it helps the listener know who is talking ("the mayor said the plan would cost...").

Lead with the newest or most important fact. Do not restate the first line of the story in the anchor intro: the intro sets up the story and the reporter's piece takes it on.

Avoid stacked clauses, jargon and numbers a listener cannot hold. Round figures unless the exact figure is the point, and say what a number means.`;

export const PROMPT_SLOTS: readonly PromptSlotDefinition[] = [
  {
    slot: "analyze",
    label: "Analyze guide",
    description:
      "Tells the model what makes a finding worth keeping and a clip worth offering. Used when someone chooses Analyze on a source.",
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
    slot: "writing",
    label: "Writing guide",
    description:
      "House style for the narration the model writes: tense of attribution and writing for the ear. Used when someone chooses Write from outline.",
    gives: [
      "The outline in order (beats, placed clips and any narration already written), the cited findings, the reporter's direction and the piece's format.",
    ],
    returns: [
      "Narration for each beat, by the beat's number. The accuracy and attribution rules (use only what the material says, never invent, name the speaker before a clip) are fixed in code; your wording decides how the narration reads.",
    ],
    builtIn: WRITING_GUIDE_BUILT_IN,
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
