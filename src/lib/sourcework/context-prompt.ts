// The background-gathering step (docs/sourcework-analysis-design.md §5.1): what
// the model is told, how the project's sources are boiled down to the names and
// terms worth looking up, the strict output shape, and the checks on what comes
// back. Pure. The model searches the web itself (OpenAI's built-in tool); the
// notes it returns are background only — never quotable, never evidence.

import { collapseWhitespace } from "@/lib/text";
import { hostLabel } from "./research";

export const CONTEXT_FRAMING = `You gather web background for a radio newsroom's research project, so that a reader (and a later model) can understand the places, events, institutions, public figures and terms its sources talk about.

You are given the project's description and research questions, the titles of its sources, and a list of capitalized names and terms those sources use most. Decide which of them a reader would need explained, search the web for them, and return one note per subject.

Each note is: a short title naming the subject, a summary of one or two plain sentences saying what a reader needs to know, and the web address of the page that says it (copied from a search result, never invented). Return at most 8 notes. Return fewer, or none, when nothing needs explaining; do not pad.

Searching: search for places, events, institutions and public figures. Never put the name of anyone who was interviewed into a search, and do not search for private individuals. The newsroom's editors give their guidance below.`;

export const MAX_CONTEXT_NOTES = 8;
export const NOTE_TITLE_MAX = 200;
export const NOTE_SUMMARY_MAX = 600;

// Terms ----------------------------------------------------------------------------

const STOP_WORDS = new Set(
  (
    "i the a an and but or so well oh yeah yes no okay ok um uh we you he she it they my our his her " +
    "their this that these those there here then when what why how who where which monday tuesday " +
    "wednesday thursday friday saturday sunday january february march april may june july august " +
    "september october november december mr mrs ms dr"
  ).split(" "),
);

function isStop(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase().replace(/[.’']s?$/, ""));
}

/**
 * Capitalized names and terms ("Fort Barrancas", "Advanced Redoubt") that recur
 * in the sources' text, most used first. A heuristic over ASR text, which is
 * well capitalized; it only decides what to *offer* the model, which decides
 * what to look up. Names of the people interviewed are removed so they cannot
 * reach a search query.
 */
export function extractCandidateTerms(
  texts: readonly string[],
  options: { exclude?: readonly string[]; limit?: number } = {},
): string[] {
  const limit = options.limit ?? 40;
  const excluded = new Set(
    (options.exclude ?? []).flatMap((name) => name.toLowerCase().split(/\s+/)).filter(Boolean),
  );
  const counts = new Map<string, number>();

  const phrase =
    /\b[A-Z][A-Za-z’'-]*(?:\s+(?:of|the|de|la|del|and)\s+[A-Z][A-Za-z’'-]*|\s+[A-Z][A-Za-z’'-]*)*/g;

  for (const text of texts) {
    for (const match of text.matchAll(phrase)) {
      const words = match[0].split(/\s+/);
      while (words.length > 0 && isStop(words[0]!)) words.shift();
      while (words.length > 0 && isStop(words[words.length - 1]!)) words.pop();
      if (words.length === 0) continue;
      if (words.some((word) => excluded.has(word.toLowerCase()))) continue;
      const term = words.join(" ");
      if (term.length < 3) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([term, count]) => (term.includes(" ") ? count >= 1 : count >= 3))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term);
}

export interface ContextInput {
  projectTitle: string;
  projectDescription: string | null;
  questions: readonly string[];
  sourceTitles: readonly string[];
  terms: readonly string[];
  /** People interviewed — named only to be kept out of searches. */
  speakerNames: readonly string[];
}

export function buildContextInput(input: ContextInput): string {
  const parts = [`Project: ${input.projectTitle}`];
  if (input.projectDescription?.trim()) parts.push(collapseWhitespace(input.projectDescription));
  parts.push(
    "Research questions:\n" + input.questions.map((question, index) => `${index + 1}. ${question}`).join("\n"),
  );
  if (input.sourceTitles.length > 0) {
    parts.push("Sources:\n" + input.sourceTitles.map((title) => `- ${title}`).join("\n"));
  }
  if (input.terms.length > 0) {
    parts.push("Names and terms the sources use most:\n" + input.terms.map((term) => `- ${term}`).join("\n"));
  }
  if (input.speakerNames.length > 0) {
    parts.push(
      "Do not use any of these names in a search: " + input.speakerNames.join(", ") + ".",
    );
  }
  return parts.join("\n\n");
}

export function buildContextOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["notes"],
    properties: {
      notes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "summary", "url"],
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            url: { type: "string" },
          },
        },
      },
    },
  };
}

