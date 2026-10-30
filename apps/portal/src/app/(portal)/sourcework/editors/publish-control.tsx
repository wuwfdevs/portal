"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { PROMPT_NOTE_MAX } from "@/lib/sourcework/prompts";

/**
 * Publishing a prompt or a piece format: an optional one-line note, typed beforehand, and one
 * Publish button that publishes. `usePublish` owns the state; `PublishNote`, `PublishButton`
 * and `PublishStatus` are the three pieces a screen places where it wants them (the button
 * also sits in the phone's bottom bar, the note and status in the page). All three read the
 * same control, so the button, the status and the note never disagree.
 */

/** Long enough for a slow database; short enough that nobody stares at a spinner. */
export const PUBLISH_TIMEOUT_MS = 30_000;

type PublishResult = { ok: true; version: number } | { ok: false; error: string };

type PublishState =
  | { kind: "idle" }
  | { kind: "publishing" }
  | { kind: "published"; version: number }
  | { kind: "error"; error: string };

export interface PublishControl {
  note: string;
  setNote: (note: string) => void;
  state: PublishState;
  publish: () => void;
  /** Clears a finished result (the text changed, so it no longer describes it). Never interrupts a publish. */
  dismiss: () => void;
}

class PublishTimeout extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PublishTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function usePublish({
  run,
  onPublished,
}: {
  /** Checks and writes; returns the new version or the message to show. */
  run: (note: string) => Promise<PublishResult>;
  onPublished?: (version: number) => void;
}): PublishControl {
  const [note, setNote] = useState("");
  const [state, setState] = useState<PublishState>({ kind: "idle" });
  // Latest values for the async path, so a click always runs what is on screen now.
  const latest = useRef({ note, run, onPublished });
  useEffect(() => {
    latest.current = { note, run, onPublished };
  });
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const publish = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setState({ kind: "publishing" });
    void (async () => {
      let next: PublishState;
      try {
        const result = await withTimeout(
          latest.current.run(latest.current.note),
          PUBLISH_TIMEOUT_MS,
        );
        next = result.ok
          ? { kind: "published", version: result.version }
          : { kind: "error", error: result.error };
      } catch (error) {
        console.error("Publishing failed:", error);
        next = {
          kind: "error",
          error:
            error instanceof PublishTimeout
              ? "Publishing is taking longer than expected. Reload the page and check History before trying again; it may have gone through."
              : "Couldn't reach the server to publish. Check your connection and try again.",
        };
      }
      busy.current = false;
      if (!mounted.current) return;
      setState(next);
      if (next.kind === "published") {
        setNote("");
        latest.current.onPublished?.(next.version);
      }
    })();
  }, []);

  const dismiss = useCallback(() => {
    setState((current) => (current.kind === "publishing" ? current : { kind: "idle" }));
  }, []);

  return { note, setNote, state, publish, dismiss };
}

/** The optional note, typed before publishing. */
export function PublishNote({
  control,
  id,
  placeholder = "Asks for more detail on places",
  consequence = "Shown in History. Publishing changes what every project’s next run says; the previous version stays available to make live again.",
  className,
}: {
  control: PublishControl;
  /** Unique per editor, for the field's id. */
  id: string;
  placeholder?: string;
  consequence?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={`note-${id}`}>What changed? (optional)</Label>
      <Input
        id={`note-${id}`}
        value={control.note}
        maxLength={PROMPT_NOTE_MAX}
        onChange={(event) => control.setNote(event.target.value)}
        onKeyDown={(event) => {
          // Enter in a one-line field publishes, like any single-field form.
          if (event.key === "Enter" && control.state.kind !== "published") {
            event.preventDefault();
            control.publish();
          }
        }}
        placeholder={placeholder}
        disabled={control.state.kind === "publishing"}
      />
      <p className="mt-1 text-xs text-ink-400">{consequence}</p>
    </div>
  );
}

/** The one Publish button. Busy while publishing, and settled ("Published") until the text changes. */
export function PublishButton({
  control,
  disabled = false,
  className,
}: {
  control: PublishControl;
  /** For a reason the screen knows (the text isn't valid yet). */
  disabled?: boolean;
  className?: string;
}) {
  const publishing = control.state.kind === "publishing";
  const published = control.state.kind === "published";
  return (
    <Button
      type="button"
      onClick={control.publish}
      disabled={disabled || publishing || published}
      aria-busy={publishing || undefined}
      className={cn(className)}
    >
      {publishing && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {publishing ? "Publishing…" : published ? "Published" : "Publish"}
    </Button>
  );
}

/** What happened: the confirmation, or the reason it didn't. */
export function PublishStatus({
  control,
  successMessage,
  children,
  className,
}: {
  control: PublishControl;
  successMessage: (version: number) => string;
  /** Beside a success (a link to where the result lives). */
  children?: ReactNode;
  className?: string;
}) {
  const { state } = control;
  // Always mounted, so a screen reader hears the result when it arrives.
  return (
    <div role="status" aria-live="polite" className={className}>
      {state.kind === "published" && (
        <Alert variant="success" action={children}>
          {successMessage(state.version)}
        </Alert>
      )}
      {state.kind === "error" && <Alert variant="danger">{state.error}</Alert>}
    </div>
  );
}
