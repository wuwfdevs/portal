"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteContract } from "../../contract-actions";

/**
 * Permanent delete for a draft contract — a "danger zone" control at the
 * foot of the contract page's aside, two-step confirm before anything
 * happens, mirroring Academic Partnerships' DeleteSubmissionControl. Only
 * a draft gets here (docs/underwriting-traffic-redesign.md §11.5): it has
 * no placements or history, so what goes is its own setup — revisions,
 * lines, flights, copy links, the attached document. A contract that ran
 * is terminated, not deleted.
 */
export function DeleteContractControl({
  contractId,
  label,
}: {
  contractId: string;
  label: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    const result = await deleteContract(contractId);
    setBusy(false);
    if (result.error) {
      setConfirming(false);
      setError(result.error);
      return;
    }
    router.push("/underwriting/contracts");
  }

  return (
    <section className="rounded border border-danger/30 bg-danger/[0.04] px-5 py-4">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-danger">
        Danger zone
      </h2>
      {!confirming ? (
        <Button
          type="button"
          variant="secondary"
          className="text-danger"
          onClick={() => setConfirming(true)}
        >
          Delete this draft
        </Button>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="text-xs leading-relaxed text-ink-700">
            This permanently deletes the draft &ldquo;{label}&rdquo; — its schedule lines, flights,
            copy links and attached agreement. Copy in the library stays. This can&apos;t be undone.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="rounded bg-danger px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:bg-panel-100 disabled:text-ink-400"
            >
              {busy ? "Deleting…" : "Yes, delete the draft"}
            </button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}