// Parsing ---------------------------------------------------------------------------

export interface CandidateNote {
  title: string;
  summary: string;
  url: string;
  sourceName: string;
}

export interface ParsedContext {
  notes: CandidateNote[];
  dropped: number;
}

/**
 * Reads the model's notes, dropping any without a title, a summary, or a
 * well-formed web address. When the response carried the pages the search tool
 * actually returned (`seenUrls`), an address that is not one of them is dropped
 * too: the model was told to copy addresses, and one it made up is worse than
 * no note. When the response exposed none, well-formedness is all that can be
 * checked and the notes stand.
 */
export function parseContextOutput(
  raw: string,
  options: { seenUrls: ReadonlySet<string> | null } = { seenUrls: null },
): ParsedContext {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { notes: [], dropped: 0 };
  }
  const items = (parsed as { notes?: unknown } | null)?.notes;
  if (!Array.isArray(items)) return { notes: [], dropped: 0 };

  const notes: CandidateNote[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const item of items) {
    const row = (item ?? {}) as Record<string, unknown>;
    const title = typeof row.title === "string" ? collapseWhitespace(row.title) : "";
    const summary = typeof row.summary === "string" ? collapseWhitespace(row.summary) : "";
    const url = typeof row.url === "string" ? row.url.trim() : "";
    const usable =
      title !== "" &&
      title.length <= NOTE_TITLE_MAX &&
      summary !== "" &&
      summary.length <= NOTE_SUMMARY_MAX &&
      /^https?:\/\//i.test(url) &&
      hostLabel(url) !== "" &&
      (options.seenUrls === null || options.seenUrls.size === 0 || options.seenUrls.has(url));
    if (!usable || seen.has(noteKey(title))) {
      dropped += 1;
      continue;
    }
    seen.add(noteKey(title));
    notes.push({ title, summary, url, sourceName: hostLabel(url) });
    if (notes.length === MAX_CONTEXT_NOTES) break;
  }
  return { notes, dropped };
}

/** What makes two notes the same subject. */
export function noteKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Notes worth adding, given the ones already on file. A dismissed note counts
 * as on file, so a refresh never puts back what a reporter threw away.
 */
export function selectNewNotes(
  candidates: readonly CandidateNote[],
  existing: readonly { title: string; url: string }[],
): CandidateNote[] {
  const titles = new Set(existing.map((note) => noteKey(note.title)));
  const urls = new Set(existing.map((note) => note.url));
  return candidates.filter((note) => !titles.has(noteKey(note.title)) && !urls.has(note.url));
}

// Staleness --------------------------------------------------------------------------

/** A short stable fingerprint of the question list, stored with a context run to tell when the questions have since changed. */
export function questionsFingerprint(questions: readonly string[]): string {
  const text = questions.map((question) => collapseWhitespace(question).toLowerCase()).join("\n");
  let hash = 5381;
  for (let index = 0; index < text.length; index++) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return `${questions.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * Whether background should be gathered now: there are questions, and either it
 * never has been or the questions have changed since the last good run. A
 * failed last run is retried; a running one is left alone.
 */
export function contextNeedsRefresh(input: {
  questions: readonly string[];
  lastRun: { status: "running" | "succeeded" | "failed"; fingerprint: string | null } | null;
}): boolean {
  if (input.questions.length === 0) return false;
  const { lastRun } = input;
  if (!lastRun) return true;
  if (lastRun.status === "running") return false;
  if (lastRun.status === "failed") return true;
  return lastRun.fingerprint !== questionsFingerprint(input.questions);
}
