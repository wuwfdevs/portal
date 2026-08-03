"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionMenu } from "@/components/ui/action-menu";
import { reindexProjectSearch } from "../actions";
import { removeSourceFromProject, deleteSourceEntirely } from "./source-actions";

type RemoveStep = "closed" | "choice" | "confirmDelete";

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
 * - Remove: picking it doesn't act immediately, it asks *how* — detach this
 *   source from just this project (safe: the source and every other
 *   project referencing it are untouched), or delete it entirely (affects
 *   every project referencing it, so that path gets its own extra confirm
 *   on top of the choice itself). Offered regardless of how many sources
 *   this project has; detaching the last one just leaves the project
 *   empty, same state a brand-new project starts in.
 */
export function SourceActionsMenu({
  projectId,
  sourceId,
  sourceTitle,
  otherProjectCount,
}: {
  projectId: string;
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
    router.push(`/sourcework/${projectId}`);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <ActionMenu
        items={[
          { label: "Rebuild search index", onClick: handleReindex },
          { label: "Remove…", onClick: () => setStep("choice"), variant: "danger" },
        ]}
      />

      {step === "choice" && (
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
              onClick={() => setStep("choice")}
              className="rounded px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-panel-50"
            >
              Back
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
