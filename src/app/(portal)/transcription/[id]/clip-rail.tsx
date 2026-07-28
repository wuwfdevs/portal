"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSyncedState } from "@/lib/use-synced-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/transcription/media";
import {
  deleteClip,
  exportClip,
  getClipDownloadUrl,
  renameClip,
  updateClipTrim,
} from "./clip-actions";
import type { ProjectClip } from "@/lib/transcription/clips";

// Nudge steps, in the order radio editors reach for them: coarse out, fine
// out, fine in, coarse in (see docs/transcription-workspace-design.md §3D).
const NUDGE_STEPS_MS = [-250, -50, 50, 250];

/** How long the trim can sit still before it's written — see nudge(). */
const TRIM_COMMIT_DELAY_MS = 400;

export function ClipRail({
  clips,
  onPreview,
}: {
  clips: ProjectClip[];
  onPreview: (startMs: number, endMs: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-500">
        Clips{clips.length > 0 && ` (${clips.length})`}
      </h2>
      {clips.length === 0 ? (
        <p className="rounded border border-dashed border-line p-3 text-xs leading-relaxed text-ink-400">
          Select some transcript text to make your first clip.
        </p>
      ) : (
        clips.map((clip) => <ClipCard key={clip.id} clip={clip} onPreview={onPreview} />)
      )}
    </div>
  );
}

function ClipCard({
  clip,
  onPreview,
}: {
  clip: ProjectClip;
  onPreview: (startMs: number, endMs: number) => void;
}) {
  const router = useRouter();
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

  return (
    <div className="rounded border border-line bg-white p-3">
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
        <Button
          type="button"
          variant="secondary"
          onClick={() => onPreview(startMs, endMs)}
          className="px-2.5 py-1.5 text-xs"
        >
          Preview
        </Button>
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
