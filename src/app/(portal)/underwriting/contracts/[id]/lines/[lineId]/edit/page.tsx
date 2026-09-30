import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { canRewriteScheduleLine } from "@/lib/underwriting/line-mutability";
import { listProgramOptions } from "@/lib/underwriting/placement";
import { programsPermittedByPool } from "@/lib/underwriting/pool-targets";
import {
  buildScheduleLineDemandViews,
  getContractDetail,
  listInventoryPools,
} from "@/lib/underwriting/queries";
import { formValuesFromScheduleLine } from "@/lib/underwriting/schedule-line-form";
import { updateScheduleLine } from "../../../../../contract-actions";
import { ScheduleLineEditor } from "../../../../../schedule-line-editor";

/**
 * Edit a schedule line with the same editor that created it (docs/ui-
 * patterns.md rule 3; docs/underwriting-traffic-redesign.md §11.4). Only a
 * line nothing has scheduled from — on a draft contract, or under a draft
 * revision — gets here with the form; one with placements behind it is
 * told to cancel from a date instead. `return_to=schedule` comes from the
 * setup wizard's schedule step and sends Save and Cancel back there; the
 * contract page's Edit link passes nothing and returns there.
 */
export default async function EditScheduleLinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; lineId: string }>;
  searchParams: Promise<{ error?: string; return_to?: string }>;
}) {
  const { id, lineId } = await params;
  const { error, return_to } = await searchParams;
  const contract = await getContractDetail(id);
  if (!contract) notFound();
  const line = contract.scheduleLines.find((candidate) => candidate.id === lineId);
  if (!line) notFound();
  const revision = contract.revisions.find((candidate) => candidate.id === line.revision_id);

  const returnTo = return_to === "schedule" ? "schedule" : undefined;
  const backHref = returnTo
    ? `/underwriting/contracts/${contract.id}/schedule`
    : `/underwriting/contracts/${contract.id}?tab=schedule`;
  const backLabel = returnTo ? "Back to the schedule" : "Back to the contract";

  // The sibling lines under the same revision, for the aside's contract total.
  const siblings = contract.scheduleLines.filter(
    (candidate) =>
      candidate.revision_id === line.revision_id &&
      candidate.status === "active" &&
      candidate.id !== line.id,
  );
  const [pools, programs] = await Promise.all([listInventoryPools(), listProgramOptions()]);
  const programNameById = new Map(programs.map((program) => [program.id, program.name]));
  const poolNameById = new Map(pools.map((pool) => [pool.id, pool.name]));
  const [views, ownView] = await Promise.all([
    buildScheduleLineDemandViews(contract, siblings, contract.bucketsByLine, {
      poolNameById,
      programNameById,
    }),
    buildScheduleLineDemandViews(contract, [line], contract.bucketsByLine, {
      poolNameById,
      programNameById,
    }),
  ]);
  const placementCount = (ownView[0]?.placements ?? []).filter(
    (placement) => placement.status !== "superseded",
  ).length;
  const rewritable =
    line.status === "active" &&
    canRewriteScheduleLine({
      contractStatus: contract.status,
      revisionStatus: revision?.status ?? "",
      placementCount,
    });

  return (
    <div>
      <Link href={backHref} className="text-xs font-semibold text-brand-link">
        ← {backLabel}
      </Link>
      <h2 className="mt-2 mb-1 font-serif text-xl font-bold text-ink-900">Edit schedule line</h2>
      <p className="mb-5 text-sm text-ink-500">
        {contract.underwriter.name} · {orderNumberLabel(contract.contract_identifier)}
      </p>
      {rewritable ? (
        <ScheduleLineEditor
          contractId={contract.id}
          revisions={[
            {
              id: line.revision_id,
              label: revision?.revision_label ?? "Revision",
              status: revision?.status ?? "current",
            },
          ]}
          defaultRevisionId={line.revision_id}
          pools={pools
            .filter((pool) => pool.active || pool.id === line.pool_id)
            .map((pool) => ({
              id: pool.id,
              name: pool.name,
              hint: pool.targets.length === 0 ? "(no Log mapping yet)" : undefined,
              programIds: programsPermittedByPool(pool.targets),
            }))}
          programs={programs.map((program) => ({ id: program.id, name: program.name }))}
          flights={contract.flights
            .filter((flight) => flight.status === "active" || flight.id === line.flight_id)
            .map((flight) => ({ id: flight.id, name: flight.name }))}
          contractStart={contract.effective_from}
          contractEnd={contract.effective_to}
          otherLines={views.map((view) => ({
            label: view.scheduleLine.label || view.description,
            expected: view.summary.expected,
          }))}
          statedTotalSpots={contract.stated_total_spots}
          action={updateScheduleLine}
          returnTo={returnTo}
          error={error ?? null}
          initial={formValuesFromScheduleLine(line)}
          lineId={line.id}
          cancelHref={backHref}
        />
      ) : (
        <Alert>
          This line has scheduled credits behind it, so it can&apos;t be rewritten. Cancel it from a
          date on the contract page and enter the correction as a new line.
        </Alert>
      )}
    </div>
  );
}
