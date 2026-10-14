"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { BusyPanel } from "@/components/ui/busy-panel";
import { Button } from "@/components/ui/button";
import { TextLink } from "@/components/ui/primary-link";
import { Label, Textarea } from "@/components/ui/input";
import { DIRECTION_MAX } from "@/lib/sourcework/piece-standards";

const COPY = {
  outline: {
    heading: "Outline with AI",
    action: "Outline the piece",
    running: "Outlining…",
    busyTitle: "Outlining the piece",
    busyNote:
      "It reads your accepted findings and excerpts, and may check the transcripts as it goes. Nothing in the piece changes until it finishes, and then it is a version you can edit or undo.",
    footer:
      "Writes beats and places excerpts; no narration yet. It becomes a version you can edit or undo.",
    directionPlaceholder:
      "Open on the neighbours with chainsaws. Keep the county's numbers short and attributed.",
    endpoint: "/api/sourcework/pieces/outline",
  },
  expand: {
    heading: "Write from outline",
    action: "Write the narration",
    running: "Writing…",
    busyTitle: "Writing the narration",
    busyNote:
      "It writes each beat out as narration and leaves your excerpts and anything you wrote alone. Nothing in the piece changes until it finishes, and then it is a version you can edit or undo.",
    footer: "Replaces each beat with narration, in place. Excerpts stay as they are.",
    directionPlaceholder: "Keep it plain and a little warm. Name the county in the first sentence.",
    endpoint: "/api/sourcework/pieces/expand",
  },
} as const;

/**
 * One card for both outline runs (docs/sourcework-analysis-design.md §22): "Outline" on an empty piece
 * (beats and excerpts from the project's accepted findings), and "Write from outline" on a piece that
 * has beats (narration at each beat's place). The piece's format, chosen once in the editor's header, is
 * optional guidance on length and style; this card shows it and never asks for it a second time.
 */
export function OutlineWithAi({
  mode,
  pieceId,
  readinessMessage = null,
  reviewHref,
  getVersion,
  beforeGenerate,
  formatId,
  formatName,
  onCancel,
  onDone,
}: {
  mode: "outline" | "expand";
  pieceId: string;
  /** Why this run would be thin (no accepted excerpts), or null when the project is ready. */
  readinessMessage?: string | null;
  /** Where the findings and clips waiting for a decision are reviewed. */
  reviewHref?: string;
  /** The version the piece is at when the run starts; refused if it moved on. */
  getVersion: () => number;
  /** Saves anything typed first, so the version checked is the person's own latest. */
  beforeGenerate: () => Promise<void>;
  /** The piece's format (set in the header), or null for none. */
  formatId: string | null;
  formatName: string | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const copy = COPY[mode];
  const [direction, setDirection] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      await beforeGenerate();
      const response = await fetch(copy.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pieceId,
          formatId,
          direction,
          expectVersion: getVersion(),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        { ok: true } | { ok: false; error: string } | null;
      if (data?.ok) {
        onDone();
        return;
      }
      setError(data && "error" in data ? data.error : "It didn't finish. Try again in a minute.");
    } catch {
      setError("It didn't finish. Check your connection, then try again.");
    }
    setRunning(false);
  }

  return (
    <section
      aria-label={copy.heading}
      className="mt-5 rounded border border-brand-primary bg-white ring-2 ring-brand-surface"
    >
      <h2 className="border-b border-line px-5 py-3.5 text-sm font-bold max-lg:px-4">
        {copy.heading}
      </h2>
      <div className="flex flex-col gap-[18px] px-5 py-[18px] max-lg:px-4">
        <p className="text-[13px] text-ink-700">
          {formatName ? (
            <>
              Writing to the <strong>{formatName}</strong> format.
            </>
          ) : (
            "No format chosen, so there is no target length or style guide."
          )}{" "}
          <span className="text-ink-500">Change it with Format at the top of the piece.</span>
        </p>
        <div>
          <Label htmlFor={`outline-direction-${mode}`}>
            Direction <span className="font-normal text-ink-400">(optional)</span>
          </Label>
          <Textarea
            id={`outline-direction-${mode}`}
            value={direction}
            maxLength={DIRECTION_MAX}
            disabled={running}
            rows={3}
            onChange={(event) => setDirection(event.target.value)}
            placeholder={copy.directionPlaceholder}
          />
        </div>
        {readinessMessage && (
          <Alert variant="warning">
            {readinessMessage}
            {reviewHref && (
              <>
                {" "}
                <TextLink href={reviewHref} className="px-0 font-bold">
                  Review what is waiting
                </TextLink>
              </>
            )}
          </Alert>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
        {running && (
          <BusyPanel
            title={copy.busyTitle}
            hint="This can take a few minutes"
            note={copy.busyNote}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3.5 border-t border-line px-5 py-3 max-lg:px-4">
        <Button
          type="button"
          ai
          onClick={() => void run()}
          disabled={running}
          className="max-lg:min-h-11"
        >
          {running ? copy.running : copy.action}
        </Button>
        <Button type="button" variant="link" touch onClick={onCancel} disabled={running}>
          Cancel
        </Button>
        <span className="ml-auto text-xs text-ink-400 max-lg:hidden">{copy.footer}</span>
      </div>
    </section>
  );
}
