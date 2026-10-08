"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The two-step destructive action: a button that, once clicked, swaps itself
 * for the consequence in plain words and a confirm button. `onConfirm` may be
 * async; a thrown error or a returned `{ error }` string is shown in place and
 * the confirm step stays open so nothing is lost.
 */
export function ConfirmAction({
  label,
  confirmLabel,
  message,
  onConfirm,
  title,
  className,
}: {
  label: string;
  confirmLabel: string;
  message: ReactNode;
  onConfirm: () => void | Promise<void | { error?: string | null }>;
  /** Wraps the control in a titled "Danger zone" panel when given. */
  title?: string;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (result && typeof result === "object" && result.error) {
        setError(result.error);
        setConfirming(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const body = !confirming ? (
    <Button
      type="button"
      variant="secondary"
      className="text-danger"
      onClick={() => setConfirming(true)}
    >
      {label}
    </Button>
  ) : (
    <div className="flex flex-col gap-2.5">
      <div className="text-xs leading-relaxed text-ink-700">{message}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="danger" onClick={run} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <section
      className={cn(title && "rounded border border-danger/30 bg-danger/[0.04] p-4", className)}
    >
      {title && (
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-danger">{title}</h2>
      )}
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      {body}
    </section>
  );
}
