"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatClipRange } from "@/lib/sourcework/quotes";
import { pluralize } from "@/lib/format";
import { sourcePath } from "@/lib/transcription/links";
import { SuggestQuotesButton, SuggestQuotesStatus, useSharedSuggestQuotes } from "./suggest-quotes";

export interface ThemeExcerptCard {
  id: string;
  title: string;
  text: string;
  startMs: number;
  endMs: number;
  sourceId: string;
  sourceTitle: string;
}

/**
 * A theme's representative quotes (docs/sourcework-analysis-design.md §5.4, §5.5): the excerpts
 * that exemplify its evidence, and the way into Suggest quotes. With clips already waiting the
 * action is a link to review them; otherwise it runs the step and goes there when it has some.
 */
export function ThemeExcerptsPanel({
  projectId,
  excerpts,
  waiting,
  canSuggest,
  quotesHref,
  variant,
}: {
  projectId: string;
  excerpts: ThemeExcerptCard[];
  waiting: number;
  /** Whether the theme can have quotes suggested: accepted, with supporting evidence from a recording. */
  canSuggest: boolean;
  quotesHref: string;
  /** Which of the page's two places this is; the other is hidden by the breakpoint. */
  variant: "phone" | "desktop";
}) {
  const state = useSharedSuggestQuotes();
  if (!canSuggest && excerpts.length === 0) return null;

  return (
    <section
      aria-label="Excerpts"
      className={cn("flex flex-col gap-2.5", variant === "phone" ? "lg:hidden" : "max-lg:hidden")}
    >
      <div className="flex items-center gap-2.5">
        <h2 className="flex-1 text-xs font-bold uppercase tracking-wide text-ink-400">
          Excerpts{variant === "phone" ? " · " : " ("}
          {excerpts.length}
          {variant === "phone" ? "" : ")"}
        </h2>
        {canSuggest &&
          (waiting > 0 && !state.busy ? (
            <Link
              href={quotesHref}
              className="rounded border border-brand-link px-2.5 py-1.5 text-xs font-bold text-brand-link hover:bg-brand-surface max-lg:flex max-lg:min-h-11 max-lg:items-center max-lg:px-4 max-lg:text-[13px]"
            >
              Review {waiting} suggested
            </Link>
          ) : (
            <SuggestQuotesButton
              state={state}
              className="max-lg:min-h-11 max-lg:px-4 max-lg:text-[13px]"
            />
          ))}
      </div>

      <SuggestQuotesStatus state={state} />

      {excerpts.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {excerpts.map((excerpt) => (
            <li key={excerpt.id} className="rounded border border-line bg-white p-3">
              <Link
                href={sourcePath(excerpt.sourceId, {
                  projectId,
                  t: excerpt.startMs,
                  clip: excerpt.id,
                })}
                className="text-sm font-semibold text-ink-900 hover:text-brand-link hover:underline"
              >
                {excerpt.title}
              </Link>
              <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{excerpt.text}</p>
              <p className="mt-1.5 font-mono text-[11px] text-ink-400">
                {formatClipRange(excerpt.startMs, excerpt.endMs)}
                {" · "}
                {excerpt.sourceTitle}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-500">
          No excerpts yet.{" "}
          {waiting > 0
            ? `${pluralize(waiting, "suggested clip")} ${waiting === 1 ? "is" : "are"} waiting for you.`
            : "Suggest quotes to have the model find clips in this theme’s evidence."}
        </p>
      )}
    </section>
  );
}
