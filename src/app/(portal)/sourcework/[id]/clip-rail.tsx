"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSyncedState } from "@/lib/use-synced-state";
import { usePoller } from "@/lib/use-poller";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { Segmented } from "@/components/ui/segmented";
import { formatDuration } from "@/lib/transcription/media";
import {
  CLIP_FILTER_THRESHOLD,
  CLIP_PAGE_SIZE,
  filterClips,
  orderClips,
  type ClipOrder,
} from "@/lib/transcription/clip-order";
import {
  deleteClip,
  exportClip,
  getClipDownloadUrl,
  getExcerptLoudnessStatus,
  renameClip,
  setClipGainMode,
  updateClipTrim,
} from "./clip-actions";
import { PauseIcon, PlayIcon } from "./transport-icons";
import type { ProjectClip } from "@/lib/transcription/clips";
import { formatGainDb, type GainMode } from "@/lib/sourcework/loudness";

// Nudge steps, in the order radio editors reach for them: coarse out, fine
// out, fine in, coarse in (see docs/transcription-workspace-design.md §3D).
const NUDGE_STEPS_MS = [-250, -50, 50, 250];

/** How often the rail checks whether background measuring has landed, and how many checks before it gives up. */
const LOUDNESS_POLL_MS = 3000;
const LOUDNESS_POLL_LIMIT = 40;

/** Said beside the Level when it stopped short of the broadcast target. */
const GAIN_LIMIT_NOTE: Record<string, string> = {
  peak: " (held back to keep peaks in range)",
  boost: " (very quiet tape)",
  cut: " (very loud tape)",
  short: " (short clip)",
};

/** How long the trim can sit still before it's written — see nudge(). */
const TRIM_COMMIT_DELAY_MS = 400;

/**
 * Where the current clip selection came from, which is what decides whether
 * a card scrolls itself into view: a clip picked in the rail is already under
 * the pointer, and one picked in the transcript only needs finding if it
 * happens to be off screen.
 */
export type ClipSelectionOrigin = "deep-link" | "transcript" | "rail";

