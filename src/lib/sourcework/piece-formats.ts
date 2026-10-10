// Piece formats (docs/sourcework-analysis-design.md §6.3, §8): the shape and wording
// the model follows when it drafts a piece. Editors own the language: a free-text
// description and style, the length, the actuality range, and whether an anchor leads in. These
// are guardrails; the model decides the blocks. Code owns
// the block schema and places actualities by excerpt id, so a format can never make
// the model type out a quote. Pure, shared by the editor, the server and the tests.

import { formatClock } from "@/lib/format";

/**
 * A format is a set of guardrails, not a block-by-block template. The model assembles the
 * narration and actualities freely from the material it is given; the format says what kind of
 * piece it is (description, style), how long it runs, how many actualities are usual, and
 * whether an anchor reads a lead-in.
 */
export interface FormatSpec {
  targetSeconds: number;
  toleranceSeconds: number;
  minActualities: number;
  maxActualities: number;
  /**
   * The format allows an anchor to read a lead-in to a reporter's recorded piece, written first
   * and kept out of the piece's timed length. Always optional: a piece the anchor reads itself
   * (a reader) has none. Everything else is the piece itself, even when an anchor reads it.
   */
  anchorIntro: boolean;
  /** Free text, in the editors' words: what this kind of piece is, how it sounds. Not a block outline. */
  style: string;
}

export const FORMAT_NAME_MAX = 80;
/** Sized for a converted legacy spec: 16 sections of 300 characters plus the old 2,000-character style. */
export const STYLE_MAX = 7000;
export const MAX_ACTUALITIES = 12;
export const MIN_TARGET_SECONDS = 5;
export const MAX_TARGET_SECONDS = 1800;
export const MAX_TOLERANCE_SECONDS = 300;
export const FORMAT_NOTE_MAX = 300;

/** What a new format starts from. */
export function blankSpec(): FormatSpec {
  return {
    targetSeconds: 60,
    toleranceSeconds: 5,
    minActualities: 1,
    maxActualities: 2,
    anchorIntro: false,
    style:
      "A short voiced story: set up the news and the place, let a voice carry what narration can't, and close with where things stand. Sign off with [REPORTER NAME] as a placeholder. Plain and factual; keep sentences short enough to read in one breath.",
  };
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * Reads a stored spec (or an autosaved draft) without judging it: anything not
 * shaped like a spec comes back null. Whether it is good enough to publish or
 * try is validateFormatSpec's question.
 *
 * Versions are insert-only, so older ones still carry an ordered `sections` list. It is read
 * as free text (every section's guidance, the anchor's included, in order, ahead of the style) and an anchor flag; nothing downstream
 * treats it as a block structure any more.
 */
export function readFormatSpec(value: unknown): FormatSpec | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    !isInt(raw.targetSeconds) ||
    !isInt(raw.toleranceSeconds) ||
    !isInt(raw.minActualities) ||
    !isInt(raw.maxActualities) ||
    typeof raw.style !== "string"
  ) {
    return null;
  }
  let style = raw.style;
  let anchorIntro = raw.anchorIntro === true;
  if (Array.isArray(raw.sections)) {
    const guidance: string[] = [];
    for (const item of raw.sections) {
      if (typeof item !== "object" || item === null) return null;
      const section = item as Record<string, unknown>;
      if (
        section.type !== "narration" &&
        section.type !== "actuality" &&
        section.type !== "anchor"
      ) {
        return null;
      }
      if (typeof section.guidance !== "string") return null;
      if (section.type === "anchor") anchorIntro = true;
      guidance.push(section.guidance.trim());
    }
    style = [...guidance.filter(Boolean), style.trim()].filter(Boolean).join(" ");
  }
  return {
    targetSeconds: raw.targetSeconds,
    toleranceSeconds: raw.toleranceSeconds,
    minActualities: raw.minActualities,
    maxActualities: raw.maxActualities,
    anchorIntro,
    style,
  };
}

export type FormatSpecCheck = { ok: true; spec: FormatSpec } | { ok: false; error: string };

const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/;

