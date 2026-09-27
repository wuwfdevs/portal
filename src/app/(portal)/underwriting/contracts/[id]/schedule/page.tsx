import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildScheduleLineDemandViews,
  getContractDetail,
  listInventoryPools,
} from "@/lib/underwriting/queries";
import { canRewriteScheduleLine } from "@/lib/underwriting/line-mutability";
import { listProgramOptions } from "@/lib/underwriting/placement";
import { programsPermittedByPool } from "@/lib/underwriting/pool-targets";
import { addScheduleLine, removeDraftScheduleLine } from "../../../contract-actions";
import { ScheduleLineEditor } from "../../../schedule-line-editor";
import { WizardHeader } from "../wizard-header";
import { AgreementReadingNotes } from "./agreement-reading";
import {
  parseAgreementReading,
  proposeScheduleFromModelOutput,
} from "@/lib/underwriting/agreement-import";

/**
 * Setup step 2: the order's schedule, one line per printed instruction
 * (docs/underwriting-traffic-redesign.md §11). Lines already entered under
 * the revision being set up are listed with what they compile to and
 * whether that matches the order; the editor below adds the next one and
 * compiles it live. Each entered line can be edited or removed while
 * nothing has scheduled from it (line-mutability.ts) — during setup the
 * contract itself is the draft, its first revision is already `current`.
 */
export default async function ContractSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; prefill?: string }>;
}) {
  const { id } = await params;
  const { error, prefill } = await searchParams;
  const contract = await getContractDetail(id);
  if (!contract) notFound();

  // The revision being set up: a draft when one is open, else the current one.
  const revision = contract.draftRevision ?? contract.currentRevision;
  const lines = revision
    ? contract.scheduleLines.filter(
        (line) => line.revision_id === revision.id && line.status === "active",
      )
    : [];
  const [pools, programs] = await Promise.all([listInventoryPools(), listProgramOptions()]);
  const programNameById = new Map(programs.map((program) => [program.id, program.name]));
  const poolNameById = new Map(pools.map((pool) => [pool.id, pool.name]));
  const views = await buildScheduleLineDemandViews(contract, lines, contract.bucketsByLine, {
    poolNameById,
    programNameById,
  });
  const enterable = contract.revisions.filter(
    (candidate) => candidate.status === "current" || candidate.status === "draft",
  );
  const rewritable = canRewriteScheduleLine({
    contractStatus: contract.status,
    revisionStatus: revision?.status ?? "",
  });

  // A contract created from its agreement (§12) keeps the model's reading;
  // the lines it could save are in the list above like any other, and the
  // rest are listed from the reading — with ?prefill=<index> loading one
  // into the editor so a partly-right reading is corrected, not retyped.
  const reading = parseAgreementReading(contract.agreement_reading);
  const proposal = reading
    ? proposeScheduleFromModelOutput(reading.output, {
        pools: pools.map((pool) => ({ id: pool.id, name: pool.name })),
        programs: programs.map((program) => ({ id: program.id, name: program.name })),
        flights: contract.flights
          .filter((flight) => flight.status === "active")
          .map((flight) => ({ id: flight.id, name: flight.name })),
      })
    : null;
  const prefillIndex = prefill === undefined ? Number.NaN : Number.parseInt(prefill, 10);
  const prefillLine =
    proposal && Number.isInteger(prefillIndex) ? proposal.lines[prefillIndex] : undefined;

  return (
    <div>
      <WizardHeader
        contract={{
          id: contract.id,
          underwriterName: contract.underwriter.name,
          identifier: contract.contract_identifier,
          effectiveFrom: contract.effective_from,
          effectiveTo: contract.effective_to,
          status: contract.status,
        }}
        current={1}
      />

      <section aria-labelledby="entered" className="mb-5 flex flex-col gap-2.5">
        <h3 id="entered" className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
          Lines entered · {views.length}
        </h3>
        {views.length === 0 ? (
          <p className="text-sm text-ink-500">None yet — add the first one below.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {views.map((view) => {
              const stated = view.scheduleLine.stated_total;
              const expected = view.summary.expected;
              return (
                <li
                  key={view.scheduleLine.id}
                  className="flex flex-wrap items-center gap-3 rounded border border-line px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-ink-900">
                      {view.scheduleLine.label || view.description}
                    </div>
                    <div className="mt-0.5 text-[13px] text-ink-700">
                      {view.description} · {view.scheduleLine.duration_seconds}s
                    </div>
                  </div>
                  {stated == null ? (
                    <Badge variant="neutral">Compiles to {expected}</Badge>
                  ) : stated === expected ? (
                    <Badge variant="success">Matches order · {expected}</Badge>
                  ) : (
                    <Badge variant="warning">
                      Order says {stated} · compiles to {expected}
                    </Badge>
                  )}
                  {rewritable && (
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/underwriting/contracts/${contract.id}/lines/${view.scheduleLine.id}/edit?return_to=schedule`}
                        className="inline-flex items-center justify-center rounded px-3 py-2 text-[13px] font-bold text-brand-link hover:bg-brand-surface"
                      >
                        Edit
                      </Link>
                      <form action={removeDraftScheduleLine}>
                        <input type="hidden" name="contract_id" value={contract.id} />
                        <input type="hidden" name="schedule_line_id" value={view.scheduleLine.id} />
                        <input type="hidden" name="return_to" value="schedule" />
                        <Button type="submit" variant="ghost">
                          Remove
                        </Button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {reading && proposal && rewritable && (
        <AgreementReadingNotes contractId={contract.id} reading={reading} proposal={proposal} />
      )}

      {enterable.length === 0 ? (
        <p className="text-sm text-ink-500">
          This contract has no current or draft revision to add lines to.
        </p>
      ) : (
        <div id="line-editor">
          <ScheduleLineEditor
            contractId={contract.id}
            revisions={enterable.map((candidate, index) => ({
              id: candidate.id,
              label: candidate.revision_label ?? `Revision ${index + 1}`,
              status: candidate.status,
            }))}
            defaultRevisionId={revision?.id ?? enterable[0]!.id}
            pools={pools
              .filter((pool) => pool.active)
              .map((pool) => ({
                id: pool.id,
                name: pool.name,
                hint: pool.targets.length === 0 ? "(no Log mapping yet)" : undefined,
                programIds: programsPermittedByPool(pool.targets),
              }))}
            programs={programs.map((program) => ({ id: program.id, name: program.name }))}
            flights={contract.flights
              .filter((flight) => flight.status === "active")
              .map((flight) => ({ id: flight.id, name: flight.name }))}
            contractStart={contract.effective_from}
            contractEnd={contract.effective_to}
            otherLines={views.map((view) => ({
              label: view.scheduleLine.label || view.description,
              expected: view.summary.expected,
            }))}
            statedTotalSpots={contract.stated_total_spots}
            action={addScheduleLine}
            returnTo="schedule"
            error={error ?? null}
            initial={prefillLine?.values}
            continueHref={{
              href: `/underwriting/contracts/${contract.id}/policy`,
              label: "Continue to copy & policy",
            }}
          />
        </div>
      )}
    </div>
  );
}