export function ClipRail({
  clips,
  selectedClipId,
  selectionOrigin,
  onSelect,
  onHover,
  onTrimPreview,
  onPreview,
  playingClipId = null,
  onPause,
  onShowInTranscript,
}: {
  clips: ProjectClip[];
  /** The clip marked in the transcript too — from ?clip=, a click here, or a click on the text. */
  selectedClipId?: string | null;
  selectionOrigin?: ClipSelectionOrigin | null;
  onSelect: (clipId: string) => void;
  /** Hover and focus alike, so tabbing through the rail marks the transcript the same way pointing at it does. */
  onHover: (clipId: string | null) => void;
  /** An in-progress trim, so the transcript's mark tracks the nudge instead of the write. */
  onTrimPreview: (clipId: string, range: { startMs: number; endMs: number }) => void;
  /** `clipId` says which card asked, so the workspace can tell the cards apart even when two excerpts share a range. */
  onPreview: (startMs: number, endMs: number, clipId?: string) => void;
  /** The excerpt the player is previewing right now, if any — its card shows Pause instead of Play. */
  playingClipId?: string | null;
  onPause?: () => void;
  /** Below lg the transcript is another tab, so a card offers a way back to its words. */
  onShowInTranscript?: () => void;
}) {
  const [order, setOrder] = useState<ClipOrder>("in_order");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(CLIP_PAGE_SIZE);

  // Excerpts made before loudness existed are measured in the background after this page is sent,
  // so the first view shows "measuring…". Check on them, and refresh once a measurement lands.
  // Every pending excerpt counts, including ones set to their original level: the background batch
  // is the first few unmeasured excerpts whatever their setting, so watching only the "auto" ones
  // could miss the batch entirely and never refresh to start the next one.
  const pendingIds = useMemo(
    () => clips.filter((clip) => clip.loudnessState === "pending").map((clip) => clip.id),
    [clips],
  );
  const loudnessPolls = useRef(0);
  usePoller({
    intervalMs: LOUDNESS_POLL_MS,
    enabled: pendingIds.length > 0,
    task: async () => {
      if (loudnessPolls.current >= LOUDNESS_POLL_LIMIT) return false;
      loudnessPolls.current += 1;
      const result = await getExcerptLoudnessStatus(pendingIds);
      if (!("done" in result) || result.done.length === 0) return false;
      // Progress: the next batch of unmeasured excerpts gets a fresh allowance.
      loudnessPolls.current = 0;
      return true;
    },
  });

  const visible = useMemo(
    () => filterClips(orderClips(clips, order), query),
    [clips, order, query],
  );
  // A clip picked from the transcript (or a deep link) may be past the page
  // being shown; show enough of the list to include it, or it would never
  // scroll into view.
  const selectedIndex = visible.findIndex((clip) => clip.id === selectedClipId);
  const limit = Math.max(shown, selectedIndex + 1);
  const page = visible.slice(0, limit);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeading level="eyebrow" className="items-center max-lg:hidden">
        Excerpts{clips.length > 0 && ` (${clips.length})`}
      </SectionHeading>

      {clips.length > 1 && (
        <Segmented
          name="clip-order"
          options={[
            { value: "in_order", label: "In order" },
            { value: "newest", label: "Newest" },
          ]}
          value={order}
          onChange={setOrder}
        />
      )}
      {clips.length > CLIP_FILTER_THRESHOLD && (
        <Input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShown(CLIP_PAGE_SIZE);
          }}
          placeholder="Filter excerpts"
          aria-label="Filter excerpts"
          className="px-2.5 py-1.5"
        />
      )}

      {clips.length === 0 ? (
        <EmptyState compact>Select some transcript text to make your first excerpt.</EmptyState>
      ) : visible.length === 0 ? (
        <p className="text-sm text-ink-500">No excerpt matches “{query}”.</p>
      ) : (
        <>
          {page.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              isSelected={clip.id === selectedClipId}
              selectionOrigin={selectionOrigin ?? null}
              onSelect={() => onSelect(clip.id)}
              onHover={onHover}
              onTrimPreview={onTrimPreview}
              onPreview={onPreview}
              isPlaying={Boolean(onPause) && playingClipId === clip.id}
              onPause={onPause}
              onShowInTranscript={onShowInTranscript}
            />
          ))}
          {visible.length > page.length && (
            <Button
              type="button"
              variant="link"
              onClick={() => setShown(limit + CLIP_PAGE_SIZE)}
              className="self-start text-brand-link"
            >
              Show {Math.min(CLIP_PAGE_SIZE, visible.length - page.length)} more (
              {visible.length - page.length} left)
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function ClipCard({
  clip,
  isSelected = false,
  selectionOrigin,
  onSelect,
  onHover,
  onTrimPreview,
  onPreview,
  isPlaying = false,
  onPause,
  onShowInTranscript,
}: {
  clip: ProjectClip;
  isSelected?: boolean;
  selectionOrigin: ClipSelectionOrigin | null;
  onSelect: () => void;
  onHover: (clipId: string | null) => void;
  onTrimPreview: (clipId: string, range: { startMs: number; endMs: number }) => void;
  onPreview: (startMs: number, endMs: number, clipId?: string) => void;
  /** This card's own excerpt is the one being previewed: the button pauses it instead of restarting it. */
  isPlaying?: boolean;
  onPause?: () => void;
  onShowInTranscript?: () => void;
}) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  // Synced to the server copy so a refresh triggered elsewhere on the page
  // (a new clip, an export) doesn't leave this card showing pre-refresh trim
  // points — same stale-state hazard as SegmentRow.
  const [startMs, setStartMs] = useSyncedState(clip.startMs);
  const [endMs, setEndMs] = useSyncedState(clip.endMs);
  const [hasExport, setHasExport] = useSyncedState(clip.hasExport);
  const [gainMode, setGainMode] = useSyncedState<GainMode>(clip.gainMode);
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useSyncedState(clip.title);
  const [status, setStatus] = useState<"idle" | "exporting" | "downloading" | "deleting">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTrim, setShowTrim] = useState(false);

  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(commitTimer.current ?? undefined), []);

  /**
   * Trimming is a hold-the-button-down interaction, so the local value moves
   * immediately and the write is deferred until the reporter stops adjusting
   * — otherwise every one of eight buttons is its own round-trip. The clip is
   * auditioned on the same beat, which is the whole point of nudging.
   */
  function nudge(field: "start" | "end", deltaMs: number) {
    const next =
      field === "start"
        ? { startMs: Math.max(0, startMs + deltaMs), endMs }
        : { startMs, endMs: Math.max(startMs + 1, endMs + deltaMs) };

    setStartMs(next.startMs);
    setEndMs(next.endMs);
    setErrorMessage(null);
    // Straight away, not on commit: the mark on the transcript is how you see
    // a word join or leave the clip, and it's no use arriving a round-trip late.
    onTrimPreview(clip.id, next);

    clearTimeout(commitTimer.current ?? undefined);
    commitTimer.current = setTimeout(async () => {
      const result = await updateClipTrim({ clipId: clip.id, ...next });
      if ("error" in result) {
        setErrorMessage(result.error);
        return;
      }
      // The server clamps, so its values are the truth, not the proposal.
      setStartMs(result.startMs);
      setEndMs(result.endMs);
      onTrimPreview(clip.id, { startMs: result.startMs, endMs: result.endMs });
      // Trimming invalidates any previous export — re-exporting is explicit.
      setHasExport(false);
      onPreview(result.startMs, result.endMs, clip.id);
      router.refresh();
    }, TRIM_COMMIT_DELAY_MS);
  }

  async function handleGainMode(mode: GainMode) {
    const previous = gainMode;
    setGainMode(mode);
    setErrorMessage(null);
    const result = await setClipGainMode({ clipId: clip.id, mode });
    if (result.error) {
      setGainMode(previous);
      setErrorMessage(result.error);
      return;
    }
    // An export made at the old level is stale, the same as after a trim.
    setHasExport(false);
    router.refresh();
  }

  async function handleRename() {
    setIsRenaming(false);
    if (title.trim() === clip.title.trim()) return;
    const result = await renameClip({ clipId: clip.id, title });
    if (result.error) {
      setErrorMessage(result.error);
      setTitle(clip.title);
      return;
    }
    router.refresh();
  }

  async function handleExport() {
    setStatus("exporting");
    setErrorMessage(null);
    const result = await exportClip(clip.id);
    setStatus("idle");
    if ("error" in result) {
      setErrorMessage(result.error);
      return;
    }
    setHasExport(true);
    openDownload(result.downloadUrl);
    router.refresh();
  }

  async function handleDownload() {
    setStatus("downloading");
    setErrorMessage(null);
    const result = await getClipDownloadUrl(clip.id);
    setStatus("idle");
    if ("error" in result) {
      setErrorMessage(result.error);
      return;
    }
    openDownload(result.downloadUrl);
  }

  async function handleDelete() {
    setStatus("deleting");
    setErrorMessage(null);
    const result = await deleteClip(clip.id);
    if (result.error) {
      setStatus("idle");
      setConfirmDelete(false);
      setErrorMessage(result.error);
      return;
    }
    router.refresh();
  }

  /**
   * Bring the selected card into view — but only as far as it needs to move.
   *
   * Arriving from a search result or the clip library still centres the card,
   * because the reporter has no idea where in the rail it is. A clip picked by
   * clicking its words scrolls only if it's actually off screen ("nearest"):
   * centring there would haul the page around under a reporter who is reading
   * the transcript, to show them a card that was already in front of them.
   * Picking the card itself moves nothing.
   */
  useEffect(() => {
    if (!isSelected || selectionOrigin === "rail") return;
    cardRef.current?.scrollIntoView({
      block: selectionOrigin === "deep-link" ? "center" : "nearest",
      behavior: "smooth",
    });
  }, [isSelected, selectionOrigin]);

  return (
    <div
      ref={cardRef}
      // Clicking anywhere on the card marks its words in the transcript.
      // Deliberately a div and not a button: the card is full of real
      // controls, and nesting them inside one is both invalid and unusable.
      // Keyboard reach is covered by onFocus below — tabbing into any of
      // those controls marks the passage exactly as pointing at it does.
      onClick={onSelect}
      onMouseEnter={() => onHover(clip.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(clip.id)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onHover(null);
      }}
      className={`rounded border bg-white p-3 ${
        isSelected ? "border-brand-primary ring-2 ring-brand-surface" : "border-line"
      }`}
    >
      {isRenaming ? (
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setTitle(clip.title);
              setIsRenaming(false);
            }
          }}
          autoFocus
          aria-label="Excerpt title"
          className="text-sm font-semibold"
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsRenaming(true)}
          title="Rename this excerpt"
          className="block w-full text-left text-sm font-semibold text-ink-900 hover:text-brand-link max-lg:py-2.5 max-lg:text-base"
        >
          {title}
        </button>
      )}
      <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{clip.excerpt}</p>

      <p className="mt-1 font-mono text-[11px] text-ink-400">
        {formatDuration(startMs)}–{formatDuration(endMs)} · {formatDuration(endMs - startMs)} long
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-500">
        <span>
          {gainMode === "off"
            ? "Level: original"
            : clip.loudnessState === "pending"
              ? "Level: measuring…"
              : clip.loudnessState === "unavailable"
                ? "Level: couldn\u2019t be measured, plays as recorded"
                : `Level ${formatGainDb(clip.gainDb)}${GAIN_LIMIT_NOTE[clip.gainLimit ?? ""] ?? ""}`}
        </span>
        <Button
          type="button"
          variant="link"
          onClick={() => handleGainMode(gainMode === "off" ? "auto" : "off")}
          className="text-brand-link max-lg:min-h-11"
        >
          {gainMode === "off" ? "Even out" : "Original level"}
        </Button>
      </p>
      {showTrim && (
        <div className="mt-2.5 flex flex-col gap-1.5 text-xs text-ink-500">
          <TrimRow label="In" valueMs={startMs} onNudge={(delta) => nudge("start", delta)} />
          <TrimRow label="Out" valueMs={endMs} onNudge={(delta) => nudge("end", delta)} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* The one icon-only control in the rail: a clip is a piece of audio,
            and this is the same play glyph the transport bar uses, so the
            card doesn't have to spend a whole labelled button saying so. */}
        <button
          type="button"
          onClick={() => (isPlaying ? onPause?.() : onPreview(startMs, endMs, clip.id))}
          aria-label={isPlaying ? "Pause this excerpt" : "Preview this excerpt"}
          title={isPlaying ? "Pause this excerpt" : "Preview this excerpt"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand-link text-brand-link transition-colors hover:bg-brand-surface lg:h-7 lg:w-7"
        >
          {isPlaying ? (
            <PauseIcon className="h-2.5 w-2.5" />
          ) : (
            <PlayIcon className="ml-0.5 h-2.5 w-2.5" />
          )}
        </button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleExport}
          disabled={status !== "idle"}
          className="max-lg:min-h-11"
        >
          {status === "exporting" ? "Exporting…" : hasExport ? "Re-export" : "Export WAV"}
        </Button>
        <Button
          type="button"
          variant="link"
          aria-expanded={showTrim}
          onClick={() => setShowTrim((current) => !current)}
          className="text-brand-link max-lg:min-h-11"
        >
          {showTrim ? "Done trimming" : "Trim"}
        </Button>
        {onShowInTranscript && (
          <Button
            type="button"
            variant="link"
            onClick={onShowInTranscript}
            className="text-brand-link max-lg:min-h-11 lg:hidden"
          >
            Show in transcript
          </Button>
        )}
        {hasExport && (
          <Button
            type="button"
            variant="link"
            onClick={handleDownload}
            disabled={status !== "idle"}
            className="text-brand-link max-lg:min-h-11"
          >
            {status === "downloading" ? "Preparing…" : "Download"}
          </Button>
        )}
      </div>

      <div className="mt-2">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-700">Delete this excerpt?</span>
            <Button
              type="button"
              variant="danger-link"
              onClick={handleDelete}
              disabled={status === "deleting"}
              className="max-lg:min-h-11"
            >
              {status === "deleting" ? "Deleting…" : "Delete"}
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={() => setConfirmDelete(false)}
              className="max-lg:min-h-11"
            >
              Keep
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="link"
            onClick={() => setConfirmDelete(true)}
            className="font-normal text-ink-400 hover:text-danger max-lg:min-h-11"
          >
            Delete
          </Button>
        )}
      </div>

      {errorMessage && <p className="mt-1.5 text-xs text-danger">{errorMessage}</p>}
    </div>
  );
}

/** Signed URLs carry their own download filename, so a plain navigation is enough. */
function openDownload(url: string) {
  window.location.href = url;
}

function TrimRow({
  label,
  valueMs,
  onNudge,
}: {
  label: string;
  valueMs: number;
  onNudge: (deltaMs: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-7 font-semibold text-ink-700">{label}</span>
      <span className="w-14 font-mono">{formatDuration(valueMs)}</span>
      <div className="flex gap-1">
        {NUDGE_STEPS_MS.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => onNudge(step)}
            aria-label={`Move ${label.toLowerCase()} point ${step > 0 ? "later" : "earlier"} by ${Math.abs(step)} milliseconds`}
            className="rounded border border-line px-1.5 py-0.5 text-[11px] font-semibold text-ink-700 hover:bg-panel-50 max-lg:min-h-11 max-lg:min-w-12 max-lg:text-xs"
          >
            {step > 0 ? `+${step}` : step}
          </button>
        ))}
      </div>
    </div>
  );
}
