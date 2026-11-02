"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { buildClipsZipFilename } from "@/lib/transcription/media";
import { downloadBlob } from "./download-blob";

/**
 * Every excerpt in the project as one zip. It lives in the project's header
 * because that is what it exports: the excerpt rail beside a transcript lists
 * one source's excerpts, and a button there that exported the whole project
 * was a surprise.
 *
 * Fetched rather than navigated to, because a failure has to land back here:
 * a plain navigation to a route that turns out to error would replace the
 * workspace with an error page and lose the reporter's place.
 */
export function ExportExcerptsButton({
  projectId,
  projectTitle,
  exportDate,
}: {
  projectId: string;
  projectTitle: string;
  /** Interview date, falling back to the project's creation date — the date every export filename carries. */
  exportDate: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "preparing">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setStatus("preparing");
    setError(null);
    try {
      const response = await fetch(`/api/transcription/projects/${projectId}/clips.zip`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not export these excerpts. Please try again.");
        return;
      }
      if (!response.headers.get("Content-Type")?.includes("application/zip")) {
        setError("Your session may have expired. Reload the page and try again.");
        return;
      }
      downloadBlob(await response.blob(), buildClipsZipFilename(exportDate, projectTitle));
      router.refresh();
    } catch {
      setError("The export stopped part-way through. Please try again.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleExport}
        disabled={status === "preparing"}
        title="Download every excerpt in this project as a zip"
      >
        {status === "preparing" ? "Preparing zip… this can take a minute" : "Export excerpts (zip)"}
      </Button>
      {error && <p className="max-w-xs text-right text-xs text-danger">{error}</p>}
    </div>
  );
}
