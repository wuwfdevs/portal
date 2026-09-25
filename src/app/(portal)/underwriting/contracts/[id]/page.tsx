import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  buildScheduleLineDemandViews,
  getContractDetail,
  listInventoryPools,
  listNearbyPlacementsForAdjacency,
  listScheduleLinePlacementContexts,
  type ScheduleLineDemandView,
  type UwContractRevisionRow,
} from "@/lib/underwriting/queries";
import { previewRevisionActivation } from "@/lib/underwriting/revisions";
import { formatPlacementTime, listProgramOptions } from "@/lib/underwriting/placement";
import { FULFILLMENT_STATUS_LABEL, type FulfillmentStatus } from "@/lib/underwriting/demand";
import { computeReadiness, countReady } from "@/lib/underwriting/readiness";
import {
  activateRevisionAction,
  cancelDraftRevision,
  cancelFlight,
  createFlight,
  createRevisionFromCurrent,
  setContractStatus,
  setCopyFlight,
  unlinkCopyFromContract,
  updateContractPolicy,
} from "../../contract-actions";
import { autoFillContractAction } from "../../auto-fill-actions";
import { ContractDocumentUpload } from "../../contract-document-upload";
import { FULFILLMENT_VARIANT, LineCard } from "./line-card";
import type { UwContractStatus, UwRevisionStatus } from "@/lib/database.types";

const CONTRACT_STATUS_VARIANT: Record<UwContractStatus, BadgeVariant> = {
  draft: "neutral",
  active: "success",
  expired: "muted",
  terminated: "danger",
};

const REVISION_STATUS_VARIANT: Record<UwRevisionStatus, BadgeVariant> = {
  draft: "warning",
  current: "success",
  superseded: "muted",
  cancelled: "muted",
};

const TABS = ["schedule", "copy", "flights", "placements", "revisions", "policy"] as const;
type Tab = (typeof TABS)[number];

function revisionName(revision: UwContractRevisionRow, index: number): string {
  return revision.revision_label ?? `Revision ${index + 1}`;
}

/**
 * The contract page (docs/underwriting-traffic-redesign.md §11, from the
 * reviewed mockup): what needs doing first, then the contract's parts as
 * sub-tabs, with the facts and the status beside them. A draft leads with
 * a readiness checklist; lines are entered on the schedule step and
 * appear here as cards with a delivery bar and a "⋮" menu.
 */
