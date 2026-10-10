"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { CLAIM_MAX, formatSpans, type DataPoint } from "@/lib/sourcework/research";
import { editDataPoint, reviewDataPoint } from "../research-actions";
import { PlayIcon } from "./transport-icons";

/** Same meaning as ClipSelectionOrigin: which side the selection came from decides what scrolls. */
export type PointSelectionOrigin = "transcript" | "rail";

/**
 * One data point in the rail. Unreviewed points are dashed with Accept / Edit /
 * Reject; accepted ones are solid; a rejected one is quiet and can be put back.
 * Every decision is a plain write followed by a refresh — nothing is deleted.
 */
export function DataPointCard({
  point,
  tag,
  isSelected,
  selectionOrigin,
  onSelect,
  onPlay,
  onOpen,
  openLabel,
  themes = [],
  excerpts = [],
}: {
  point: DataPoint;
  tag: string;
  isSelected: boolean;
  selectionOrigin: PointSelectionOrigin | null;
  onSelect: () => void;
  /** Plays the first span (audio and video only). */
  onPlay?: () => void;
  /** Opens the point where it lives: the transcript tab on a phone, the page for a document. */
  onOpen?: () => void;
  openLabel?: string;
  /** The accepted themes this point sits in; shown on a point a person has accepted. */
  themes?: { href: string; title: string; stance: "supports" | "complicates" }[];
  /** The excerpts that exemplify this point (accepted suggested quotes). */
  excerpts?: { href: string; title: string }[];
}) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(point.claim);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSelected || selectionOrigin === "rail") return;
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isSelected, selectionOrigin]);

  async function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await work();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't save that. Try again.");
      return false;
    }
    router.refresh();
    return true;
  }

  const decide = (decision: "accept" | "reject" | "undo") =>
    run(() => reviewDataPoint({ id: point.id, decision }));

  async function save() {
    if (await run(() => editDataPoint({ id: point.id, claim: draft }))) setEditing(false);
  }

  const suggested = point.status === "suggested";
  const rejected = point.status === "rejected";
  const time = formatSpans(point.spans);

  return (
    <div
      ref={cardRef}
      onClick={onSelect}
      className={cn(
        "rounded border bg-white p-3",
        suggested ? "border-dashed" : "border-solid",
        isSelected ? "border-brand-primary ring-2 ring-brand-surface" : "border-line",
        suggested && !isSelected && "border-ink-400",
        rejected && "opacity-70",
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">{tag}</p>

      {editing ? (
        <div className="mt-1.5" onClick={(event) => event.stopPropagation()}>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            maxLength={CLAIM_MAX}
            autoFocus
            aria-label="Data point"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={busy || draft.trim() === ""}
              className="max-lg:min-h-11"
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditing(false);
                setDraft(point.claim);
                setError(null);
              }}
              className="max-lg:min-h-11"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm leading-snug text-ink-900 max-lg:text-base">{point.claim}</p>
      )}

      {time &&
        (onOpen ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            aria-label={openLabel ?? `Open ${time}`}
            className="mt-1 block font-mono text-[11px] text-ink-500 hover:text-brand-link hover:underline max-lg:min-h-11 max-lg:text-xs"
          >
            {time}
          </button>
        ) : (
          <p className="mt-1 font-mono text-[11px] text-ink-500">{time}</p>
        ))}

      {!editing && (
        <div
          className="mt-2 flex flex-wrap items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {onPlay && (
            <button
              type="button"
              onClick={onPlay}
              aria-label="Play this passage"
              title="Play this passage"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand-link text-brand-link transition-colors hover:bg-brand-surface lg:h-7 lg:w-7"
            >
              <PlayIcon className="ml-0.5 h-2.5 w-2.5" />
            </button>
          )}
          {!onPlay && onOpen && (
            <Button
              type="button"
              variant="link"
              onClick={onOpen}
              className="text-brand-link max-lg:min-h-11"
            >
              Go to page
            </Button>
          )}
          {suggested && (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => void decide("accept")}
                disabled={busy}
                className="max-lg:min-h-11 max-lg:px-4"
              >
                Accept
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setDraft(point.claim);
                  setEditing(true);
                }}
                disabled={busy}
                className="max-lg:min-h-11 max-lg:px-4"
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void decide("reject")}
                disabled={busy}
                className="max-lg:min-h-11 max-lg:px-4"
              >
                Reject
              </Button>
            </>
          )}
          {point.status === "accepted" && (
            <>
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setDraft(point.claim);
                  setEditing(true);
                }}
                className="text-brand-link max-lg:min-h-11"
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="link"
                onClick={() => void decide("undo")}
                disabled={busy}
                className="font-normal text-ink-500 max-lg:min-h-11"
              >
                Undo
              </Button>
            </>
          )}
          {rejected && (
            <Button
              type="button"
              variant="link"
              onClick={() => void decide("undo")}
              disabled={busy}
              className="text-brand-link max-lg:min-h-11"
            >
              Put back for review
            </Button>
          )}
        </div>
      )}

      {point.status === "accepted" && themes.length > 0 && !editing && (
        <p className="mt-2 text-xs text-ink-500" onClick={(event) => event.stopPropagation()}>
          {themes.map((theme, index) => (
            <span key={theme.href}>
              {index > 0 && " · "}
              {themes.length === 1 || index === 0 ? "Theme: " : ""}
              <Link
                href={theme.href}
                className="font-semibold text-brand-link hover:underline max-lg:inline-block max-lg:py-2.5"
              >
                {theme.title}
              </Link>
              {theme.stance === "complicates" && " (complicates)"}
            </span>
          ))}
        </p>
      )}

      {point.status === "accepted" && excerpts.length > 0 && !editing && (
        <p className="mt-1 text-xs text-ink-500" onClick={(event) => event.stopPropagation()}>
          {excerpts.map((excerpt, index) => (
            <span key={excerpt.href}>
              {index > 0 && " · "}
              {index === 0 ? "Excerpt: " : ""}
              <Link
                href={excerpt.href}
                className="font-semibold text-brand-link hover:underline max-lg:inline-block max-lg:py-2.5"
              >
                {excerpt.title}
              </Link>
            </span>
          ))}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
