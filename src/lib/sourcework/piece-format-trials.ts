// "Try this draft" for a piece format (docs/sourcework-analysis-design.md §6.3, §8.1): what a
// trial stores and how its two sides are compared. The live version and the editor's draft each
// draft a piece from the same project's accepted material; nothing is written to the project.
// Pure, so the result screen and the run share one shape.

import { formatClock } from "@/lib/format";
import type { PieceBlock } from "./pieces";
import type { FormatSpec } from "./piece-formats";

export type TrialBlock =
  | { type: "narration"; text: string; seconds: number }
  | {
      type: "actuality";
      excerptId: string;
      title: string;
      speaker: string | null;
      words: string;
      seconds: number;
    };

export interface FormatTrialSide {
  /** "Live v3" or "Draft". */
  label: string;
  blocks: TrialBlock[];
  lengthSeconds: number;
  targetSeconds: number;
  toleranceSeconds: number;
  minActualities: number;
  maxActualities: number;
  warnings: string[];
}

export interface FormatTrialResults {
  kind: "format";
  /** Null when the format had no live version yet: only the draft ran. */
  live: FormatTrialSide | null;
  draft: FormatTrialSide;
}

/** The trial's record of one generated draft, with each actuality's words as the screen shows them. */
export function trialSide(args: {
  label: string;
  spec: FormatSpec;
  blocks: readonly PieceBlock[];
  perBlockSeconds: ReadonlyMap<string, number>;
  lengthSeconds: number;
  excerpts: ReadonlyMap<string, { title: string; speaker: string | null; text: string }>;
  warnings: string[];
}): FormatTrialSide {
  return {
    label: args.label,
    lengthSeconds: args.lengthSeconds,
    targetSeconds: args.spec.targetSeconds,
    toleranceSeconds: args.spec.toleranceSeconds,
    minActualities: args.spec.minActualities,
    maxActualities: args.spec.maxActualities,
    warnings: args.warnings,
    blocks: args.blocks.map((block): TrialBlock => {
      const seconds = args.perBlockSeconds.get(block.id) ?? 0;
      if (block.type === "narration") return { type: "narration", text: block.text, seconds };
      const excerpt = args.excerpts.get(block.excerpt_id);
      return {
        type: "actuality",
        excerptId: block.excerpt_id,
        title: excerpt?.title ?? "Excerpt",
        speaker: excerpt?.speaker ?? null,
        words: excerpt?.text ?? "",
        seconds,
      };
    }),
  };
}

/** What a side is worth at a glance: "0:57 of 1:00 · 2 actualities", and whether it meets the format. */
export function summarizeTrialSide(side: FormatTrialSide): {
  line: string;
  withinLength: boolean;
  withinActualities: boolean;
} {
  const actualities = side.blocks.filter((block) => block.type === "actuality").length;
  const withinLength = Math.abs(side.lengthSeconds - side.targetSeconds) <= side.toleranceSeconds;
  const withinActualities =
    actualities >= side.minActualities && actualities <= side.maxActualities;
  return {
    line: `${formatClock(side.lengthSeconds)} of ${formatClock(side.targetSeconds)} · ${actualities} ${
      actualities === 1 ? "actuality" : "actualities"
    }`,
    withinLength,
    withinActualities,
  };
}

function isSide(value: unknown): value is FormatTrialSide {
  if (typeof value !== "object" || value === null) return false;
  const side = value as Record<string, unknown>;
  return (
    typeof side.label === "string" &&
    Array.isArray(side.blocks) &&
    typeof side.lengthSeconds === "number" &&
    typeof side.targetSeconds === "number"
  );
}

/** Reads a stored trial's results; null for anything not shaped like one (a trial still running). */
export function parseFormatTrialResults(value: unknown): FormatTrialResults | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== "format" || !isSide(raw.draft)) return null;
  if (raw.live !== null && !isSide(raw.live)) return null;
  return {
    kind: "format",
    live: (raw.live as FormatTrialSide | null) ?? null,
    draft: raw.draft,
  };
}
