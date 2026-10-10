"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { BusyPanel } from "@/components/ui/busy-panel";
import { Button } from "@/components/ui/button";
import { pluralize } from "@/lib/format";

// "Suggest quotes" (docs/sourcework-analysis-design.md §5.5): one click, one long request. The
// button sits in a header and the progress panel and the answer sit under it, so the hook is
// shared by the theme page's Excerpts panel and the suggested-quotes screen.

type Outcome = { suggested: number; skippedDecided: number; skippedSources: number };

export function useSuggestQuotes(args: {
  projectId: string;
  themeId: string;
  /** Where to go once clips are waiting; leave out to stay and refresh. */
  goToHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    setOutcome(null);
    let arrived = false;
    try {
      const response = await fetch("/api/sourcework/themes/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: args.projectId, themeId: args.themeId }),
      });
      const body = (await response.json().catch(() => null)) as
        ({ ok: true } & Outcome) | { ok: false; error: string } | null;
      if (!response.ok || !body || body.ok === false) {
        setError(
          (body && body.ok === false ? body.error : null) ?? "Couldn't suggest quotes. Try again.",
        );
      } else if (body.suggested > 0 && args.goToHref) {
        arrived = true;
        router.push(args.goToHref);
      } else {
        setOutcome({
          suggested: body.suggested,
          skippedDecided: body.skippedDecided,
          skippedSources: body.skippedSources,
        });
      }
    } catch {
      setError("Couldn't suggest quotes. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (!arrived) router.refresh();
    }
  }

  return { busy, error, outcome, start: () => void start() };
}

export type SuggestQuotesState = ReturnType<typeof useSuggestQuotes>;

export function SuggestQuotesButton({
  state,
  label = "Suggest quotes",
  className,
}: {
  state: SuggestQuotesState;
  label?: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={state.start}
      disabled={state.busy}
      className={className}
    >
      {label}
    </Button>
  );
}

/** The progress panel while it runs and the answer after. */
export function SuggestQuotesStatus({ state }: { state: SuggestQuotesState }) {
  if (state.busy) {
    return (
      <BusyPanel
        title="Choosing quotes"
        hint="This can take a minute or two"
        note="Nothing becomes an excerpt until you accept it. You can leave this page open in another tab."
      />
    );
  }
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.outcome) {
    const { suggested, skippedDecided, skippedSources } = state.outcome;
    const notes: string[] = [];
    if (skippedDecided > 0) {
      notes.push(
        `${pluralize(skippedDecided, "clip")} you had already decided on weren’t offered again.`,
      );
    }
    if (skippedSources > 0) {
      notes.push(
        `${pluralize(skippedSources, "source")} without a ready transcript ${skippedSources === 1 ? "was" : "were"} left out.`,
      );
    }
    return (
      <p
        role="status"
        className="rounded border border-line bg-white px-4 py-3 text-sm text-ink-700"
      >
        {suggested > 0
          ? `Suggested ${pluralize(suggested, "clip")}.`
          : "The model didn’t find a clip in this theme’s evidence that works on air."}{" "}
        {notes.join(" ")}
      </p>
    );
  }
  return null;
}

// The theme page shows the Excerpts panel in two places (above the evidence on a phone, beside it on
// a desktop), so one run is shared between them through a small context, as Review themes does.

const SuggestQuotesContext = createContext<SuggestQuotesState | null>(null);

export function SuggestQuotesProvider({
  projectId,
  themeId,
  goToHref,
  children,
}: {
  projectId: string;
  themeId: string;
  goToHref?: string;
  children: ReactNode;
}) {
  const state = useSuggestQuotes({ projectId, themeId, goToHref });
  return <SuggestQuotesContext.Provider value={state}>{children}</SuggestQuotesContext.Provider>;
}

export function useSharedSuggestQuotes(): SuggestQuotesState {
  const state = useContext(SuggestQuotesContext);
  if (!state) throw new Error("Suggest quotes controls must sit inside <SuggestQuotesProvider>.");
  return state;
}
