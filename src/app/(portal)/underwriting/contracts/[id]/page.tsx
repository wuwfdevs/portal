import { SubNav } from "@/components/ui/sub-nav";
import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  buildScheduleLineDemandViews,
  getContractDetail,
  listAffidavitsForContract,
  listExceptionRefsForLines,
  listInventoryPools,
  type ScheduleLineDemandView,
} from "@/lib/underwriting/queries";
import { previewRevisionActivation } from "@/lib/underwriting/revisions";
import { listProgramOptions } from "@/lib/underwriting/placement";
import { parsePlacementListFilter } from "@/lib/underwriting/placement-list";
import { FULFILLMENT_STATUS_LABEL, type FulfillmentStatus } from "@/lib/underwriting/demand";
import { computeReadiness, countReady } from "@/lib/underwriting/readiness";
import { defaultAffidavitPeriod, newAffidavitHref } from "@/lib/underwriting/affidavits";
import { stationTodayISO } from "@/lib/log/timezone";
import { setContractStatus } from "../../contract-actions";
import { autoFillContractAction } from "../../auto-fill-actions";
import { AgreementTab, separationSummary } from "./agreement-tab";
import { ContractCopyPanel, type CopyPanelParams } from "./copy-panel";
import { DeleteContractControl } from "./delete-contract-control";
import { FlightsSection } from "./flights-section";
import { FULFILLMENT_VARIANT, LineCard } from "./line-card";
import { PlacementsByDate } from "./placements-by-date";
import { DraftRevisionBanner, ReviseScheduleForm, revisionName } from "./revision-panels";
import { ViewToggle, type ScheduleView } from "./view-toggle";
import { SecondaryLink, TextLink } from "@/components/ui/primary-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { DetailSummary } from "@/components/ui/detail-summary";
import { StatusBadge } from "@/components/ui/status-badge";
import { CONTRACT_STATUS, REVISION_STATUS } from "@/lib/underwriting/status";
import { pluralize } from "@/lib/format";
import { groupBy } from "@/lib/collections";

const TABS = ["schedule", "copy", "agreement"] as const;
type Tab = (typeof TABS)[number];

/**
 * The contract page (docs/underwriting-traffic-redesign.md §11, from the
 * reviewed mockup; §11.7 for the schedule tab's current shape): what needs
 * doing first, then the contract's parts as three sub-tabs — Schedule,
 * Copy, Agreement — with the facts and the status beside them. A draft
 * leads with a readiness checklist. The Schedule tab shows the lines
 * (summary rows that expand with `?details=<lineId>`) or, with
 * `?view=date`, every placement by date (`?show=`, `?page=`); a draft
 * revision is reviewed there (`?activate=1`) and a new one started there
 * (`?revise=1`), and the flights sit at its foot (`#flights`). The
 * Agreement tab holds the signed order, the traffic policy
 * (`&edit=policy`), affidavits and the revision history. `?line=<lineId>`
 * says which card a failed action's `error` belongs in. An unknown `?tab=`
 * falls back to Schedule.
 */
