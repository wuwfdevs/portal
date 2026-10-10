"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { BusyPanel } from "@/components/ui/busy-panel";
import { Button } from "@/components/ui/button";
import { pluralize } from "@/lib/format";

// "Review themes" (docs/sourcework-analysis-design.md §5.4): one click, one long
// request. The button lives in the toolbar and a link to it lives in the
// "Waiting for you" strip, while the progress panel and the answer sit below
// both, so the three share one run through a small context.

type Outcome = { themes: number; merges: number; reviewed: number; poolSize: number };

interface ReviewState {
  busy: boolean;
  error: string | null;
  outcome: Outcome | null;
  start: () => void;
}

const ReviewContext = createContext<ReviewState | null>(null);

function useReview(): ReviewState {
  const state = useContext(ReviewContext);
  if (!state) throw new Error("Review themes controls must sit inside <ReviewThemesProvider>.");
  return state;
}

export function ReviewThemesProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const response = await fetch("/api/sourcework/themes/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const body = (await response.json().catch(() => null)) as
        ({ ok: true } & Outcome) | { ok: false; error: string } | null;
      if (!response.ok || !body || body.ok === false) {
        setError(
          (body && body.ok === false ? body.error : null) ?? "Couldn't review themes. Try again.",
        );
      } else {
        setOutcome({
          themes: body.themes,
          merges: body.merges,
          reviewed: body.reviewed,
          poolSize: body.poolSize,
        });
      }
    } catch {
      setError("Couldn't review themes. Check your connection and try again.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <ReviewContext.Provider value={{ busy, error, outcome, start: () => void start() }}>
      {children}
    </ReviewContext.Provider>
  );
}

/** The toolbar's primary button. */
export function ReviewThemesButton({ className }: { className?: string }) {
  const { busy, start } = useReview();
  return (
    <Button type="button" onClick={start} disabled={busy} className={className}>
      Review themes
    </Button>
  );
}

/** The inline "Review themes" in the strip's sentence. */
export function ReviewThemesLink() {
  const { busy, start } = useReview();
  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      className="font-bold text-brand-link hover:underline disabled:text-ink-400 max-lg:min-h-11"
    >
      Review themes
    </button>
  );
}

/** The progress panel while it runs and the answer after. */
export function ReviewThemesStatus() {
  const { busy, error, outcome } = useReview();
  if (busy) {
    return (
      <div className="mb-5">
        <BusyPanel
          title="Reviewing themes"
          hint="This can take a minute or two"
          note="Nothing is added to your themes until you accept it. You can leave this page open in another tab."
        />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mb-5">
        <Alert>{error}</Alert>
      </div>
    );
  }
  if (outcome) {
    const found: string[] = [];
    if (outcome.themes > 0) found.push(pluralize(outcome.themes, "new theme"));
    if (outcome.merges > 0) found.push(pluralize(outcome.merges, "merge suggestion"));
    return (
      <p
        role="status"
        className="mb-5 rounded border border-line bg-white px-4 py-3 text-sm text-ink-700"
      >
        {found.length > 0
          ? `Proposed ${found.join(" and ")}. They are below, waiting for your decision.`
          : "Nothing new to propose this time. The accepted data points either fit your themes or don't yet share a claim."}
        {outcome.poolSize > outcome.reviewed &&
          ` It read the first ${outcome.reviewed} of ${outcome.poolSize} unfiled data points; run it again for the rest.`}
      </p>
    );
  }
  return null;
}
