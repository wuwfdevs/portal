"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ControlRow } from "@/components/ui/control-row";
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
      className="text-danger max-lg:min-h-12 max-lg:w-full"
      onClick={() => setConfirming(true)}
    >
      {label}
    </Button>
  ) : (
    <div className="flex flex-col gap-2.5">
      <div className="text-sm leading-relaxed text-ink-700 lg:text-xs">{message}</div>
      <ControlRow>
        <Button
          type="button"
          variant="danger"
          onClick={run}
          disabled={busy}
          className="max-lg:min-h-12"
        >
          {busy ? "Working…" : confirmLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          touch
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="max-lg:min-h-12"
        >
          Cancel
        </Button>
      </ControlRow>
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

/**
 * The same two steps for a button that submits a plain `<form action>` (most deletes here are one):
 * it shows the label as a danger link; clicking it swaps in the consequence and a Cancel and a
 * confirm button that is the form's real submit, so nothing runs until the second click. A
 * `formAction` and `formNoValidate` pass through to that confirm button for a form with more than
 * one action. `trigger="button"` shows the first step as a boxed button instead of a link.
 */
export function ConfirmSubmit({
  label,
  confirmLabel,
  message,
  formAction,
  formNoValidate,
  trigger = "link",
  className,
}: {
  label: string;
  confirmLabel: string;
  message: ReactNode;
  formAction?: ComponentProps<"button">["formAction"];
  formNoValidate?: boolean;
  trigger?: "link" | "button";
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant={trigger === "link" ? "danger-link" : "secondary"}
        touch={trigger === "link"}
        className={cn(trigger === "button" && "text-danger", className)}
        onClick={() => setConfirming(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2.5 text-left", className)}>
      <div className="text-sm leading-relaxed text-ink-700">{message}</div>
      <ControlRow>
        <Button type="button" variant="ghost" touch onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="danger"
          formAction={formAction}
          formNoValidate={formNoValidate}
        >
          {confirmLabel}
        </Button>
      </ControlRow>
    </div>
  );
}