export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<
    {
      error?: string;
      notice?: string;
      tab?: string;
      details?: string;
      periods?: string;
      line?: string;
      view?: string;
      show?: string;
      page?: string;
      activate?: string;
      revise?: string;
      edit?: string;
    } & CopyPanelParams
  >;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { error, notice, tab: rawTab } = query;
  const expandedLineId = query.details ?? null;
  const showAllPeriods = query.periods === "all";
  const errorLineId = query.line ?? null;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as Tab)
    : "schedule";
  const scheduleView: ScheduleView = query.view === "date" ? "date" : "line";
  const contract = await getContractDetail(id);
  if (!contract) notFound();

  const [programs, pools, activation, affidavits, exceptionRefs] = await Promise.all([
    listProgramOptions(),
    listInventoryPools(),
    contract.draftRevision ? previewRevisionActivation(contract.draftRevision.id) : null,
    listAffidavitsForContract(contract.id),
    listExceptionRefsForLines(contract.scheduleLines.map((line) => line.id)),
  ]);
  const exceptionIdByPlacement = new Map(
    exceptionRefs.flatMap((ref) =>
      ref.scheduledPlacementId ? [[ref.scheduledPlacementId, ref.id] as const] : [],
    ),
  );
  const openExceptionCount = exceptionRefs.filter((ref) => ref.open).length;
  const programNameById = new Map(programs.map((program) => [program.id, program.name]));
  const poolNameById = new Map(pools.map((pool) => [pool.id, pool.name]));
  const flightNameById = new Map(contract.flights.map((flight) => [flight.id, flight.name]));
  const views = await buildScheduleLineDemandViews(
    contract,
    contract.scheduleLines,
    contract.bucketsByLine,
    { poolNameById, programNameById },
  );
  const viewsByRevision = groupBy(views, (view) => view.scheduleLine.revision_id);
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
  const affidavitPrefill = {
    contractId: contract.id,
    ...defaultAffidavitPeriod(contract.effective_from, contract.effective_to, stationTodayISO()),
  };

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
    agreement: `${base}?tab=agreement#signed-agreement`,
    schedule: `${base}/schedule`,
    copy: `${base}/copy`,
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
    { key: "agreement", label: "Agreement" },
  ];
  const canRevise = !contract.draftRevision && contract.currentRevision !== null;

  const revisionsForSchedule = [
    ...(contract.draftRevision ? [contract.draftRevision] : []),
    ...(contract.currentRevision ? [contract.currentRevision] : []),
  ];
  const olderRevisions = contract.revisions.filter(
    (revision) => revision.status === "superseded" || revision.status === "cancelled",
  );
  const olderRevisionsWithLines = olderRevisions.filter(
    (revision) => (viewsByRevision.get(revision.id) ?? []).length > 0,
  );
  // One revision needs no heading over the only list on the tab.
  const showRevisionHeadings =
    revisionsForSchedule.length > 1 || olderRevisionsWithLines.length > 0;
  const lineCardProps = (view: ScheduleLineDemandView) => ({
    view,
    contract,
    flightNameById,
    expanded: expandedLineId === view.scheduleLine.id,
    showAllPeriods: expandedLineId === view.scheduleLine.id && showAllPeriods,
    error: errorLineId === view.scheduleLine.id ? (error ?? null) : null,
  });

  return (
    <div>
      <TextLink href="/underwriting/contracts" className="text-xs">
        ← Contracts
      </TextLink>
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
            <StatusBadge map={CONTRACT_STATUS} value={contract.status} />
            {!isDraft && (
              <Badge variant={FULFILLMENT_VARIANT[contractStatus]}>
                {FULFILLMENT_STATUS_LABEL[contractStatus]}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[13px] text-ink-500">
            {orderNumberLabel(contract.contract_identifier)} · {contract.effective_from}
            {contract.effective_to ? ` – ${contract.effective_to}` : ""}
            {contract.sponsorship_category ? ` · ${contract.sponsorship_category}` : ""}
            {contract.sponsorship_total != null
              ? ` · $${contract.sponsorship_total.toLocaleString()}`
              : ""}
            {contract.account_rep ? ` · Rep: ${contract.account_rep}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SecondaryLink href={`${base}/order`}>Edit order details</SecondaryLink>
          {isDraft && (
            <form action={setContractStatus}>
              <input type="hidden" name="contract_id" value={contract.id} />
              <input type="hidden" name="status" value="active" />
              <Button type="submit">Activate contract</Button>
            </form>
          )}
        </div>
      </div>

      {error && tab !== "copy" && !errorLineId && <Alert className="mb-4">{error}</Alert>}
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
          no unit. Auto-fill won&apos;t schedule this contract until a policy is chosen under{" "}
          <TextLink href={`${base}?tab=agreement&edit=policy#traffic-policy`}>
            Traffic policy
          </TextLink>
          .
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
                    <TextLink href={readinessHref[item.key]!} className="text-[13px]">
                      {item.state === "ok" ? "Edit" : "Fix"}
                    </TextLink>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <SubNav
            label="Contract sections"
            className="mb-0"
            items={tabs.map((item) => ({
              href: item.key === "schedule" ? base : `${base}?tab=${item.key}`,
              label: item.label,
              active: tab === item.key,
              count: item.count,
            }))}
          />

          {tab === "schedule" && (
            <div className="flex flex-col gap-4">
              {contract.draftRevision && (
                <DraftRevisionBanner
                  base={base}
                  contractId={contract.id}
                  revisionId={contract.draftRevision.id}
                  name={revisionName(
                    contract.draftRevision,
                    contract.revisions.findIndex((r) => r.id === contract.draftRevision?.id),
                  )}
                  effectiveFrom={contract.draftRevision.effective_from}
                  draftLineCount={(viewsByRevision.get(contract.draftRevision.id) ?? []).length}
                  activation={activation}
                  expanded={query.activate === "1"}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ViewToggle base={base} view={scheduleView} />
                <div className="flex flex-wrap items-center gap-2">
                  <SecondaryLink size="sm" href={`${base}/schedule`}>
                    Add a line
                  </SecondaryLink>
                  {canRevise && (
                    <SecondaryLink size="sm" href={`${base}?revise=1`}>
                      Revise the schedule
                    </SecondaryLink>
                  )}
                  {contract.currentRevision && currentViews.length > 0 && (
                    <form action={autoFillContractAction}>
                      <input type="hidden" name="contract_id" value={contract.id} />
                      <Button
                        type="submit"
                        className="px-3 py-2 text-[13px]"
                        disabled={contract.status !== "active"}
                      >
                        Auto-fill this contract
                      </Button>
                    </form>
                  )}
                </div>
              </div>
              {canRevise && query.revise === "1" && (
                <ReviseScheduleForm base={base} contractId={contract.id} />
              )}

              {scheduleView === "date" ? (
                <PlacementsByDate
                  base={base}
                  contractId={contract.id}
                  contractActive={contract.status === "active"}
                  placements={allPlacements}
                  copyLabelById={new Map(contract.copy.map((copy) => [copy.id, copy.label]))}
                  exceptionIdByPlacement={exceptionIdByPlacement}
                  filter={parsePlacementListFilter(query.show)}
                  rawPage={query.page}
                />
              ) : (
                <>
                  {revisionsForSchedule.map((revision) => {
                    const revisionViews = viewsByRevision.get(revision.id) ?? [];
                    const isCurrent = revision.status === "current";
                    const isDraftRevision = revision.status === "draft";
                    const index = contract.revisions.findIndex((r) => r.id === revision.id);
                    return (
                      <section key={revision.id} className="flex flex-col gap-3">
                        {showRevisionHeadings && (
                          <h3 className="text-[15px] font-bold text-ink-900">
                            {revisionName(revision, index)}{" "}
                            <span className="font-normal text-ink-500">
                              · {revision.status} revision · effective {revision.effective_from}
                            </span>
                          </h3>
                        )}
                        {revisionViews.length === 0 ? (
                          <EmptyState compact>
                            No schedule lines yet — enter the order&apos;s schedule on the schedule
                            step.
                          </EmptyState>
                        ) : (
                          <ul className="divide-y divide-line rounded border border-line">
                            {revisionViews.map((view) => (
                              <LineCard
                                key={view.scheduleLine.id}
                                {...lineCardProps(view)}
                                isCurrent={isCurrent}
                                isDraft={isDraftRevision}
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
                  {olderRevisionsWithLines.length > 0 && (
                    <details className="rounded border border-line">
                      <summary className="cursor-pointer px-5 py-3 text-[13px] font-semibold text-brand-link">
                        Earlier revisions&apos; lines
                      </summary>
                      {olderRevisionsWithLines.map((revision) => {
                        const revisionViews = viewsByRevision.get(revision.id) ?? [];
                        const index = contract.revisions.findIndex((r) => r.id === revision.id);
                        return (
                          <div key={revision.id} className="border-t border-line">
                            <div className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold text-ink-700">
                              {revisionName(revision, index)}
                              <StatusBadge map={REVISION_STATUS} value={revision.status} />
                            </div>
                            <ul className="divide-y divide-line border-t border-line">
                              {revisionViews.map((view) => (
                                <LineCard
                                  key={view.scheduleLine.id}
                                  {...lineCardProps(view)}
                                  isCurrent={false}
                                  isDraft={false}
                                />
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </details>
                  )}
                </>
              )}

              <FlightsSection contract={contract} />
            </div>
          )}

          {tab === "copy" && <ContractCopyPanel contract={contract} surface="tab" params={query} />}

          {tab === "agreement" && (
            <AgreementTab
              contract={contract}
              base={base}
              editingPolicy={query.edit === "policy"}
              affidavits={affidavits}
              newAffidavitHref={isDraft ? null : newAffidavitHref(affidavitPrefill)}
              lineCountByRevision={
                new Map(
                  contract.revisions.map((revision) => [
                    revision.id,
                    (viewsByRevision.get(revision.id) ?? []).length,
                  ]),
                )
              }
            />
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
          <DetailSummary
            title="At a glance"
            items={[
              ["Underwriter", contract.underwriter.name],
              ["Contact", contract.underwriter.contact_name ?? "—"],
              ["Order", orderNumberLabel(contract.contract_identifier)],
              [
                "Runs",
                `${contract.effective_from}${contract.effective_to ? ` – ${contract.effective_to}` : " (open-ended)"}`,
              ],
              [
                "Sponsorship",
                `${contract.sponsorship_total != null ? `$${contract.sponsorship_total.toLocaleString()}` : "—"}${contract.stated_total_spots != null ? ` · ${contract.stated_total_spots} spots` : ""}`,
              ],
              ["Agreement", contract.agreement_document_path ? "Attached" : "Not attached"],
            ].map(([label = "", value]) => ({ label, value }))}
          />

          {!isDraft && expectedTotal > 0 && (
            <Card className="px-5 py-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Delivery
              </div>
              <ProgressBar
                label="Spots delivered on this contract"
                done={deliveredTotal}
                pending={scheduledTotal}
                total={expectedTotal}
                complete={contractStatus === "fulfilled"}
              />
              <p className="mt-2 text-[13px] text-ink-700">
                {deliveredTotal} aired · {scheduledTotal} scheduled of {expectedTotal}
              </p>
            </Card>
          )}

          {!isDraft && (
            <Card className="px-5 py-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Missed credits
              </div>
              {openExceptionCount === 0 ? (
                <p className="text-[13px] text-ink-700">
                  No missed credit is waiting on a decision.
                </p>
              ) : (
                <p className="text-[13px] text-ink-700">
                  {pluralize(openExceptionCount, "open exception")}.{" "}
                  <TextLink
                    href={`/underwriting/exceptions?q=${encodeURIComponent(contract.underwriter.name)}`}
                  >
                    Review
                  </TextLink>
                </p>
              )}
            </Card>
          )}

          <DetailSummary
            title="Traffic policy"
            editHref={`${base}?tab=agreement#traffic-policy`}
            editLabel="Agreement"
            items={[
              ["Affidavit", contract.affidavit_required ? "Required" : "Not required"],
              [
                "Makegoods",
                contract.makegood_requires_agency_approval
                  ? "Agency approval needed"
                  : "Station's discretion",
              ],
              ["Separation", separationSummary(contract)],
            ].map(([label = "", value]) => ({ label, value }))}
          />

          <Card className="px-5 py-4">
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
          </Card>

          {isDraft && (
            <DeleteContractControl
              contractId={contract.id}
              label={`${contract.underwriter.name} · ${orderNumberLabel(contract.contract_identifier)}`}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
