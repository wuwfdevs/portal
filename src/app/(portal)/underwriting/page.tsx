import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  listActiveObligationsWithContracts,
  listContracts,
  listCopy,
  listCopyLinkedToContracts,
  listExceptions,
  listObligationPlacementContexts,
} from "@/lib/underwriting/queries";
import { computeObligationConflicts, type ObligationConflictReason } from "@/lib/underwriting/conflicts";

const CONFLICT_LABEL: Record<ObligationConflictReason, string> = {
  no_approved_copy: "No approved copy linked",
  insufficient_inventory: "No eligible open slots left this period",
};

/**
 * "The two queues that actually need daily attention: obligations that
 * can't currently be placed, and broadcast events awaiting exception
 * resolution" (docs/underwriting-design.md §4) — both now real. The
 * conflict check itself (lib/underwriting/conflicts.ts) is scoped to what
 * this schema can actually verify: an approved linked copy, and either
 * enough already-placed or enough open eligible slots left to meet
 * quantity_required. Spacing/daypart/true inventory accounting stay out —
 * see that module's own header.
 */
export default async function UnderwritingDashboardPage() {
  const [contracts, copy, obligations, openExceptions] = await Promise.all([
    listContracts(),
    listCopy(),
    listActiveObligationsWithContracts(),
    listExceptions(),
  ]);
  const unresolvedExceptions = openExceptions.filter((exception) => exception.resolution_status === "open");

  const copyByContract = await listCopyLinkedToContracts([
    ...new Set(obligations.map((obligation) => obligation.contract_id)),
  ]);

  const obligationPlacements = await listObligationPlacementContexts(obligations);
  const conflictChecks = obligationPlacements.map(({ obligation, placements, placeable }) => {
    const linkedCopy = copyByContract.get(obligation.contract_id) ?? [];
    const reasons = computeObligationConflicts({
      hasApprovedLinkedCopy: linkedCopy.some((item) => item.approval_status === "approved"),
      eligibleOpenSlotCount: placeable.ok ? placeable.items.length : 0,
      activePlacementCount: placements.length,
      quantityRequired: obligation.quantity_required,
    });
    return { obligation, reasons };
  });
  const conflicts = conflictChecks.filter((check) => check.reasons.length > 0);

  const activeContracts = contracts.filter((contract) => contract.status === "active").length;
  const draftContracts = contracts.filter((contract) => contract.status === "draft").length;
  const copyPendingApproval = copy.filter((item) => item.approval_status === "draft").length;
  const copyApproved = copy.filter((item) => item.approval_status === "approved").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded border border-line p-4">
          <div className="text-2xl font-bold text-ink-900">{activeContracts}</div>
          <div className="text-xs text-ink-400">Active contracts</div>
        </div>
        <div className="rounded border border-line p-4">
          <div className="text-2xl font-bold text-ink-900">{draftContracts}</div>
          <div className="text-xs text-ink-400">Draft contracts</div>
        </div>
        <div className="rounded border border-line p-4">
          <div className="text-2xl font-bold text-ink-900">{copyApproved}</div>
          <div className="text-xs text-ink-400">Approved copy</div>
        </div>
        <div className="rounded border border-line p-4">
          <div className="text-2xl font-bold text-ink-900">{copyPendingApproval}</div>
          <div className="text-xs text-ink-400">Copy awaiting approval</div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Pre-broadcast conflicts</h2>
          {conflicts.length > 0 && <Badge variant="danger">{conflicts.length}</Badge>}
        </div>
        {conflicts.length === 0 ? (
          <p className="text-sm text-ink-500">No active obligation is currently blocked from placement.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {conflicts.map(({ obligation, reasons }) => (
              <li key={obligation.id} className="rounded border border-danger/30 bg-danger/[0.04] p-3 text-sm">
                <Link
                  href={`/underwriting/contracts/${obligation.contract_id}`}
                  className="font-semibold text-brand-link"
                >
                  {obligation.description}
                </Link>
                <ul className="mt-1 list-disc pl-5 text-xs text-ink-700">
                  {reasons.map((reason) => (
                    <li key={reason}>{CONFLICT_LABEL[reason]}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Open exceptions</h2>
          {unresolvedExceptions.length > 0 && <Badge variant="warning">{unresolvedExceptions.length}</Badge>}
        </div>
        {unresolvedExceptions.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing awaiting resolution.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {unresolvedExceptions.slice(0, 5).map((exception) => (
              <li key={exception.id} className="flex items-center gap-2.5 text-sm">
                <Link
                  href={`/underwriting/exceptions/${exception.id}`}
                  className="font-semibold text-brand-link"
                >
                  {exception.contract.underwriter_name}
                </Link>
                <span className="text-ink-400">{exception.obligation.description}</span>
                <Badge variant="warning">{exception.host_action.replace(/_/g, " ")}</Badge>
              </li>
            ))}
            {unresolvedExceptions.length > 5 && (
              <li>
                <Link href="/underwriting/exceptions" className="text-xs font-semibold text-brand-link">
                  See all {unresolvedExceptions.length} →
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>

      {contracts.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">
            Recently added contracts
          </h2>
          <ul className="flex flex-col gap-2">
            {contracts.slice(0, 5).map((contract) => (
              <li key={contract.id} className="flex items-center gap-2.5 text-sm">
                <Link href={`/underwriting/contracts/${contract.id}`} className="font-semibold text-brand-link">
                  {contract.underwriter_name}
                </Link>
                <span className="text-ink-400">{contract.contract_identifier}</span>
                <Badge variant={contract.status === "active" ? "success" : "neutral"}>{contract.status}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
