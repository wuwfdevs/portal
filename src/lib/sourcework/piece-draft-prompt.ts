// What Draft with AI gives the model and what it may return (docs/sourcework-analysis-
// design.md §6.3): the fixed framing, the reporter's accepted material, the strict output
// schema, and the parser that turns an answer into piece blocks. Pure.
//
// The model writes narration only. An actuality is placed by excerpt *number*, which code
// maps to the excerpt's id, so the words and the audio of every clip are always the
// source's own: the model never types a quote. Its inputs are only what a person has
// accepted — accepted themes and their accepted data points, and the project's excerpts —
// never the transcript, and never its own memory of one.
//
// What a piece should look like (the format) is separate language editors own
// (lib/sourcework/piece-formats.ts's renderFormatGuide); it is appended to this framing
// and cannot change the shape of the answer.

import { formatClock } from "@/lib/format";
import { READ_WORDS_PER_MINUTE } from "@/lib/log/read-time";
import {
  MAX_BLOCKS,
  MAX_NARRATION_CHARS,
  newActuality,
  newNarration,
  type PieceBlock,
} from "./pieces";

export const MAX_DRAFT_EXCERPTS = 80;
export const MAX_DRAFT_THEMES = 20;
export const MAX_POINTS_PER_THEME = 30;
export const DIRECTION_MAX = 1000;

export const DRAFT_FRAMING = `You draft a radio piece for a public radio newsroom, from material a reporter has already accepted. You are given the newsroom's format for this kind of piece, the reporter's direction (if any), the project's accepted themes with the accepted data points behind them (short paraphrases of what sources said, each marked "supports" or "complicates"), and the excerpts you may use, numbered, each with its speaker, its length and its words.

Write the piece as an ordered list of blocks. A narration block is what the reporter reads. An actuality block plays an excerpt, the speaker's own voice: you place one only by its excerpt number. Never retype, quote or paraphrase an excerpt's words inside narration, and never write an actuality's words yourself; the clip carries them.

Rules:
- Use only what the material says. Never invent a name, a number, a date, a place or anything a person said. When a sentence needs a fact the material does not give, write a short bracketed placeholder such as [CHECK: year the gap was closed] instead of guessing.
- Attribute what sources said ("he says", "she remembers"). Data points are paraphrases, so do not present them as quotations.
- Name the speaker in the narration before each actuality: a listener cannot see who is talking.
- Follow the format's sections in order, as closely as the material allows. If the material cannot fill an actuality section, leave that section out rather than using an excerpt that does not fit.
- Place each excerpt at most once. Use a number from the list only.
- Aim for the format's length. Narration is read at about ${READ_WORDS_PER_MINUTE} words a minute; add the lengths of the excerpts you place, and size the narration to make up the rest.
- Complicating evidence is part of the story; do not leave it out to make the piece neater.

Return the blocks in order: for a narration block, kind "narration", its text, and excerpt_number 0; for an actuality block, kind "actuality", an empty text, and the excerpt's number. The newsroom's format follows.`;

export interface DraftPointInput {
  claim: string;
  stance: "supports" | "complicates";
  speaker: string | null;
  sourceTitle: string;
}

export interface DraftThemeInput {
  /** 1-based. */
  number: number;
  title: string;
  definition: string;
  points: readonly DraftPointInput[];
}

export interface DraftExcerptInput {
  /** 1-based. */
  number: number;
  id: string;
  title: string;
  speaker: string | null;
  sourceTitle: string;
  seconds: number;
  words: string;
  /** The themes (by number) whose evidence this excerpt exemplifies. */
  themeNumbers: readonly number[];
}

export interface DraftInputArgs {
  projectTitle: string;
  direction: string;
  targetSeconds: number;
  themes: readonly DraftThemeInput[];
  excerpts: readonly DraftExcerptInput[];
}

