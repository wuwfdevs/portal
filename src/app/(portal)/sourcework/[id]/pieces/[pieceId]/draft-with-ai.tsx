"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { BusyPanel } from "@/components/ui/busy-panel";
import { Button } from "@/components/ui/button";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/use-media-query";
import { DIRECTION_MAX } from "@/lib/sourcework/piece-draft-prompt";
import type { MaterialSummary } from "@/lib/sourcework/piece-draft-run";

export interface DraftFormatOption {
  id: string;
  name: string;
  /** "1:00 · 2 to 3 actualities" */
  description: string;
}

/** On a phone the first two formats show, with "Show N more" (the phone board). */
const PHONE_FORMATS = 2;

/**
 * Draft with AI (docs/sourcework-analysis-design.md §6.1): offered once, from an empty piece.
 * Pick a format, the material (accepted themes, all on by default) and an optional direction;
 * the draft becomes the piece's next version. An inline card on a desktop, a full-screen sheet
 * with a fixed bottom bar on a phone.
 */
export function DraftWithAi({
  pieceId,
  getVersion,
  beforeGenerate,
  formats,
  material,
  onCancel,
  onDrafted,
}: {
  pieceId: string;
  /** The version the piece is at when Generate is chosen; the draft is refused if it moved on. */
  getVersion: () => number;
  /** Saves anything typed first, so the version checked is the person's own latest. */
  beforeGenerate: () => Promise<void>;
  formats: DraftFormatOption[];
  material: MaterialSummary;
  onCancel: () => void;
  onDrafted: () => void;
}) {
  const narrow = useMediaQuery("(max-width: 1023px)");
  const [formatId, setFormatId] = useState(formats[0]?.id ?? "");
  const accepted = material.themes.filter((theme) => theme.status === "accepted");
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(accepted.map((theme) => theme.id)),
  );
  const [direction, setDirection] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(themeId: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(themeId)) next.delete(themeId);
      else next.add(themeId);
      return next;
    });
  }

  async function generate() {
    if (!formatId) return;
    setRunning(true);
    setError(null);
    try {
      await beforeGenerate();
      const response = await fetch("/api/sourcework/pieces/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pieceId,
          formatId,
          // Every accepted theme chosen means "all of them", so one accepted while this was open counts too.
          themeIds: chosen.size === accepted.length ? null : [...chosen],
          direction,
          expectVersion: getVersion(),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        { ok: true } | { ok: false; error: string } | null;
      if (data?.ok) {
        onDrafted();
        return;
      }
      setError(
        data && "error" in data ? data.error : "The draft didn't finish. Try again in a minute.",
      );
    } catch {
      setError("The draft didn't finish. Check your connection, then try again.");
    }
    setRunning(false);
  }

  const noFormats = formats.length === 0;
  const visibleFormats =
    narrow && !showAll && formats.length > PHONE_FORMATS
      ? formats.slice(0, PHONE_FORMATS)
      : formats;
  // Keep the choice visible even when it sits past the fold.
  const selectedHidden = !visibleFormats.some((format) => format.id === formatId);
  const shownFormats = selectedHidden
    ? [...visibleFormats, formats.find((format) => format.id === formatId)!]
    : visibleFormats;

  const body = (
    <div className="flex flex-col gap-[18px]">
      {noFormats ? (
        <Alert variant="note">
          No piece formats are published yet. An editor publishes them under Research prompts and
          piece formats.
        </Alert>
      ) : (
        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-ink-700">Format</legend>
          <ChoiceCards
            name="draft-format"
            options={shownFormats.map((format) => ({
              value: format.id,
              title: format.name,
              description: format.description,
            }))}
            value={formatId}
            onChange={setFormatId}
            columns={4}
            className="max-lg:[&_label>span]:min-h-11"
          />
          {narrow && formats.length > PHONE_FORMATS && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-1 min-h-11 text-[13px] font-bold text-brand-link"
            >
              Show {formats.length - PHONE_FORMATS} more
            </button>
          )}
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-ink-700">Material</legend>
        {material.themes.length === 0 ? (
          <p className="text-sm text-ink-500">
            This project has no themes yet, so the draft works from its excerpts alone.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded border border-line">
            {material.themes.map((theme) => {
              const usable = theme.status === "accepted";
              return (
                <li key={theme.id}>
                  <label
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 px-3.5 py-2.5 text-sm",
                      usable ? "cursor-pointer" : "text-ink-500",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={usable && chosen.has(theme.id)}
                      disabled={!usable || running}
                      onChange={() => toggle(theme.id)}
                      className="h-4 w-4 shrink-0 accent-brand-primary max-lg:h-5 max-lg:w-5"
                    />
                    <span className="min-w-0 flex-1">
                      {theme.title}
                      {!usable && " (not yet accepted)"}
                    </span>
                    <span className="shrink-0 text-xs text-ink-500">
                      <span className="max-lg:hidden">
                        {theme.sourceCount} {theme.sourceCount === 1 ? "source" : "sources"} ·{" "}
                      </span>
                      {theme.excerptCount} {theme.excerptCount === 1 ? "excerpt" : "excerpts"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-1.5 text-xs text-ink-400">
          {material.excerptCount === 0
            ? "This project has no excerpts yet, so the draft will be narration only."
            : `Only accepted themes and excerpts are used. Actualities come from accepted excerpts, ${material.excerptCount} available.`}
        </p>
      </fieldset>

      <div>
        <Label htmlFor="draft-direction">
          Direction <span className="font-normal text-ink-400">(optional)</span>
        </Label>
        <Textarea
          id="draft-direction"
          value={direction}
          maxLength={DIRECTION_MAX}
          disabled={running}
          rows={narrow ? 4 : 2}
          onChange={(event) => setDirection(event.target.value)}
          placeholder="Open on the gap in the fence. Keep it neutral about whether the closing was right."
        />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {running && (
        <BusyPanel
          title="Writing the draft"
          hint="This can take a minute or two"
          note="It writes the narration and places your excerpts. Nothing in the piece changes until it finishes, and then it is a version you can edit or undo."
        />
      )}
    </div>
  );

  const generateButton = (
    <Button
      type="button"
      onClick={() => void generate()}
      disabled={running || noFormats}
      className="max-lg:min-h-11 max-lg:flex-[2]"
    >
      {running ? "Writing…" : "Generate draft"}
    </Button>
  );

  if (narrow) {
    return createPortal(
      <div
        role="dialog"
        aria-label="Draft with AI"
        className="fixed inset-0 z-50 flex flex-col bg-white"
      >
        <div className="flex h-[52px] shrink-0 items-center border-b border-line pl-4 pr-2">
          <h2 className="flex-1 font-bold">Draft with AI</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={running}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center text-lg text-ink-500"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pb-24">{body}</div>
        <div className="fixed inset-x-0 bottom-0 flex h-[68px] items-center gap-2.5 border-t border-line bg-white px-4 shadow-[0_-4px_14px_rgba(15,34,53,0.08)]">
          {generateButton}
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={running}
            className="min-h-11 flex-1"
          >
            Cancel
          </Button>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <section
      aria-label="Draft with AI"
      className="mt-5 rounded border border-brand-primary bg-white ring-2 ring-brand-surface"
    >
      <h2 className="border-b border-line px-5 py-3.5 text-sm font-bold">Draft with AI</h2>
      <div className="px-5 py-[18px]">{body}</div>
      <div className="flex items-center gap-3.5 border-t border-line px-5 py-3">
        {generateButton}
        <Button type="button" variant="link" onClick={onCancel} disabled={running}>
          Cancel
        </Button>
        <span className="ml-auto text-xs text-ink-400">
          Writes the narration and places excerpts. It becomes a version you can edit or undo.
        </span>
      </div>
    </section>
  );
}
