"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reindexProjectSearch } from "../actions";

/**
 * Rebuilds this project's search index from its current transcript.
 *
 * Two jobs, one button: the backfill for projects transcribed before search
 * existed (they have no chunks at all until this runs), and a manual re-run
 * after a round of corrections, for a reporter who would rather not wait for
 * the automatic re-embed to catch up.
 *
 * Reports what actually happened, including the case that matters most —
 * chunks built but embeddings skipped, which means the project is
 * keyword-searchable but not yet searchable by topic. Silence there would
 * look identical to success.
 */
export function ReindexButton({ projectId }: { projectId: string }) {
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
    if (result.embeddingError) {
      setMessage(
        `Indexed ${chunks} passage${chunks === 1 ? "" : "s"} for keyword search, but topic search couldn't be built. It will retry on the next edit.`,
      );
    } else if (result.embedded) {
      setMessage(`Indexed ${chunks} passage${chunks === 1 ? "" : "s"}, ready to search.`);
    } else {
      setMessage(
        `Indexed ${chunks} passage${chunks === 1 ? "" : "s"} for keyword search. Topic search needs an embeddings key.`,
      );
    }
    router.refresh();
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
      {message && <span className="text-xs text-ink-400">{message}</span>}
    </div>
  );
}
