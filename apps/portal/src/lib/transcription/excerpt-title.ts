/**
 * A starting title for a new excerpt, from the words it covers: the first few
 * words, with trailing punctuation dropped and the first letter capitalized.
 * The reporter can overwrite it at once or rename it later; a suggestion
 * costs a keystroke less than a blank box on every excerpt.
 */
export function suggestExcerptTitle(excerpt: string, maxWords = 8): string {
  const words = excerpt.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const title = words
    .slice(0, maxWords)
    .join(" ")
    .replace(/[\s,;:\-–—.!?"'“”]+$/u, "");
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Longest a proposed title may run, in words and characters; an export filename keeps even less. */
const PROPOSED_MAX_WORDS = 9;
const PROPOSED_MAX_CHARS = 80;

/**
 * What the model is told when it names an excerpt. The title doubles as the quote id in the
 * exported file name (story_speaker_quote.wav), so it says what the speaker says, briefly,
 * and never repeats who is speaking, which the file name carries separately.
 */
export const EXCERPT_TITLE_FRAMING = `You name a short audio excerpt from an interview or news conference for a public radio newsroom. You are given the words of the excerpt. Return a title of three to seven words that says what the speaker says, in plain words a producer would recognize in a file list, for example "Second fatality from generator fumes" or "Dark traffic signals are four-way stops".
- Describe the point of the excerpt, not its first words. Prefer the concrete fact or claim over a topic label.
- Do not include the speaker's name or title, quotation marks, or a trailing period.
- Use only what the words say. Do not add a number, name or place that is not in them.
- Sentence case: capitalize the first word and proper names only.`;

export function buildExcerptTitleSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title"],
    properties: { title: { type: "string" } },
  };
}

/**
 * Reads the model's answer and tidies it into a title, or returns `fallback` when it isn't
 * usable: not JSON, empty, or nothing but punctuation. Never throws, so a bad answer can only
 * ever leave the first-words title in place.
 */
export function cleanProposedTitle(text: string, fallback: string): string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fallback;
  }
  const value = (raw as { title?: unknown } | null)?.title;
  if (typeof value !== "string") return fallback;
  const words = value
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s,;:\-–—.!?]+$/u, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, PROPOSED_MAX_WORDS);
  let title = words.join(" ");
  if (title.length > PROPOSED_MAX_CHARS) {
    title = title.slice(0, PROPOSED_MAX_CHARS).replace(/\s+\S*$/, "");
  }
  title = title.replace(/[\s,;:\-–—.!?]+$/u, "");
  if (!/[A-Za-z0-9]/.test(title)) return fallback;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** The story, speaker and quote parts of an excerpt's name, when it is stored in full ("Story_Speaker_Quote"). */
export interface ExcerptNameParts {
  story: string;
  speaker: string;
  quote: string;
}

/** Underscores separate the parts, so they can't appear inside one. */
function namePart(text: string): string {
  return text.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

/** "Hurricane Isaias_Chip Simmons_Second fatality from generator fumes": the whole convention as the excerpt's own name. */
export function composeExcerptName(story: string, speaker: string | null, quote: string): string {
  const parts = parseExcerptName(quote);
  if (parts) return quote;
  return `${namePart(story) || "Untitled"}_${namePart(speaker ?? "") || "Unnamed"}_${namePart(quote)}`;
}

/** Reads a stored full name, or null for a title that is only the quote. */
export function parseExcerptName(name: string): ExcerptNameParts | null {
  const pieces = name.split("_");
  if (pieces.length < 3) return null;
  const [story, speaker, ...rest] = pieces.map(namePart);
  const quote = rest.filter(Boolean).join(" ");
  if (!story || !speaker || !quote) return null;
  return { story, speaker, quote };
}
