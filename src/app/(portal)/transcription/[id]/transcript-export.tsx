"use client";

import { useState } from "react";
import { buildTranscriptText } from "@/lib/transcription/transcript";
import { buildTranscriptExportFilename } from "@/lib/transcription/media";
import type { TranscriptSegment, TranscriptSpeaker } from "@/lib/transcription/projects";
import { downloadBlob } from "./download-blob";

/**
 * Copy the transcript, or save it as a .txt.
 *
 * Both are built in the browser from the segments already on screen, so the
 * text carries this session's corrections and speaker names without a
 * round-trip — and without a second server-side formatter that could drift
 * from what the workspace shows.
 */
export function TranscriptExport({
  projectTitle,
  interviewDate,
  exportDate,
  segments,
  speakers,
}: {
  projectTitle: string;
  /** Shown in the text's header — deliberately absent rather than guessed when the project has no interview date. */
  interviewDate: string | null;
  /** Interview date, falling back to the project's creation date — the date every export filename carries. */
  exportDate: string;
  segments: TranscriptSegment[];
  speakers: TranscriptSpeaker[];
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  function transcriptText() {
    return buildTranscriptText({ title: projectTitle, interviewDate }, segments, speakers);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(transcriptText());
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      // Clipboard access is refusable (and absent over plain http) — say so
      // rather than silently doing nothing.
      setStatus("failed");
    }
  }

  function handleDownload() {
    downloadBlob(
      new Blob([transcriptText()], { type: "text/plain;charset=utf-8" }),
      buildTranscriptExportFilename(exportDate, projectTitle),
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleCopy}
        className="text-xs font-semibold text-brand-link hover:underline"
      >
        {status === "copied" ? "Copied" : "Copy transcript"}
      </button>
      <button
        type="button"
        onClick={handleDownload}
        className="text-xs font-semibold text-brand-link hover:underline"
      >
        Download .txt
      </button>
      {status === "failed" && (
        <span className="text-xs text-danger">Couldn&apos;t copy — download it instead.</span>
      )}
    </div>
  );
}
