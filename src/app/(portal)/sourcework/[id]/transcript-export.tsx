"use client";

import { useState } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
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
 *
 * Two links on a wide screen; one ⋮ below lg, where they would only take a row
 * of the screen from the transcript.
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
    <>
      <div className="flex items-center gap-3 max-lg:hidden">
        <Button type="button" variant="link" onClick={handleCopy} className="text-brand-link">
          {status === "copied" ? "Copied" : "Copy transcript"}
        </Button>
        <Button type="button" variant="link" onClick={handleDownload} className="text-brand-link">
          Download .txt
        </Button>
        {status === "failed" && (
          <span className="text-xs text-danger">Couldn&apos;t copy — download it instead.</span>
        )}
      </div>
      <div className="flex items-center gap-2 lg:hidden">
        <span className="text-sm text-ink-500" aria-live="polite">
          {status === "copied" && "Copied"}
          {status === "failed" && "Couldn’t copy — download it instead."}
        </span>
        <ActionMenu
          label="Transcript actions"
          items={[
            { label: "Copy transcript", onClick: handleCopy },
            { label: "Download as .txt", onClick: handleDownload },
          ]}
        />
      </div>
    </>
  );
}
