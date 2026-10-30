// "Try this draft" for a piece format (docs/sourcework-analysis-design.md §6.3, §8.1): what a
// trial stores and how its two sides are compared. The live version and the editor's draft each
// outline a piece from the same project's accepted findings and excerpts; nothing is written to the
// project. Pure, so the result screen and the run share one shape.

import { formatClock } from "@/lib/format";
import type { PieceBlock } from "./pieces";
import type { FormatSpec } from "./piece-formats";

export type TrialBlock =
  | { type: "beat"; text: string; verify: boolean; anchor?: boolean }
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
  /** The clips the outline placed, added up. Beats take no time, so this is all an outline measures. */
  clipSeconds: number;
  targetSeconds: number;
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

/** The trial's record of one generated outline, with each actuality's words as the screen shows them. */
export function trialSide(args: {
  label: string;
  spec: FormatSpec;
  blocks: readonly PieceBlock[];
  perBlockSeconds: ReadonlyMap<string, number>;
  excerpts: ReadonlyMap<string, { title: string; speaker: string | null; text: string }>;
  warnings: string[];
}): FormatTrialSide {
  let clipSeconds = 0;
  const blocks = args.blocks.flatMap((block): TrialBlock[] => {
    if (block.type === "beat") {
      return [
        {
          type: "beat",
          text: block.text,
          verify: block.verify,
          ...(block.role === "anchor" ? { anchor: true } : {}),
        },
      ];
    }
    // An outline holds beats and actualities only; written narration is not part of one.
    if (block.type === "narration") return [];
    const seconds = args.perBlockSeconds.get(block.id) ?? 0;
    clipSeconds += seconds;
    const excerpt = args.excerpts.get(block.excerpt_id);
    return [
      {
        type: "actuality",
        excerptId: block.excerpt_id,
        title: excerpt?.title ?? "Excerpt",
        speaker: excerpt?.speaker ?? null,
        words: excerpt?.text ?? "",
        seconds,
      },
    ];
  });
  return {
    label: args.label,
    blocks,
    clipSeconds,
    targetSeconds: args.spec.targetSeconds,
    minActualities: args.spec.minActualities,
    maxActualities: args.spec.maxActualities,
    warnings: args.warnings,
  };
}

/** What a side is worth at a glance: "5 beats · 2 actualities · 0:41 of clips", and whether it fits the format. */
export function summarizeTrialSide(side: FormatTrialSide): {
  line: string;
  clipsFit: boolean;
  withinActualities: boolean;
} {
  const beats = side.blocks.filter((block) => block.type === "beat").length;
  const actualities = side.blocks.filter((block) => block.type === "actuality").length;
  // The clips alone can't be longer than the piece; narration is written later.
  const clipsFit = side.clipSeconds <= side.targetSeconds;
  // The range is a guide: fewer clips than usual is a choice, more than the most is flagged.
  const withinActualities = actualities <= side.maxActualities;
  return {
    line: `${beats} ${beats === 1 ? "beat" : "beats"} · ${actualities} ${
      actualities === 1 ? "actuality" : "actualities"
    } · ${formatClock(side.clipSeconds)} of clips`,
    clipsFit,
    withinActualities,
  };
}

function isSide(value: unknown): value is FormatTrialSide {
  if (typeof value !== "object" || value === null) return false;
  const side = value as Record<string, unknown>;
  return (
    typeof side.label === "string" &&
    Array.isArray(side.blocks) &&
    typeof side.clipSeconds === "number" &&
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

/** How long a trial's results are kept (the column default); the screen says so. */
export const TRIAL_KEEP_DAYS = 14;