/** The message the model reads. Everything in it is the reporter's accepted material. */
export function buildDraftInput(args: DraftInputArgs): string {
  const lines: string[] = [`Project: ${args.projectTitle}`, ""];
  lines.push(
    "Direction from the reporter:",
    args.direction.trim() ? args.direction.trim() : "None given.",
    "",
  );

  if (args.themes.length === 0) {
    lines.push("Themes: none chosen. Work from the excerpts alone.", "");
  } else {
    lines.push("Themes (accepted by the reporter, in their words):");
    for (const theme of args.themes) {
      lines.push(`Theme ${theme.number}: ${theme.title}. ${theme.definition}`);
      for (const point of theme.points) {
        const who = [point.speaker, point.sourceTitle].filter(Boolean).join(", ");
        lines.push(`  - (${point.stance}) ${point.claim}${who ? ` [${who}]` : ""}`);
      }
    }
    lines.push("");
  }

  if (args.excerpts.length === 0) {
    lines.push(
      "Excerpts: none. This project has no excerpts yet, so write narration only and leave every actuality section out.",
    );
  } else {
    lines.push("Excerpts you may place, by number. The words are the transcript's:");
    for (const excerpt of args.excerpts) {
      const meta = [
        `Excerpt ${excerpt.number}`,
        formatClock(excerpt.seconds),
        excerpt.speaker ?? "speaker not named",
        excerpt.sourceTitle,
      ];
      if (excerpt.themeNumbers.length > 0) {
        meta.push(
          `${excerpt.themeNumbers.length === 1 ? "theme" : "themes"} ${excerpt.themeNumbers.join(", ")}`,
        );
      }
      lines.push(meta.join(" · "), `“${excerpt.words || excerpt.title}”`);
    }
  }
  lines.push("", `Target length: ${formatClock(args.targetSeconds)}.`);
  return lines.join("\n");
}

export function buildDraftOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "text", "excerpt_number"],
          properties: {
            kind: { type: "string", enum: ["narration", "actuality"] },
            text: { type: "string" },
            excerpt_number: { type: "integer" },
          },
        },
      },
    },
  };
}

export type DraftParse =
  { ok: true; blocks: PieceBlock[]; warnings: string[] } | { ok: false; error: string };

/**
 * Turns the model's answer into blocks. An actuality naming an excerpt it was not
 * shown, or one already placed, is dropped with a warning rather than guessed at;
 * empty narration is dropped. An answer with no narration at all is a failure.
 */
export function parseDraftOutput(
  text: string,
  excerpts: readonly Pick<DraftExcerptInput, "number" | "id">[],
  newId: () => string,
): DraftParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "The draft came back in a shape that couldn't be read. Try again." };
  }
  const items = (raw as { blocks?: unknown })?.blocks;
  if (!Array.isArray(items)) {
    return { ok: false, error: "The draft came back in a shape that couldn't be read. Try again." };
  }

  const byNumber = new Map(excerpts.map((excerpt) => [excerpt.number, excerpt.id]));
  const used = new Set<string>();
  const blocks: PieceBlock[] = [];
  const warnings: string[] = [];

  for (const item of items) {
    if (blocks.length >= MAX_BLOCKS) {
      warnings.push(`The draft was cut at ${MAX_BLOCKS} blocks.`);
      break;
    }
    if (typeof item !== "object" || item === null) continue;
    const block = item as { kind?: unknown; text?: unknown; excerpt_number?: unknown };
    if (block.kind === "narration") {
      const narration =
        typeof block.text === "string" ? block.text.replace(/\s+/g, " ").trim() : "";
      if (!narration) continue;
      blocks.push(newNarration(newId(), narration.slice(0, MAX_NARRATION_CHARS)));
    } else if (block.kind === "actuality") {
      const number = block.excerpt_number;
      const excerptId = typeof number === "number" ? byNumber.get(number) : undefined;
      if (!excerptId) {
        warnings.push(
          `The draft named an excerpt (${String(number)}) it was not given; it was left out.`,
        );
        continue;
      }
      if (used.has(excerptId)) {
        warnings.push(`The draft placed excerpt ${number} twice; the second was left out.`);
        continue;
      }
      used.add(excerptId);
      blocks.push(newActuality(newId(), excerptId));
    }
  }

  if (!blocks.some((block) => block.type === "narration")) {
    return { ok: false, error: "The draft came back with no narration. Try again." };
  }
  return { ok: true, blocks, warnings };
}
