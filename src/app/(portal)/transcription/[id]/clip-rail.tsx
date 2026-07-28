"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSyncedState } from "@/lib/use-synced-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildClipsZipFilename, formatDuration } from "@/lib/transcription/media";
import {
  deleteClip,
  exportClip,
  getClipDownloadUrl,
  renameClip,
  updateClipTrim,
} from "./clip-actions";
import { downloadBlob } from "./download-blob";
import { PlayIcon } from "./transport-icons";
import type { ProjectClip } from "@/lib/transcription/clips";

// Nudge steps, in the order radio editors reach for them: coarse out, fine
// out, fine in, coarse in (see docs/transcription-workspace-design.md §3D).
const NUDGE_STEPS_MS = [-250, -50, 50, 250];

/** How long the trim can sit still before it's written — see nudge(). */
const TRIM_COMMIT_DELAY_MS = 400;

export function ClipRail({
  projectId,
  projectTitle,
  exportDate,
  clips,
  highlightClipId,
  onPreview,
}: {
  projectId: string;
  projectTitle: string;
  /** Interview date, falling back to the project's creation date — the date every export filename carries. */
  exportDate: string;
  clips: ProjectClip[];
  /** Clip arrived at from a search result or the clip library (?clip=) — scrolled to and marked. */
  highlightClipId?: string | null;
  onPreview: (startMs: number, endMs: number) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "preparing">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pendingCount = clips.filter((clip) => !clip.hasExport).length;

  /**
   * The whole rail as one download. Fetched rather than navigated to,
   * because a failure has to land back in this panel — a plain navigation to
   * a route that turns out to error would replace the workspace with an
   * error page and lose the reporter's place.
   */
  async function handleExportAll() {
    setStatus("preparing");
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/transcription/projects/${projectId}/clips.zip`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setErrorMessage(body?.error ?? "Could not export these clips. Please try again.");
        return;
      }
      // A signed-out request is redirected to /login, which fetch follows and
      // reports as a perfectly successful HTML page — without this check, that
      // lands on disk as a "zip" that won't open.
      if (!response.headers.get("Content-Type")?.includes("application/zip")) {
        setErrorMessage("Your session may have expired. Reload the page and try again.");
        return;
      }
      // Rejects if the archive fails part-way through rendering, which is
      // the one failure the server can't report as JSON.
      downloadBlob(await response.blob(), buildClipsZipFilename(exportDate, projectTitle));
      // Clips rendered along the way now have a download of their own.
      router.refresh();
    } catch {
      setErrorMessage("The export stopped part-way through. Please try again.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-500">
          Clips{clips.length > 0 && ` (${clips.length})`}
        </h2>
        {clips.length > 0 && (
          <button
            type="button"
            onClick={handleExportAll}
            disabled={status === "preparing"}
            title="Download every clip in this project as a zip"
            className="text-xs font-semibold text-brand-link hover:underline disabled:text-ink-400 disabled:no-underline"
          >
            {status === "preparing" ? "Preparing zip…" : "Export all (zip)"}
          </button>
        )}
      </div>

      {status === "preparing" && pendingCount > 0 && (
        <p className="text-xs text-ink-400">
          Rendering {pendingCount} clip{pendingCount === 1 ? "" : "s"} that{" "}
          {pendingCount === 1 ? "hasn't" : "haven't"} been exported yet — this can take a minute.
        </p>
      )}
      {errorMessage && <p className="text-xs text-danger">{errorMessage}</p>}

      {clips.length === 0 ? (
        <p className="rounded border border-dashed border-line p-3 text-xs leading-relaxed text-ink-400">
          Select some transcript text to make your first clip.
        </p>
      ) : (
        clips.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            isHighlighted={clip.id === highlightClipId}
            onPreview={onPreview}
          />
        ))
      )}
    </div>
  );
}

function ClipCard({
  clip,
  isHighlighted = false,
  onPreview,
}: {
  clip: ProjectClip;
  isHighlighted?: boolean;
  onPreview: (startMs: number, endMs: number) => void;
}) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  // Synced to the server copy so a refresh triggered elsewhere on the page
  // (a new clip, an export) doesn't leave this card showing pre-refresh trim
  // points — same stale-state hazard as SegmentRow.
  const [startMs, setStartMs] = useSyncedState(clip.startMs);
  const [endMs, setEndMs] = useSyncedState(clip.endMs);
  const [hasExport, setHasExport] = useSyncedState(clip.hasExport);
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useSyncedState(clip.title);
  const [status, setStatus] = useState<"idle" | "exporting" | "downloading" | "deleting">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      // Trimming invalidates any previous export — re-exporting is explicit.
      setHasExport(false);
      onPreview(result.startMs, result.endMs);
      router.refresh();
    }, TRIM_COMMIT_DELAY_MS);
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

  // Arriving from a search result or the clip library: bring the clip the
  // reporter actually clicked into view, rather than leaving them to find it
  // in a rail that may hold a dozen.
  useEffect(() => {
    if (isHighlighted) {
      cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [isHighlighted]);

  return (
    <div
      ref={cardRef}
      className={`rounded border bg-white p-3 ${
        isHighlighted ? "border-brand-primary ring-2 ring-brand-surface" : "border-line"
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
          aria-label="Clip title"
          className="text-sm font-semibold"
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsRenaming(true)}
          title="Rename this clip"
          className="block w-full text-left text-sm font-semibold text-ink-900 hover:text-brand-link"
        >
          {title}
        </button>
      )}
      <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{clip.excerpt}</p>

      <div className="mt-2.5 flex flex-col gap-1.5 text-xs text-ink-500">
        <TrimRow label="In" valueMs={startMs} onNudge={(delta) => nudge("start", delta)} />
        <TrimRow label="Out" valueMs={endMs} onNudge={(delta) => nudge("end", delta)} />
        <p className="pl-9 font-mono text-[11px] text-ink-400">
          {formatDuration(endMs - startMs)} long
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* The one icon-only control in the rail: a clip is a piece of audio,
            and this is the same play glyph the transport bar uses, so the
            card doesn't have to spend a whole labelled button saying so. */}
        <button
          type="button"
          onClick={() => onPreview(startMs, endMs)}
          aria-label="Preview this clip"
          title="Preview this clip"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-link text-brand-link transition-colors hover:bg-brand-surface"
        >
          <PlayIcon className="ml-0.5 h-2.5 w-2.5" />
        </button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleExport}
          disabled={status !== "idle"}
          className="px-2.5 py-1.5 text-xs"
        >
          {status === "exporting" ? "Exporting…" : hasExport ? "Re-export" : "Export WAV"}
        </Button>
        {hasExport && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={status !== "idle"}
            className="text-xs font-semibold text-brand-link hover:underline disabled:text-ink-400"
          >
            {status === "downloading" ? "Preparing…" : "Download"}
          </button>
        )}
      </div>

      <div className="mt-2">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-700">Delete this clip?</span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={status === "deleting"}
              className="font-semibold text-danger hover:underline disabled:text-ink-400"
            >
              {status === "deleting" ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-ink-500 hover:underline"
            >
              Keep
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-ink-400 hover:text-danger hover:underline"
          >
            Delete
          </button>
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
    <div className="flex items-center gap-1.5">
      <span className="w-7 font-semibold text-ink-700">{label}</span>
      <span className="w-14 font-mono">{formatDuration(valueMs)}</span>
      <div className="flex gap-1">
        {NUDGE_STEPS_MS.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => onNudge(step)}
            aria-label={`Move ${label.toLowerCase()} point ${step > 0 ? "later" : "earlier"} by ${Math.abs(step)} milliseconds`}
            className="rounded border border-line px-1.5 py-0.5 text-[11px] font-semibold text-ink-700 hover:bg-panel-50"
          >
            {step > 0 ? `+${step}` : step}
          </button>
        ))}
      </div>
    </div>
  );
}
