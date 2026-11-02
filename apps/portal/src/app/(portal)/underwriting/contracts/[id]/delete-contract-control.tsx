"use client";

import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/ui/confirm-action";
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

  async function handleDelete() {
    const result = await deleteContract(contractId);
    if (result.error) return { error: result.error };
    router.push("/underwriting/contracts");
  }

  return (
    <ConfirmAction
      title="Danger zone"
      label="Delete this draft"
      confirmLabel="Yes, delete the draft"
      message={
        <>
          This permanently deletes the draft &ldquo;{label}&rdquo; — its schedule lines, flights,
          copy links and attached agreement. Copy in the library stays. This can&apos;t be undone.
        </>
      }
      onConfirm={handleDelete}
    />
  );
}
