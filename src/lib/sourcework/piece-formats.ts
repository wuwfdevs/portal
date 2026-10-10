// Piece formats (docs/sourcework-analysis-design.md §6.3, §8): the shape and wording
// the model follows when it drafts a piece. Editors own the language — the sections,
// their guidance, the length, the actuality range and the style paragraph. Code owns
// the block schema and places actualities by excerpt id, so a format can never make
// the model type out a quote. Pure, shared by the editor, the server and the tests.

import { formatClock } from "@/lib/format";

export type FormatSectionType = "narration" | "actuality";

export interface FormatSection {
  type: FormatSectionType;
  /** One line telling the model what goes here. */
  guidance: string;
}

/** One version's content. Stored as jsonb on sw_piece_format_versions.spec. */
export interface FormatSpec {
  targetSeconds: number;
  toleranceSeconds: number;
  minActualities: number;
  maxActualities: number;
  sections: FormatSection[];
  style: string;
}

export const FORMAT_NAME_MAX = 80;
export const SECTION_GUIDANCE_MAX = 300;
export const STYLE_MAX = 2000;
export const MAX_SECTIONS = 16;
export const MAX_ACTUALITIES = 12;
export const MIN_TARGET_SECONDS = 5;
export const MAX_TARGET_SECONDS = 1800;
export const MAX_TOLERANCE_SECONDS = 300;
export const FORMAT_NOTE_MAX = 300;

/** What a new format starts from: a setup, one voice, a close. */
export function blankSpec(): FormatSpec {
  return {
    targetSeconds: 60,
    toleranceSeconds: 5,
    minActualities: 1,
    maxActualities: 2,
    sections: [
      { type: "narration", guidance: "Setup: name the place and the question in one sentence." },
      { type: "actuality", guidance: "Voice: the strongest first-person moment." },
      {
        type: "narration",
        guidance: "Close and sign-off. Leave [REPORTER NAME] as a placeholder.",
      },
    ],
    style: "Plain and factual. Keep sentences short enough to read in one breath.",
  };
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * Reads a stored spec (or an autosaved draft) without judging it: anything not
 * shaped like a spec comes back null. Whether it is good enough to publish or
 * try is validateFormatSpec's question.
 */
export function readFormatSpec(value: unknown): FormatSpec | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    !isInt(raw.targetSeconds) ||
    !isInt(raw.toleranceSeconds) ||
    !isInt(raw.minActualities) ||
    !isInt(raw.maxActualities) ||
    typeof raw.style !== "string" ||
    !Array.isArray(raw.sections)
  ) {
    return null;
  }
  const sections: FormatSection[] = [];
  for (const item of raw.sections) {
    if (typeof item !== "object" || item === null) return null;
    const section = item as Record<string, unknown>;
    if (section.type !== "narration" && section.type !== "actuality") return null;
    if (typeof section.guidance !== "string") return null;
    sections.push({ type: section.type, guidance: section.guidance });
  }
  return {
    targetSeconds: raw.targetSeconds,
    toleranceSeconds: raw.toleranceSeconds,
    minActualities: raw.minActualities,
    maxActualities: raw.maxActualities,
    sections,
    style: raw.style,
  };
}

export type FormatSpecCheck = { ok: true; spec: FormatSpec } | { ok: false; error: string };

const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/;

/** The checks a version must pass before it is tried or published (§8: no placeholders, sane numbers). */
export function validateFormatSpec(input: FormatSpec): FormatSpecCheck {
  const spec: FormatSpec = {
    ...input,
    style: input.style.replace(/\r\n/g, "\n").trim(),
    sections: input.sections.map((section) => ({
      type: section.type,
      guidance: section.guidance.replace(/\s+/g, " ").trim(),
    })),
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
  if (spec.sections.length === 0) return { ok: false, error: "Add at least one section." };
  if (spec.sections.length > MAX_SECTIONS) {
    return { ok: false, error: `A format can have at most ${MAX_SECTIONS} sections.` };
  }
  if (!spec.sections.some((section) => section.type === "narration")) {
    return {
      ok: false,
      error: "Add at least one narration section: the model writes only the narration.",
    };
  }
  const actualitySections = spec.sections.filter((section) => section.type === "actuality").length;
  if (actualitySections > spec.maxActualities) {
    return {
      ok: false,
      error: `There are ${actualitySections} actuality sections but at most ${spec.maxActualities} actualities. Raise the range or remove a section.`,
    };
  }
  for (const [index, section] of spec.sections.entries()) {
    if (!section.guidance)
      return { ok: false, error: `Section ${index + 1} needs a line of guidance.` };
    if (section.guidance.length > SECTION_GUIDANCE_MAX) {
      return {
        ok: false,
        error: `Keep section ${index + 1}'s guidance under ${SECTION_GUIDANCE_MAX} characters.`,
      };
    }
  }
  if (spec.style.length > STYLE_MAX) {
    return {
      ok: false,
      error: `Keep the style under ${STYLE_MAX.toLocaleString("en-US")} characters.`,
    };
  }
  for (const text of [spec.style, ...spec.sections.map((section) => section.guidance)]) {
    const placeholder = PLACEHOLDER.exec(text);
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

/** The card line: "1:00 · 2 to 3 actualities". */
export function describeFormat(spec: FormatSpec): string {
  return `${formatClock(spec.targetSeconds)} · ${actualityRangeLabel(spec)}`;
}

/**
 * The editors' language as the model reads it, appended to the drafting step's
 * fixed framing. Everything here is the format's own wording; nothing in it can
 * change the shape of the answer.
 */
export function renderFormatGuide(name: string, spec: FormatSpec): string {
  const lines = [
    `Format: ${name}.`,
    `Length: ${formatClock(spec.targetSeconds)}, within ${spec.toleranceSeconds} seconds either way.`,
    `Actualities: ${actualityRangeLabel(spec)}.`,
    "",
    "Sections, in order:",
    ...spec.sections.map(
      (section, index) =>
        `${index + 1}. ${section.type === "narration" ? "Narration" : "Actuality"}: ${section.guidance}`,
    ),
  ];
  if (spec.style) lines.push("", "Style:", spec.style);
  return lines.join("\n");
}

/** "0:57 of 1:00", plus "within range" or how far outside it. */
export function lengthAgainstFormat(totalSeconds: number, spec: FormatSpec): string {
  const base = `${formatClock(totalSeconds)} of ${formatClock(spec.targetSeconds)}`;
  const diff = totalSeconds - spec.targetSeconds;
  if (Math.abs(diff) <= spec.toleranceSeconds) return base;
  return `${base}, ${Math.abs(diff)}s ${diff > 0 ? "over" : "under"}`;
}

// Editing the sections list -------------------------------------------------------

export function moveSection(
  sections: readonly FormatSection[],
  index: number,
  delta: -1 | 1,
): FormatSection[] {
  const to = index + delta;
  if (index < 0 || index >= sections.length || to < 0 || to >= sections.length)
    return [...sections];
  const next = [...sections];
  const [moved] = next.splice(index, 1);
  next.splice(to, 0, moved!);
  return next;
}

export function moveSectionTo(
  sections: readonly FormatSection[],
  from: number,
  to: number,
): FormatSection[] {
  if (from === to || from < 0 || to < 0 || from >= sections.length || to >= sections.length) {
    return [...sections];
  }
  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export function insertSection(
  sections: readonly FormatSection[],
  index: number,
  section: FormatSection,
): FormatSection[] {
  const at = Math.min(Math.max(index, 0), sections.length);
  return [...sections.slice(0, at), section, ...sections.slice(at)];
}

export function specsEqual(a: FormatSpec, b: FormatSpec): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
