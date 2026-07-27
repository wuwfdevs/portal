"use client";

import { useState } from "react";
import { useSyncedState } from "@/lib/use-synced-state";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/transcription/media";
import { exportClip, updateClipTrim } from "./clip-actions";
import type { ProjectClip } from "@/lib/transcription/clips";

const NUDGE_STEPS_MS = [-250, -50, 50, 250];

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
        <p className="rounded border border-dashed border-line p-3 text-xs text-ink-400">
          Select lines in the transcript to create your first clip.
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
  // Synced to the server copy so a refresh triggered elsewhere on the page
  // (a new clip, an export) doesn't leave this card showing pre-refresh trim
  // points — same stale-state hazard as SegmentRow.
  const [startMs, setStartMs] = useSyncedState(clip.startMs);
  const [endMs, setEndMs] = useSyncedState(clip.endMs);
  const [downloadUrl, setDownloadUrl] = useSyncedState(clip.downloadUrl);
  const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function nudge(field: "start" | "end", deltaMs: number) {
    const next =
      field === "start"
        ? { startMs: startMs + deltaMs, endMs }
        : { startMs, endMs: endMs + deltaMs };

    const result = await updateClipTrim({ clipId: clip.id, ...next });
    if ("error" in result) {
      setErrorMessage(result.error);
      return;
    }
    setErrorMessage(null);
    setStartMs(result.startMs);
    setEndMs(result.endMs);
    // Trimming invalidates any previous export — re-exporting is explicit.
    setDownloadUrl(null);
  }

  async function handleExport() {
    setExportStatus("exporting");
    setErrorMessage(null);
    const result = await exportClip(clip.id);
    if ("error" in result) {
      setExportStatus("error");
      setErrorMessage(result.error);
      return;
    }
    setDownloadUrl(result.downloadUrl);
    setExportStatus("idle");
  }

  return (
    <div className="rounded border border-line bg-white p-3">
      <p className="text-sm font-semibold text-ink-900">{clip.title}</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{clip.excerpt}</p>

      <div className="mt-2.5 flex flex-col gap-1.5 text-xs text-ink-500">
        <TrimRow label="Start" valueMs={startMs} onNudge={(delta) => nudge("start", delta)} />
        <TrimRow label="End" valueMs={endMs} onNudge={(delta) => nudge("end", delta)} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => onPreview(startMs, endMs)}
          className="text-xs"
        >
          Preview
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleExport}
          disabled={exportStatus === "exporting"}
          className="text-xs"
        >
          {exportStatus === "exporting" ? "Exporting…" : downloadUrl ? "Re-export" : "Export WAV"}
        </Button>
        {downloadUrl && (
          <a href={downloadUrl} className="text-xs font-semibold text-brand-link hover:underline">
            Download
          </a>
        )}
      </div>
      {errorMessage && <p className="mt-1.5 text-xs text-danger">{errorMessage}</p>}
    </div>
  );
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
      <span className="w-9 font-semibold text-ink-700">{label}</span>
      <span className="w-14 font-mono">{formatDuration(valueMs)}</span>
      <div className="flex gap-1">
        {NUDGE_STEPS_MS.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => onNudge(step)}
            className="rounded border border-line px-1.5 py-0.5 text-[11px] font-semibold text-ink-700 hover:bg-panel-50"
          >
            {step > 0 ? `+${step}` : step}
          </button>
        ))}
      </div>
    </div>
  );
}
