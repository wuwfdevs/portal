"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { reindexProjectSearch } from "../actions";
import { removeSourceFromProject } from "./source-actions";

/**
 * A source's own actions within this project — the source-detail-view
 * counterpart to ProjectActionsMenu. Two jobs:
 *
 * - Rebuild search index: the Phase 5 backfill for sources transcribed
 *   before search existed, or a manual re-run after a round of corrections
 *   (see the old reindex-button.tsx, folded in here). Reports what actually
 *   happened, including the case that matters most — chunks built but
 *   embeddings skipped — since silence there would look identical to
 *   success.
 * - Remove from project: the correctly-scoped "delete" for a source's own
 *   detail view, as opposed to deleting the whole project. Detaches only —
 *   the source itself, and any other project referencing it, are
 *   untouched. Only offered when this project has more than one source;
 *   removing the only one would leave the project empty, which is what
 *   deleting the project (in the header) is for.
 */
export function SourceActionsMenu({
  projectId,
  sourceId,
  sourceTitle,
  canRemove,
}: {
  projectId: string;
  sourceId: string;
  sourceTitle: string;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleReindex() {
    setMessage("Rebuilding search index…");
    const result = await reindexProjectSearch(projectId, sourceId);

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

  async function handleRemove() {
    setRemoving(true);
    const result = await removeSourceFromProject(projectId, sourceId);
    setRemoving(false);

    if (result.error) {
      setConfirmingRemove(false);
      setMessage(result.error);
      return;
    }
    router.push(`/sourcework/${projectId}`);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <ActionMenu
        items={[
          { label: "Rebuild search index", onClick: handleReindex },
          ...(canRemove
            ? [{ label: "Remove from project", onClick: () => setConfirmingRemove(true), variant: "danger" as const }]
            : []),
        ]}
      />
      {confirmingRemove && (
        <div className="w-full max-w-xs rounded border border-danger/30 bg-danger/[0.04] p-3">
          <p className="mb-2.5 text-left text-xs leading-relaxed text-ink-700">
            Removes &ldquo;{sourceTitle}&rdquo; from this project. The source itself, and any other
            project referencing it, are unaffected.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmingRemove(false)}>
              Keep it
            </Button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="rounded bg-danger px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:bg-panel-100 disabled:text-ink-400"
            >
              {removing ? "Removing…" : "Remove from project"}
            </button>
          </div>
        </div>
      )}
      {message && <span className="max-w-xs text-right text-xs text-ink-400">{message}</span>}
    </div>
  );
}
