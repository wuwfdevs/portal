import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";
import {
  summarizeTrialSide,
  type FormatTrialResults,
  type FormatTrialSide,
} from "@/lib/sourcework/piece-format-trials";
import { LocalTime } from "../../local-time";

/**
 * The two outlines side by side (§8.1), Live and Draft as columns on a desktop. On a phone the
 * columns stack, Live above Draft (the design's answer to open question 9).
 */
export function FormatTrialView({
  results,
  projectTitle,
  direction,
  ranAt,
}: {
  results: FormatTrialResults;
  projectTitle: string;
  direction: string;
  ranAt: string;
}) {
  const sides = [results.live, results.draft].filter(
    (side): side is FormatTrialSide => side !== null,
  );
  return (
    <section aria-label="Result" className="flex flex-col gap-3">
      <p className="text-sm text-ink-500">
        Result · {projectTitle} · ran <LocalTime iso={ranAt} />
        {direction && <> · direction: “{direction}”</>}
      </p>
      <div className={cn("grid gap-4", sides.length === 2 && "lg:grid-cols-2")}>
        {sides.map((side) => (
          <TrialColumn key={side.label} side={side} />
        ))}
      </div>
      <p className="text-xs text-ink-400">
        An outline plans a piece; the narration is written afterwards. Beats take no time, so only
        the clips are timed. Actualities show the transcript&rsquo;s words.
      </p>
    </section>
  );
}

function TrialColumn({ side }: { side: FormatTrialSide }) {
  const summary = summarizeTrialSide(side);
  return (
    <div className="flex flex-col rounded border border-line">
      <div className="flex flex-wrap items-baseline gap-x-2 border-b border-line bg-panel-50 px-4 py-2.5">
        <h3 className="text-sm font-bold text-ink-900">{side.label}</h3>
        <span
          className={cn(
            "font-mono text-ui",
            summary.clipsFit && summary.withinActualities ? "text-ink-500" : "text-warning-fg",
          )}
        >
          {summary.line}
        </span>
        {!summary.clipsFit && (
          <span className="text-xs text-warning-fg">
            clips run past the {formatClock(side.targetSeconds)} target
          </span>
        )}
        {!summary.withinActualities && (
          <span className="text-xs text-warning-fg">
            usually {side.minActualities}–{side.maxActualities}
          </span>
        )}
      </div>
      <ol className="flex flex-col divide-y divide-line">
        {side.blocks.map((block, index) => (
          <li key={index} className="px-4 py-2.5">
            <p
              className={cn(
                "text-label font-bold uppercase tracking-[0.05em]",
                block.type === "actuality" ? "text-brand-link" : "text-ink-500",
              )}
            >
              {block.type === "actuality"
                ? `Actuality · ${formatClock(block.seconds)}`
                : block.anchor
                  ? "Anchor intro beat"
                  : "Beat"}
              {block.type === "beat" && block.verify && (
                <span className="font-normal normal-case tracking-normal"> · to check</span>
              )}
              {block.type === "actuality" && block.speaker && (
                <span className="font-normal normal-case tracking-normal"> · {block.speaker}</span>
              )}
            </p>
            <p className="mt-0.5 font-serif text-body leading-snug text-ink-900">
              {block.type === "beat" ? block.text : `“${block.words || block.title}”`}
            </p>
          </li>
        ))}
      </ol>
      {side.warnings.length > 0 && (
        <ul className="border-t border-line px-4 py-2 text-xs text-ink-500">
          {side.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
