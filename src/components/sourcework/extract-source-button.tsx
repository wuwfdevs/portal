"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { progressDetail, requestExtraction } from "@/lib/sourcework/extract-stream";
import { pluralize } from "@/lib/format";

/**
 * Starts extraction for one source and stays with it: the label becomes the
 * part being read, then the screen refreshes so the new data points are there.
 * One request, one source — the Sources tab runs a batch of these through
 * `useTaskQueue` with `requestExtraction` directly (lib/sourcework/extract-stream.ts).
 *
 * Closing the tab ends the request, so a run left unfinished is picked up as
 * stale by the next click (docs/sourcework-analysis-design.md §9: every step is
 * a click; there is no queue).
 */
export function ExtractSourceButton({
  projectId,
  sourceId,
  children = "Extract data points",
  runningLabel = "Extracting data points…",
  variant = "primary",
  className,
}: {
  projectId: string;
  sourceId: string;
  children?: ReactNode;
  runningLabel?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  async function start() {
    setBusy(true);
    setMessage(null);
    setDetail(null);
    const result = await requestExtraction({
      projectId,
      sourceId,
      onProgress: (done, total) => setDetail(progressDetail(done, total)),
    });
    setBusy(false);
    setDetail(null);
    if (result.ok) {
      setMessage({
        tone: "info",
        text:
          result.added === 0
            ? "No new data points were found."
            : `${pluralize(result.added, "data point")} added for review.`,
      });
    } else {
      setMessage({ tone: "error", text: result.error });
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        type="button"
        variant={variant}
        onClick={start}
        disabled={busy}
        aria-busy={busy || undefined}
        className={className ?? "max-lg:min-h-11"}
      >
        {busy ? (detail ?? runningLabel) : children}
      </Button>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-ink-500"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
