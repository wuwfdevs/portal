"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { actionOk, type ActionResult } from "@/lib/action-response";
import { pluralize } from "@/lib/format";
import { acceptSuggestedDataPoints } from "../research-actions";

/**
 * "Accept all" for the suggestions waiting on a screen: one click opens a plain-words
 * confirmation (it is a decision about many things at once, made without reading each), a second
 * runs it. Nothing is deleted by accepting, so the message says how to take a decision back.
 * `run` returns a sentence to show after, or an error.
 */
export function BulkAcceptButton({
  label,
  message,
  confirmLabel,
  run,
  variant = "secondary",
  className,
}: {
  label: string;
  message: ReactNode;
  confirmLabel: string;
  run: () => Promise<ActionResult<{ summary: string }>>;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    const result = await run();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConfirming(false);
    setDone(result.summary);
    router.refresh();
  }

  if (done && !confirming) {
    return (
      <p role="status" className="text-sm text-ink-700">
        {done}
      </p>
    );
  }

  if (!confirming) {
    return (
      <div>
        <Button
          type="button"
          variant={variant}
          className={className ?? "max-sm:w-full"}
          onClick={() => setConfirming(true)}
        >
          {label}
        </Button>
        {error && (
          <p role="alert" className="mt-1.5 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-2.5 rounded border border-line bg-panel-50 p-3">
      <div className="text-sm leading-relaxed text-ink-700">{message}</div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="button" onClick={accept} disabled={busy} className="max-sm:min-h-12">
          {busy ? "Accepting…" : confirmLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="max-sm:min-h-12"
        >
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// The bulk accept wraps its action's count in the sentence shown afterwards.

export function AcceptAllDataPoints({
  projectId,
  sourceId,
  count,
}: {
  projectId: string;
  sourceId?: string;
  count: number;
}) {
  return (
    <BulkAcceptButton
      label={`Accept all ${count}`}
      confirmLabel={`Accept ${pluralize(count, "data point")}`}
      message={
        <>
          Accept {count === 1 ? "the" : `all ${count}`} data point{count === 1 ? "" : "s"} waiting
          for review{sourceId ? " in this source" : " in this project"}? You can still reject or put
          any of them back for review afterwards.
        </>
      }
      run={async () => {
        const result = await acceptSuggestedDataPoints({ projectId, sourceId });
        if (!result.ok) return result;
        return actionOk({
          summary:
            result.count === 0
              ? "Nothing was waiting."
              : `Accepted ${pluralize(result.count, "data point")}.`,
        });
      }}
    />
  );
}
