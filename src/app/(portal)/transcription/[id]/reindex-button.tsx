"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reindexProjectSearch } from "../actions";

/**
 * Builds (or rebuilds) this project's search index from its current
 * transcript.
 *
 * Two presentations of one action, because the two situations are not the
 * same thing:
 *
 * - `variant="banner"` — this transcript is not in the index at all, so
 *   nothing in it can be found by searching. That is a broken-looking tool
 *   from the reporter's side, and it has to be said at the top of the page,
 *   not offered as a link below the fold. (This first shipped as a quiet
 *   link at the bottom of the workspace, under the transcript pane and next
 *   to Delete, where it was invisible in practice.)
 * - `variant="link"` — the project is indexed; this is maintenance, for
 *   forcing a rebuild after a round of corrections rather than waiting for
 *   the automatic re-embed. Quiet is correct here.
 *
 * Both report what actually happened, including the case that matters most:
 * passages indexed but embeddings skipped, which means keyword search works
 * and topic search doesn't. Silence there would look exactly like success.
 */
export function ReindexButton({
  projectId,
  variant = "link",
  chunkCount,
}: {
  projectId: string;
  variant?: "link" | "banner";
  /** Passages currently indexed — shown so the state is legible without clicking. */
  chunkCount?: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "working">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus("working");
    setMessage(null);

    const result = await reindexProjectSearch(projectId);
    setStatus("idle");

    if (result.error) {
      setMessage(result.error);
      return;
    }

    const chunks = result.chunks ?? 0;
    const passages = `${chunks} passage${chunks === 1 ? "" : "s"}`;
    if (result.embeddingError) {
      setMessage(
        `Indexed ${passages} for keyword search, but topic search couldn't be built. It will retry on the next edit.`,
      );
    } else if (result.embedded) {
      setMessage(`Indexed ${passages}, ready to search.`);
    } else {
      setMessage(`Indexed ${passages} for keyword search. Topic search needs an embeddings key.`);
    }
    router.refresh();
  }

  if (variant === "banner") {
    return (
      <div className="mb-5 max-w-5xl rounded border border-brand-primary bg-brand-surface p-4">
        <p className="mb-1 text-sm font-semibold text-ink-900">
          This interview isn&apos;t searchable yet
        </p>
        <p className="mb-3 max-w-2xl text-sm text-ink-700">
          Its transcript hasn&apos;t been added to the search index, so nothing said in this
          recording will come up when someone searches — the clips and the project title still
          will. Interviews transcribed before search existed need this once.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleClick} disabled={status === "working"}>
            {status === "working" ? "Adding to search index…" : "Add to search index"}
          </Button>
          {message && <span className="text-xs text-ink-700">{message}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "working"}
        title="Rebuild this project's search index from the current transcript"
        className="text-xs font-semibold text-brand-link hover:underline disabled:text-ink-400 disabled:no-underline"
      >
        {status === "working" ? "Rebuilding search index…" : "Rebuild search index"}
      </button>
      {message ? (
        <span className="text-xs text-ink-400">{message}</span>
      ) : (
        chunkCount !== undefined && (
          <span className="text-xs text-ink-400">
            {chunkCount} passage{chunkCount === 1 ? "" : "s"} indexed
          </span>
        )
      )}
    </div>
  );
}
