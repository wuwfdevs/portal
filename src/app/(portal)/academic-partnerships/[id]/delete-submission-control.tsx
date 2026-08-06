"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteSubmission } from "../actions";

/**
 * Coordinator-only, permanent delete for one inquiry — a "danger zone"
 * control on the submission detail screen, not the kanban card: this is a
 * rarer, harder-to-reverse action than the ordinary stage/disposition moves
 * every member already has from the board, so it stays off a surface built
 * for quick drags. Two-step confirm before anything happens, mirroring
 * sourcework's SourceActionsMenu delete-confirmation step.
 */
export function DeleteSubmissionControl({
  submissionId,
  facultyName,
}: {
  submissionId: string;
  facultyName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    const result = await deleteSubmission(submissionId);
    setBusy(false);

    if (result.error) {
      setConfirming(false);
      setError(result.error);
      return;
    }
    router.push("/academic-partnerships");
  }

  return (
    <section className="rounded border border-danger/30 bg-danger/[0.04] p-4">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-danger">Danger zone</h2>
      {!confirming ? (
        <Button type="button" variant="secondary" className="text-danger" onClick={() => setConfirming(true)}>
          Delete this inquiry
        </Button>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="text-xs leading-relaxed text-ink-700">
            This permanently deletes &ldquo;{facultyName}&rdquo;&apos;s inquiry, its notes, and its
            activity history. This can&apos;t be undone.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="rounded bg-danger px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:bg-panel-100 disabled:text-ink-400"
            >
              {busy ? "Deleting…" : "Yes, delete permanently"}
            </button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}
