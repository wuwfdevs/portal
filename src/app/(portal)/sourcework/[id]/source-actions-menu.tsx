"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionMenu } from "@/components/ui/action-menu";
import { reindexProjectSearch } from "../actions";
import { removeSourceFromProject, deleteSourceEntirely } from "./source-actions";

type RemoveStep = "closed" | "choice" | "confirmDelete";

/**
 * A source's own actions — shared by the project workspace's source pill
 * (always has a projectId) and the standalone Source Detail screen (which
 * only has one when the source is attached to at least one project; an
 * orphaned source detached from everything has none). The two views render
 * the same working surface for a source (docs/sourcework-design.md §7.2), so
 * a single menu with `projectId` nullable stays in sync automatically
 * instead of drifting the way two near-identical copies would. Two jobs:
 *
 * - Rebuild search index: the Phase 5 backfill for sources transcribed
 *   before search existed, or a manual re-run after a round of corrections
 *   (see the old reindex-button.tsx, folded in here). Reports what actually
 *   happened, including the case that matters most — chunks built but
 *   embeddings skipped — since silence there would look identical to
 *   success. Works with or without a projectId (reindexProjectSearch only
 *   uses it to revalidate the project's own path).
 * - Remove: with a projectId, picking it doesn't act immediately, it asks
 *   *how* — detach this source from just this project (safe: the source and
 *   every other project referencing it are untouched), or delete it
 *   entirely (affects every project referencing it, so that path gets its
 *   own extra confirm on top of the choice itself). Without a projectId
 *   there's nothing to detach *from*, so it goes straight to the delete
 *   confirmation.
 */
export function SourceActionsMenu({
  projectId,
  sourceId,
  sourceTitle,
  otherProjectCount,
}: {
  /** Null on the Source Detail screen when the source isn't attached to any project — see above. */
  projectId: string | null;
  sourceId: string;
  sourceTitle: string;
  /** How many *other* projects also reference this source — shapes the choice's warning text. */
  otherProjectCount: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [step, setStep] = useState<RemoveStep>("closed");
  const [busy, setBusy] = useState(false);

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

  async function handleDetach() {
    if (!projectId) return; // only reachable from the choice step, which only renders with a projectId
    setBusy(true);
    const result = await removeSourceFromProject(projectId, sourceId);
    setBusy(false);

    if (result.error) {
      setStep("closed");
      setMessage(result.error);
      return;
    }
    router.push(`/sourcework/${projectId}`);
  }

  async function handleDeleteEntirely() {
    setBusy(true);
    const result = await deleteSourceEntirely(sourceId);
    setBusy(false);

    if (result.error) {
      setStep("closed");
      setMessage(result.error);
      return;
    }
    router.push(projectId ? `/sourcework/${projectId}` : "/sourcework?tab=sources");
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <ActionMenu
        items={[
          { label: "Rebuild search index", onClick: handleReindex },
          {
            label: projectId ? "Remove…" : "Delete…",
            onClick: () => setStep(projectId ? "choice" : "confirmDelete"),
            variant: "danger",
          },
        ]}
      />

      {step === "choice" && projectId && (
        <div className="w-full max-w-xs rounded border border-line bg-white p-3 shadow-sm">
          <p className="mb-2.5 text-left text-xs leading-relaxed text-ink-700">
            Remove &ldquo;{sourceTitle}&rdquo; how?
          </p>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={handleDetach}
              disabled={busy}
              className="rounded border border-line px-3 py-2 text-left hover:bg-panel-50 disabled:cursor-not-allowed"
            >
              <span className="block text-sm font-semibold text-ink-900">
                {busy ? "Removing…" : "Detach from this project"}
              </span>
              <span className="block text-xs text-ink-500">
                Keeps the source and its data. Stays in the library
                {otherProjectCount > 0
                  ? ` and in ${otherProjectCount} other project${otherProjectCount === 1 ? "" : "s"}`
                  : ""}
                .
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStep("confirmDelete")}
              className="rounded border border-danger/30 bg-danger/[0.04] px-3 py-2 text-left hover:bg-danger/10"
            >
              <span className="block text-sm font-semibold text-danger">Delete this source entirely</span>
              <span className="block text-xs text-ink-700">
                Permanently deletes the recording, its transcript, and every excerpt made from it
                {otherProjectCount > 0
                  ? ` — including removing it from ${otherProjectCount} other project${otherProjectCount === 1 ? "" : "s"}`
                  : ""}
                .
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setStep("closed")}
            className="mt-2 text-xs font-semibold text-ink-500 hover:text-ink-700"
          >
            Cancel
          </button>
        </div>
      )}

      {step === "confirmDelete" && (
        <div className="w-full max-w-xs rounded border border-danger/30 bg-danger/[0.04] p-3">
          <p className="mb-2.5 text-left text-xs leading-relaxed text-ink-700">
            This can&apos;t be undone{otherProjectCount > 0 ? ` and affects ${otherProjectCount} other project${otherProjectCount === 1 ? "" : "s"} too` : ""}.
            Delete &ldquo;{sourceTitle}&rdquo; entirely?
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep(projectId ? "choice" : "closed")}
              className="rounded px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-panel-50"
            >
              {projectId ? "Back" : "Cancel"}
            </button>
            <button
              type="button"
              onClick={handleDeleteEntirely}
              disabled={busy}
              className="rounded bg-danger px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:bg-panel-100 disabled:text-ink-400"
            >
              {busy ? "Deleting…" : "Yes, delete permanently"}
            </button>
          </div>
        </div>
      )}

      {message && <span className="max-w-xs text-right text-xs text-ink-400">{message}</span>}
    </div>
  );
}