/** The checks a version must pass before it is tried or published (§8: no placeholders, sane numbers). */
export function validateFormatSpec(input: FormatSpec): FormatSpecCheck {
  const spec: FormatSpec = {
    ...input,
    anchorIntro: input.anchorIntro === true,
    style: input.style.replace(/\r\n/g, "\n").trim(),
  };
  if (spec.targetSeconds < MIN_TARGET_SECONDS || spec.targetSeconds > MAX_TARGET_SECONDS) {
    return { ok: false, error: "Give the length as something between 0:05 and 30:00." };
  }
  if (spec.toleranceSeconds < 0 || spec.toleranceSeconds > MAX_TOLERANCE_SECONDS) {
    return { ok: false, error: "Plus or minus can be at most 5:00." };
  }
  if (spec.toleranceSeconds >= spec.targetSeconds) {
    return { ok: false, error: "Plus or minus has to be shorter than the length." };
  }
  if (
    spec.minActualities < 0 ||
    spec.maxActualities > MAX_ACTUALITIES ||
    spec.minActualities > spec.maxActualities
  ) {
    return {
      ok: false,
      error: `The actuality range has to run from a smaller number to a larger one, at most ${MAX_ACTUALITIES}.`,
    };
  }
  if (spec.style.length > STYLE_MAX) {
    return {
      ok: false,
      error: `Keep the style under ${STYLE_MAX.toLocaleString("en-US")} characters.`,
    };
  }
  {
    const placeholder = PLACEHOLDER.exec(spec.style);
    if (placeholder) {
      return {
        ok: false,
        error: `“{{${placeholder[1]}}}” is a placeholder, and a format doesn't take any. Describe it in words instead, like [REPORTER NAME].`,
      };
    }
  }
  return { ok: true, spec };
}

export function validateFormatName(
  raw: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Give the format a name." };
  if (name.length > FORMAT_NAME_MAX) return { ok: false, error: "That name is too long." };
  return { ok: true, name };
}

/** "2 to 3 actualities", "1 actuality", "no actualities". */
export function actualityRangeLabel(
  spec: Pick<FormatSpec, "minActualities" | "maxActualities">,
): string {
  const { minActualities: min, maxActualities: max } = spec;
  if (max === 0) return "no actualities";
  if (min === max) return `${min} ${min === 1 ? "actuality" : "actualities"}`;
  return `${min} to ${max} actualities`;
}

/** "0:30–0:46": the lengths a format counts as on target. */
export function lengthRangeLabel(spec: Pick<FormatSpec, "targetSeconds" | "toleranceSeconds">) {
  if (spec.toleranceSeconds === 0) return formatClock(spec.targetSeconds);
  return `${formatClock(spec.targetSeconds - spec.toleranceSeconds)}–${formatClock(spec.targetSeconds + spec.toleranceSeconds)}`;
}

/** The card line: "0:52–1:06 · 1 to 2 actualities". */
export function describeFormat(spec: FormatSpec): string {
  return `${lengthRangeLabel(spec)} · ${actualityRangeLabel(spec)}`;
}

/**
 * The editors' language as the model reads it, appended to the drafting step's
 * fixed framing. Everything here is the format's own wording; nothing in it can
 * change the shape of the answer, and nothing in it prescribes the order of blocks.
 */
export function renderFormatGuide(name: string, spec: FormatSpec): string {
  const lines = [
    `Format: ${name}.`,
    `Length: aim for ${formatClock(spec.targetSeconds)}; ${lengthRangeLabel(spec)} is on target.${spec.anchorIntro ? " The anchor intro is not counted." : ""}`,
    `Actualities: ${actualityRangeLabel(spec)} is the usual range. It is a guide, not a quota: use fewer when fewer clips earn their place, and never add a weaker clip to reach the number.`,
    spec.anchorIntro
      ? "Anchor intro: this format allows one. When the anchor would introduce a reporter's recorded piece, begin with a single anchor_intro block written for the anchor to read. When the anchor or reporter simply reads the piece itself, write none."
      : "Anchor intro: this format has none. Do not write an anchor_intro block.",
    "",
    "You choose how many narration blocks and which actualities, and in what order, from the material you are given.",
  ];
  if (spec.style) lines.push("", "What this kind of piece is, and its style:", spec.style);
  return lines.join("\n");
}

/** "0:57 of 1:00", plus "within range" or how far outside it. */
export function lengthAgainstFormat(totalSeconds: number, spec: FormatSpec): string {
  const base = `${formatClock(totalSeconds)} of ${formatClock(spec.targetSeconds)}`;
  const diff = totalSeconds - spec.targetSeconds;
  if (Math.abs(diff) <= spec.toleranceSeconds) return base;
  return `${base}, ${Math.abs(diff)}s ${diff > 0 ? "over" : "under"}`;
}

export function specsEqual(a: FormatSpec, b: FormatSpec): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