export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { error, notice, tab: rawTab } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as Tab)
    : "schedule";
  const contract = await getContractDetail(id);
  if (!contract) notFound();

  const currentLines = contract.scheduleLines.filter(
    (line) => line.revision_id === contract.currentRevision?.id,
  );
  const [programs, pools, lineContexts, activation] = await Promise.all([
    listProgramOptions(),
    listInventoryPools(),
    listScheduleLinePlacementContexts(currentLines),
    contract.draftRevision ? previewRevisionActivation(contract.draftRevision.id) : null,
  ]);
  const programNameById = new Map(programs.map((program) => [program.id, program.name]));
  const poolNameById = new Map(pools.map((pool) => [pool.id, pool.name]));
  const flightNameById = new Map(contract.flights.map((flight) => [flight.id, flight.name]));
  const views = await buildScheduleLineDemandViews(
    contract,
    contract.scheduleLines,
    contract.bucketsByLine,
    { poolNameById, programNameById },
  );
  const viewsByRevision = new Map<string, ScheduleLineDemandView[]>();
  for (const view of views) {
    const list = viewsByRevision.get(view.scheduleLine.revision_id) ?? [];
    list.push(view);
    viewsByRevision.set(view.scheduleLine.revision_id, list);
  }
  const placeableByLine = new Map(
    lineContexts.map((context) => [context.scheduleLine.id, context.placeable]),
  );
  const flightByCopy = new Map(contract.copyLinks.map((link) => [link.copy_id, link.flight_id]));

  const adjacencyByLine = new Map<
    string,
    Awaited<ReturnType<typeof listNearbyPlacementsForAdjacency>>
  >();
  for (const line of currentLines) {
    if (!line.program_id) continue;
    adjacencyByLine.set(
      line.id,
      await listNearbyPlacementsForAdjacency(line.program_id, contract.id),
    );
  }

  const currentViews = (
    contract.currentRevision ? (viewsByRevision.get(contract.currentRevision.id) ?? []) : []
  ).filter((view) => view.scheduleLine.status === "active");
  const guaranteedViews = currentViews.filter((view) => !view.summary.bonus);
  const expectedTotal = currentViews.reduce((sum, view) => sum + view.summary.expected, 0);
  const deliveredTotal = currentViews.reduce((sum, view) => sum + view.summary.delivered, 0);
  const scheduledTotal = currentViews.reduce((sum, view) => sum + view.summary.scheduled, 0);
  const contractStatus: FulfillmentStatus =
    currentViews.length === 0
      ? "no_target"
      : guaranteedViews.some((view) => view.summary.status === "behind")
        ? "behind"
        : currentViews.every((view) => view.summary.status === "fulfilled")
          ? "fulfilled"
          : "on_track";
  const statedMismatch =
    contract.stated_total_spots != null && contract.stated_total_spots !== expectedTotal
      ? contract.stated_total_spots
      : null;
  const separationUndecided =
    Boolean(contract.separation_source_text) && contract.separation_policy === "unspecified";
  const isDraft = contract.status === "draft";
  const base = `/underwriting/contracts/${contract.id}`;

  const readiness = isDraft
    ? computeReadiness({
        contractIdentifier: contract.contract_identifier,
        effectiveFrom: contract.effective_from,
        effectiveTo: contract.effective_to,
        sponsorshipTotal: contract.sponsorship_total,
        hasAgreement: contract.agreement_document_path !== null,
        lineCount: currentViews.length,
        expectedTotal,
        statedTotalSpots: contract.stated_total_spots,
        copyLinked: contract.copy.length,
        copyApproved: contract.copy.filter((item) => item.approval_status === "approved").length,
        separationUndecided,
        affidavitRequired: contract.affidavit_required,
        makegoodRequiresAgencyApproval: contract.makegood_requires_agency_approval,
        preemptionPolicy: contract.preemption_policy,
      })
    : null;
  const readinessHref: Record<string, string> = {
    order: `${base}/order`,
    agreement: `${base}?tab=policy`,
    schedule: `${base}/schedule`,
    copy: `${base}/policy`,
    policy: `${base}/policy`,
  };

  const allPlacements = views
    .filter((view) => view.scheduleLine.revision_id === contract.currentRevision?.id)
    .flatMap((view) => view.placements.map((placement) => ({ placement, view })))
    .filter(({ placement }) => placement.status !== "superseded")
    .sort((a, b) => a.placement.scheduled_at.localeCompare(b.placement.scheduled_at));

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "schedule", label: "Schedule", count: currentViews.length },
    { key: "copy", label: "Copy", count: contract.copy.length },
    { key: "flights", label: "Flights", count: contract.flights.length },
    { key: "placements", label: "Placements", count: allPlacements.length },
    { key: "revisions", label: "Revisions", count: contract.revisions.length },
    { key: "policy", label: "Policy" },
  ];

  const revisionsForSchedule = [
    ...(contract.draftRevision ? [contract.draftRevision] : []),
    ...(contract.currentRevision ? [contract.currentRevision] : []),
  ];
  const olderRevisions = contract.revisions.filter(
    (revision) => revision.status === "superseded" || revision.status === "cancelled",
  );

  return (
    <div>
      <Link href="/underwriting/contracts" className="text-xs font-semibold text-brand-link">
        ← Contracts
      </Link>
      <div className="mt-2 mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-serif text-xl font-bold text-ink-900">
              <Link
                href={`/underwriting/underwriters/${contract.underwriter.id}`}
                className="hover:underline"
              >
                {contract.underwriter.name}
              </Link>
            </h2>
            <Badge variant={CONTRACT_STATUS_VARIANT[contract.status]}>{contract.status}</Badge>
            {!isDraft && (
              <Badge variant={FULFILLMENT_VARIANT[contractStatus]}>
                {FULFILLMENT_STATUS_LABEL[contractStatus]}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[13px] text-ink-500">
            {contract.contract_identifier} · {contract.effective_from}
            {contract.effective_to ? ` – ${contract.effective_to}` : ""}
            {contract.sponsorship_category ? ` · ${contract.sponsorship_category}` : ""}
            {contract.sponsorship_total != null
              ? ` · $${contract.sponsorship_total.toLocaleString()}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`${base}/order`}
            className="inline-flex items-center justify-center rounded border border-brand-link px-4 py-2.5 text-sm font-bold text-brand-link hover:bg-brand-surface"
          >
            Edit order details
          </Link>
          {isDraft && (
            <form action={setContractStatus}>
              <input type="hidden" name="contract_id" value={contract.id} />
              <input type="hidden" name="status" value="active" />
              <Button type="submit">Activate contract</Button>
            </form>
          )}
        </div>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}
      {notice && (
        <Alert variant="info" className="mb-4">
          {notice}
        </Alert>
      )}
      {statedMismatch != null && !isDraft && (
        <Alert variant="note" className="mb-4">
          The order says {statedMismatch} spots in total, but the current revision&apos;s lines come
          to {expectedTotal}. Check the lines against the signed order — a partial week, a missed
          phase, or a typo in the order itself.
        </Alert>
      )}
      {separationUndecided && !isDraft && (
        <Alert variant="note" className="mb-4">
          The order states a separation rule (&ldquo;{contract.separation_source_text}&rdquo;) with
          no unit. Auto-fill won&apos;t schedule this contract until a policy is chosen under
          Policy.
        </Alert>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {readiness && (
            <section aria-labelledby="ready" className="rounded border border-line">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                <h3 id="ready" className="text-[15px] font-bold text-ink-900">
                  Ready to activate? {countReady(readiness).done} of {countReady(readiness).total}{" "}
                  complete
                </h3>
                <span className="text-xs text-ink-500">
                  Nothing schedules from a draft. Activation makes these lines the ones auto-fill
                  works from.
                </span>
              </div>
              <ol className="divide-y divide-line">
                {readiness.map((item) => (
                  <li key={item.key} className="flex items-start gap-3.5 px-5 py-3.5">
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        item.state === "ok"
                          ? "bg-success-bg text-success-fg"
                          : item.state === "warn"
                            ? "bg-warning-bg text-warning-fg"
                            : "bg-panel-100 text-ink-500"
                      }`}
                    >
                      {item.state === "ok" ? "✓" : item.state === "warn" ? "!" : "·"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-ink-900">{item.title}</div>
                      <div className="text-[13px] text-ink-500">{item.detail}</div>
                    </div>
                    <Link
                      href={readinessHref[item.key]!}
                      className="text-[13px] font-bold text-brand-link hover:underline"
                    >
                      {item.state === "ok" ? "Edit" : "Fix"}
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <nav aria-label="Contract sections" className="flex gap-5 border-b border-line">
            {tabs.map((item) => (
              <Link
                key={item.key}
                href={item.key === "schedule" ? base : `${base}?tab=${item.key}`}
                aria-current={tab === item.key ? "page" : undefined}
                className={`-mb-px flex h-9 items-center gap-1.5 border-b-2 px-0.5 text-[13px] font-semibold ${
                  tab === item.key
                    ? "border-ink-900 text-ink-900"
                    : "border-transparent text-ink-500 hover:text-ink-700"
                }`}
              >
                {item.label}
                {item.count !== undefined && (
                  <span className="rounded-full bg-panel-100 px-1.5 text-[11px] font-bold text-ink-500">
                    {item.count}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {tab === "schedule" && (
            <div className="flex flex-col gap-4">
              {revisionsForSchedule.map((revision) => {
                const revisionViews = viewsByRevision.get(revision.id) ?? [];
                const isCurrent = revision.status === "current";
                const isDraftRevision = revision.status === "draft";
                const index = contract.revisions.findIndex((r) => r.id === revision.id);
                return (
                  <section key={revision.id} className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-[15px] font-bold text-ink-900">
                        {revisionName(revision, index)}{" "}
                        <span className="font-normal text-ink-500">
                          · {revision.status} revision · effective {revision.effective_from}
                        </span>
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`${base}/schedule`}
                          className="inline-flex items-center justify-center rounded border border-brand-link px-3 py-2 text-[13px] font-bold text-brand-link hover:bg-brand-surface"
                        >
                          Add a line
                        </Link>
                        {isCurrent && currentViews.length > 0 && (
                          <form action={autoFillContractAction}>
                            <input type="hidden" name="contract_id" value={contract.id} />
                            <Button
                              type="submit"
                              variant="secondary"
                              className="px-3 py-2 text-[13px]"
                              disabled={contract.status !== "active"}
                            >
                              Auto-fill this contract
                            </Button>
                          </form>
                        )}
                      </div>
                    </div>
                    {revisionViews.length === 0 ? (
                      <p className="rounded border border-dashed border-line px-5 py-4 text-sm text-ink-500">
                        No schedule lines yet — enter the order&apos;s schedule on the schedule
                        step.
                      </p>
                    ) : (
                      <ul className="divide-y divide-line rounded border border-line">
                        {revisionViews.map((view) => (
                          <LineCard
                            key={view.scheduleLine.id}
                            view={view}
                            contract={contract}
                            isCurrent={isCurrent}
                            isDraft={isDraftRevision}
                            flightNameById={flightNameById}
                            flightByCopy={flightByCopy}
                            placeable={placeableByLine.get(view.scheduleLine.id) ?? null}
                            nearby={adjacencyByLine.get(view.scheduleLine.id) ?? []}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
              {revisionsForSchedule.length === 0 && (
                <p className="text-sm text-ink-500">
                  This contract has no revision to schedule from.
                </p>
              )}
              <p className="text-xs text-ink-500">
                Each line&apos;s menu holds Place a credit, Demand by period, Placements, and Cancel
                from a date. The bar shows aired and scheduled credits against the compiled demand.
              </p>
              {olderRevisions.some(
                (revision) => (viewsByRevision.get(revision.id) ?? []).length > 0,
              ) && (
                <details className="rounded border border-line">
                  <summary className="cursor-pointer px-5 py-3 text-[13px] font-semibold text-brand-link">
                    Earlier revisions&apos; lines
                  </summary>
                  {olderRevisions.map((revision) => {
                    const revisionViews = viewsByRevision.get(revision.id) ?? [];
                    if (revisionViews.length === 0) return null;
                    const index = contract.revisions.findIndex((r) => r.id === revision.id);
                    return (
                      <div key={revision.id} className="border-t border-line">
                        <div className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold text-ink-700">
                          {revisionName(revision, index)}
                          <Badge variant={REVISION_STATUS_VARIANT[revision.status]}>
                            {revision.status}
                          </Badge>
                        </div>
                        <ul className="divide-y divide-line border-t border-line">
                          {revisionViews.map((view) => (
                            <LineCard
                              key={view.scheduleLine.id}
                              view={view}
                              contract={contract}
                              isCurrent={false}
                              isDraft={false}
                              flightNameById={flightNameById}
                              flightByCopy={flightByCopy}
                              placeable={null}
                              nearby={[]}
                            />
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </details>
              )}
            </div>
          )}

          {tab === "copy" && (
            <section className="rounded border border-line">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                <span className="text-sm font-bold text-ink-900">Copy linked to this contract</span>
                <Link
                  href={`${base}/policy`}
                  className="inline-flex items-center justify-center rounded border border-brand-link px-3 py-2 text-[13px] font-bold text-brand-link hover:bg-brand-surface"
                >
                  Create or link copy
                </Link>
              </div>
              {contract.copy.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-500">No copy yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {contract.copy.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"
                    >
                      <Link
                        href={`/underwriting/copy/${item.id}`}
                        className="font-semibold text-brand-link"
                      >
                        {item.label}
                      </Link>
                      <span className="text-xs text-ink-500">
                        {item.execution_kind === "live_read" ? "live read" : "recorded"}
                        {item.duration_seconds != null && ` · ${item.duration_seconds}s`}
                      </span>
                      <Badge variant={item.approval_status === "approved" ? "success" : "warning"}>
                        {item.approval_status}
                      </Badge>
                      <span className="flex-1" />
                      {contract.flights.length > 0 && (
                        <form action={setCopyFlight} className="flex items-center gap-2">
                          <input type="hidden" name="contract_id" value={contract.id} />
                          <input type="hidden" name="copy_id" value={item.id} />
                          <Select
                            name="flight_id"
                            defaultValue={flightByCopy.get(item.id) ?? ""}
                            className="max-w-[220px]"
                          >
                            <option value="">Whole contract</option>
                            {contract.flights.map((flight) => (
                              <option key={flight.id} value={flight.id}>
                                {flight.name}
                              </option>
                            ))}
                          </Select>
                          <Button type="submit" variant="ghost">
                            Set flight
                          </Button>
                        </form>
                      )}
                      <form action={unlinkCopyFromContract}>
                        <input type="hidden" name="contract_id" value={contract.id} />
                        <input type="hidden" name="copy_id" value={item.id} />
                        <Button type="submit" variant="ghost">
                          Unlink
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <p className="border-t border-line px-5 py-3 text-xs text-ink-500">
                Existing copy is linked on the copy &amp; policy step, where new messages are
                written too.
              </p>
            </section>
          )}

          {tab === "flights" && (
            <section className="rounded border border-line">
              <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
                Flights
              </div>
              {contract.flights.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-500">
                  No flights — add one for each concert, production, or event the order groups its
                  dates and copy under.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {contract.flights.map((flight) => (
                    <li
                      key={flight.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                    >
                      <span>
                        <span className="font-semibold text-ink-900">{flight.name}</span>
                        <span className="ml-2 text-xs text-ink-400">
                          {flight.start_date} – {flight.end_date}
                        </span>
                        {flight.status === "cancelled" && (
                          <Badge variant="danger" className="ml-2">
                            cancelled
                          </Badge>
                        )}
                      </span>
                      {flight.status === "active" && (
                        <form action={cancelFlight} className="flex items-center gap-2">
                          <input type="hidden" name="contract_id" value={contract.id} />
                          <input type="hidden" name="flight_id" value={flight.id} />
                          <Input
                            name="cancelled_from"
                            type="date"
                            defaultValue={flight.start_date}
                            className="max-w-[160px]"
                          />
                          <Button type="submit" variant="ghost">
                            Cancel flight
                          </Button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <form
                action={createFlight}
                className="flex flex-wrap items-end gap-3 border-t border-line px-5 py-4"
              >
                <input type="hidden" name="contract_id" value={contract.id} />
                <div>
                  <Label htmlFor="flight_name">Name</Label>
                  <Input id="flight_name" name="name" placeholder="El Mesias — Dec 4 & 5" />
                </div>
                <div>
                  <Label htmlFor="flight_start">From</Label>
                  <Input id="flight_start" name="start_date" type="date" />
                </div>
                <div>
                  <Label htmlFor="flight_end">To</Label>
                  <Input id="flight_end" name="end_date" type="date" />
                </div>
                <Button type="submit" variant="secondary">
                  Add flight
                </Button>
              </form>
            </section>
          )}

          {tab === "placements" && (
            <section className="rounded border border-line">
              <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
                Placements under the current revision
              </div>
              {allPlacements.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-500">
                  Nothing scheduled yet. Auto-fill or place credits from the Schedule tab.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {allPlacements.map(({ placement, view }) => (
                    <li
                      key={placement.id}
                      className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[13px]"
                    >
                      <span className="w-40 shrink-0 font-semibold text-ink-900">
                        {formatPlacementTime(placement.scheduled_at)}
                      </span>
                      <span className="text-ink-700">
                        {placement.program_name}
                        {placement.break_label ? ` · ${placement.break_label}` : ""}
                      </span>
                      <span className="text-ink-500">
                        {view.scheduleLine.label || view.description}
                      </span>
                      <span className="flex-1" />
                      {placement.makegood_id && <Badge variant="warning">makegood</Badge>}
                      <Badge
                        variant={
                          placement.outcome === "aired"
                            ? "success"
                            : placement.outcome === "not_aired"
                              ? "danger"
                              : "accent"
                        }
                      >
                        {placement.outcome === "pending"
                          ? "scheduled"
                          : placement.outcome === "aired"
                            ? "aired"
                            : "not aired"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "revisions" && (
            <section className="rounded border border-line">
              <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
                Revisions
              </div>
              <ul className="divide-y divide-line">
                {contract.revisions.map((revision, index) => (
                  <li
                    key={revision.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-900">
                        {revisionName(revision, index)}
                      </span>
                      <Badge variant={REVISION_STATUS_VARIANT[revision.status]}>
                        {revision.status}
                      </Badge>
                      <span className="text-xs text-ink-400">
                        effective {revision.effective_from}
                        {revision.received_at ? ` · received ${revision.received_at}` : ""}
                        {` · ${(viewsByRevision.get(revision.id) ?? []).length} line${(viewsByRevision.get(revision.id) ?? []).length === 1 ? "" : "s"}`}
                      </span>
                    </span>
                    {revision.notes && (
                      <span className="text-xs text-ink-500">{revision.notes}</span>
                    )}
                  </li>
                ))}
              </ul>

              {contract.draftRevision && activation && (
                <div className="border-t border-line bg-warning-bg/40 px-5 py-4 text-sm">
                  <div className="mb-1 font-semibold text-ink-900">
                    Activating &ldquo;
                    {revisionName(
                      contract.draftRevision,
                      contract.revisions.findIndex((r) => r.id === contract.draftRevision?.id),
                    )}
                    &rdquo; from {contract.draftRevision.effective_from} would:
                  </div>
                  <ul className="mb-3 list-disc pl-5 text-xs text-ink-700">
                    <li>
                      Supersede {activation.bucketsToSupersede.length} open demand bucket
                      {activation.bucketsToSupersede.length === 1 ? "" : "s"} of the current
                      revision (
                      {activation.bucketsToSupersede.reduce((s, b) => s + b.quantity_required, 0)}{" "}
                      credits still owed there).
                    </li>
                    <li>
                      Clear {activation.placementsToClear.length} scheduled placement
                      {activation.placementsToClear.length === 1 ? "" : "s"} dated on or after the
                      effective date
                      {activation.placementsToClear.length > 0 &&
                        ` (${activation.placementsToClear
                          .slice(0, 4)
                          .map((p) => formatPlacementTime(p.scheduled_at))
                          .join(", ")}${activation.placementsToClear.length > 4 ? ", …" : ""})`}
                      . {activation.placementsKept} earlier placement
                      {activation.placementsKept === 1 ? "" : "s"} and every broadcast event stay
                      with the old revision.
                    </li>
                    {activation.makegoodsLeftOpen > 0 && (
                      <li>
                        Leave {activation.makegoodsLeftOpen} makegood
                        {activation.makegoodsLeftOpen === 1 ? "" : "s"} awaiting a slot open under
                        the old revision — resolve or cancel them on the Makegoods screen.
                      </li>
                    )}
                    {activation.draftBucketsDropped.length > 0 && (
                      <li>
                        Drop {activation.draftBucketsDropped.length} of the draft&apos;s own bucket
                        {activation.draftBucketsDropped.length === 1 ? "" : "s"} that end before the
                        effective date, so no period is counted twice.
                      </li>
                    )}
                    <li>
                      Make the draft&apos;s{" "}
                      {(viewsByRevision.get(contract.draftRevision.id) ?? []).length} line
                      {(viewsByRevision.get(contract.draftRevision.id) ?? []).length === 1
                        ? ""
                        : "s"}{" "}
                      the ones auto-fill and manual placement schedule from.
                    </li>
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <form action={activateRevisionAction}>
                      <input type="hidden" name="contract_id" value={contract.id} />
                      <input type="hidden" name="revision_id" value={contract.draftRevision.id} />
                      <Button type="submit">Activate revision</Button>
                    </form>
                    <form action={cancelDraftRevision}>
                      <input type="hidden" name="contract_id" value={contract.id} />
                      <input type="hidden" name="revision_id" value={contract.draftRevision.id} />
                      <Button type="submit" variant="ghost">
                        Discard draft
                      </Button>
                    </form>
                  </div>
                </div>
              )}

              {!contract.draftRevision && contract.currentRevision && (
                <details className="border-t border-line px-5 py-3">
                  <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                    Create a revision from the current schedule
                  </summary>
                  <form
                    action={createRevisionFromCurrent}
                    className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
                  >
                    <input type="hidden" name="contract_id" value={contract.id} />
                    <div>
                      <Label htmlFor="revision_label">Label</Label>
                      <Input
                        id="revision_label"
                        name="revision_label"
                        placeholder="Revised order, Oct 1"
                        maxLength={80}
                      />
                    </div>
                    <div>
                      <Label htmlFor="revision_effective_from">Takes effect</Label>
                      <Input
                        id="revision_effective_from"
                        name="effective_from"
                        type="date"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="revision_received_at">Received</Label>
                      <Input id="revision_received_at" name="received_at" type="date" />
                    </div>
                    <label className="flex items-center gap-2 pb-2 text-sm text-ink-700">
                      <input type="checkbox" name="copy_lines" className="h-4 w-4" defaultChecked />
                      Start from a copy of the current lines
                    </label>
                    <Button type="submit" variant="secondary">
                      Create draft
                    </Button>
                  </form>
                  <FieldHint>
                    A draft is edited beside the current schedule and schedules nothing until it is
                    activated. Activation changes future demand only — aired credits, broadcast
                    events and exceptions stay with the revision they happened under.
                  </FieldHint>
                </details>
              )}
            </section>
          )}

          {tab === "policy" && (
            <div className="flex flex-col gap-6">
              <section className="rounded border border-line p-5">
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500">
                  Executed agreement
                </div>
                <ContractDocumentUpload
                  contractId={contract.id}
                  existingPath={contract.agreement_document_path}
                />
              </section>
              <section className="rounded border border-line">
                <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
                  Traffic policy
                </div>
                <form action={updateContractPolicy} className="flex flex-col gap-4 p-5">
                  <input type="hidden" name="contract_id" value={contract.id} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="stated_total_spots">Total spots on the order</Label>
                      <Input
                        id="stated_total_spots"
                        name="stated_total_spots"
                        type="number"
                        min={0}
                        defaultValue={contract.stated_total_spots ?? ""}
                      />
                      <FieldHint>
                        Checked against what the lines compile to — never the scheduling target.
                      </FieldHint>
                    </div>
                    <div>
                      <Label htmlFor="preemption_policy">Preemption / makegood policy</Label>
                      <Input
                        id="preemption_policy"
                        name="preemption_policy"
                        defaultValue={contract.preemption_policy ?? ""}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      name="affidavit_required"
                      className="h-4 w-4"
                      defaultChecked={contract.affidavit_required}
                    />
                    Affidavit required
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      name="makegood_requires_agency_approval"
                      className="h-4 w-4"
                      defaultChecked={contract.makegood_requires_agency_approval}
                    />
                    Makegoods need agency approval
                  </label>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="separation_source_text">
                        Separation, as the order prints it
                      </Label>
                      <Input
                        id="separation_source_text"
                        name="separation_source_text"
                        defaultValue={contract.separation_source_text ?? ""}
                      />
                    </div>
                    <div>
                      <Label htmlFor="separation_policy">Separation policy</Label>
                      <Select
                        id="separation_policy"
                        name="separation_policy"
                        defaultValue={contract.separation_policy}
                      >
                        <option value="unspecified">
                          Undecided (blocks auto-fill if the order states one)
                        </option>
                        <option value="none">None beyond the standard rules</option>
                        <option value="min_minutes">At least N minutes apart on a day</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="separation_minutes">Minutes apart</Label>
                      <Input
                        id="separation_minutes"
                        name="separation_minutes"
                        type="number"
                        min={1}
                        defaultValue={contract.separation_minutes ?? ""}
                      />
                    </div>
                  </div>
                  <div>
                    <Button type="submit" variant="secondary">
                      Save policy
                    </Button>
                  </div>
                </form>
              </section>
            </div>
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
          <div className="rounded border border-line px-5 py-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
              At a glance
            </div>
            <dl className="text-[13px]">
              {[
                ["Underwriter", contract.underwriter.name],
                ["Contact", contract.underwriter.contact_name ?? "—"],
                ["Order", contract.contract_identifier],
                [
                  "Runs",
                  `${contract.effective_from}${contract.effective_to ? ` – ${contract.effective_to}` : " (open-ended)"}`,
                ],
                [
                  "Sponsorship",
                  `${contract.sponsorship_total != null ? `$${contract.sponsorship_total.toLocaleString()}` : "—"}${contract.stated_total_spots != null ? ` · ${contract.stated_total_spots} spots` : ""}`,
                ],
                ["Agreement", contract.agreement_document_path ? "Attached" : "Not attached"],
              ].map(([term, value]) => (
                <div
                  key={term}
                  className="flex justify-between gap-3 border-b border-line py-2 last:border-b-0"
                >
                  <dt className="text-ink-500">{term}</dt>
                  <dd className="text-right font-semibold text-ink-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {!isDraft && expectedTotal > 0 && (
            <div className="rounded border border-line px-5 py-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Delivery
              </div>
              <ProgressBar
                done={deliveredTotal}
                pending={scheduledTotal}
                total={expectedTotal}
                complete={contractStatus === "fulfilled"}
              />
              <p className="mt-2 text-[13px] text-ink-700">
                {deliveredTotal} aired · {scheduledTotal} scheduled of {expectedTotal}
              </p>
            </div>
          )}

          <div className="rounded border border-line px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Traffic policy
              </span>
              <Link href={`${base}?tab=policy`} className="text-xs font-semibold text-brand-link">
                Edit
              </Link>
            </div>
            <dl className="text-[13px]">
              {[
                ["Affidavit", contract.affidavit_required ? "Required" : "Not required"],
                [
                  "Makegoods",
                  contract.makegood_requires_agency_approval
                    ? "Agency approval needed"
                    : "Station's discretion",
                ],
                [
                  "Separation",
                  contract.separation_policy === "min_minutes"
                    ? `At least ${contract.separation_minutes} min apart`
                    : contract.separation_policy === "none"
                      ? "None stated"
                      : contract.separation_source_text
                        ? `“${contract.separation_source_text}” — undecided`
                        : "None stated",
                ],
                ["Preemption", contract.preemption_policy ?? "—"],
              ].map(([term, value]) => (
                <div
                  key={term}
                  className="flex justify-between gap-3 border-b border-line py-2 last:border-b-0"
                >
                  <dt className="text-ink-500">{term}</dt>
                  <dd className="max-w-[170px] text-right font-semibold text-ink-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded border border-line px-5 py-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
              Status
            </div>
            {isDraft ? (
              <>
                <p className="mb-3 text-[13px] leading-relaxed text-ink-700">
                  Draft. Activate when the order has been checked against the lines above. Expire or
                  terminate from here later.
                </p>
                <form action={setContractStatus}>
                  <input type="hidden" name="contract_id" value={contract.id} />
                  <input type="hidden" name="status" value="active" />
                  <Button type="submit" className="w-full">
                    Activate contract
                  </Button>
                </form>
              </>
            ) : (
              <form action={setContractStatus} className="flex flex-col gap-3">
                <input type="hidden" name="contract_id" value={contract.id} />
                <Select name="status" defaultValue={contract.status}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="terminated">Terminated</option>
                </Select>
                <Button type="submit" variant="secondary">
                  Update status
                </Button>
              </form>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
