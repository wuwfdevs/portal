import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  buildScheduleLineDemandViews,
  getContractDetail,
  listCopy,
  listInventoryPools,
  listNearbyPlacementsForAdjacency,
  listScheduleLinePlacementContexts,
  type ContractDetail,
  type ScheduleLineDemandView,
  type UwContractRevisionRow,
} from "@/lib/underwriting/queries";
import { previewRevisionActivation } from "@/lib/underwriting/revisions";
import { formatPlacementTime, listProgramOptions } from "@/lib/underwriting/placement";
import { FULFILLMENT_STATUS_LABEL, type FulfillmentStatus } from "@/lib/underwriting/demand";
import { checkCompetitiveAdjacency } from "@/lib/underwriting/adjacency";
import {
  activateRevisionAction,
  addScheduleLine,
  cancelDraftRevision,
  cancelFlight,
  cancelScheduleLine,
  createFlight,
  createRevisionFromCurrent,
  linkCopyToContract,
  removeDraftScheduleLine,
  setContractStatus,
  setCopyFlight,
  unlinkCopyFromContract,
  updateContractPolicy,
} from "../../contract-actions";
import { createCopy } from "../../copy-actions";
import { clearCreditAction, placeCreditAction } from "../../placement-actions";
import { autoFillContractAction, autoFillScheduleLineAction } from "../../auto-fill-actions";
import { ContractDocumentUpload } from "../../contract-document-upload";
import type { UwContractStatus, UwPlacementStatus, UwRevisionStatus } from "@/lib/database.types";

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

const PLACEMENT_STATUS_VARIANT: Record<UwPlacementStatus, BadgeVariant> = {
  scheduled: "success",
  locked: "accent",
  conflict: "danger",
  superseded: "muted",
};

const FULFILLMENT_VARIANT: Record<FulfillmentStatus, BadgeVariant> = {
  no_target: "neutral",
  on_track: "accent",
  behind: "danger",
  fulfilled: "success",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function revisionName(revision: UwContractRevisionRow, index: number): string {
  return revision.revision_label ?? `Revision ${index + 1}`;
}

function BucketTable({ view }: { view: ScheduleLineDemandView }) {
  if (view.buckets.length === 0) return <p className="text-xs text-ink-500">No demand buckets.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-ink-400">
            <th className="py-1 pr-3 font-semibold">Period</th>
            <th className="py-1 pr-3 font-semibold">Owed</th>
            <th className="py-1 pr-3 font-semibold">Scheduled</th>
            <th className="py-1 pr-3 font-semibold">Aired</th>
            <th className="py-1 pr-3 font-semibold">Missed</th>
            <th className="py-1 pr-3 font-semibold">Makegoods</th>
            <th className="py-1 pr-3 font-semibold">Still needed</th>
          </tr>
        </thead>
        <tbody>
          {view.buckets.map((bucket) => (
            <tr
              key={bucket.bucketId}
              className={
                bucket.status !== "active"
                  ? "text-ink-400 line-through"
                  : bucket.freshShortfall > 0
                    ? "text-ink-900"
                    : "text-ink-500"
              }
            >
              <td className="py-1 pr-3 whitespace-nowrap">
                {bucket.sourceLabel}
                {bucket.status !== "active" && (
                  <span className="ml-1 no-underline">({bucket.status})</span>
                )}
              </td>
              <td className="py-1 pr-3">{bucket.quantity}</td>
              <td className="py-1 pr-3">{bucket.scheduled}</td>
              <td className="py-1 pr-3">{bucket.aired}</td>
              <td className="py-1 pr-3">{bucket.missed}</td>
              <td className="py-1 pr-3">
                {bucket.makegoodsAired > 0 && `${bucket.makegoodsAired} aired`}
                {bucket.makegoodsScheduled > 0 && ` ${bucket.makegoodsScheduled} scheduled`}
                {bucket.makegoodsAwaitingSlot > 0 &&
                  ` ${bucket.makegoodsAwaitingSlot} awaiting a slot`}
                {bucket.makegoodsAired +
                  bucket.makegoodsScheduled +
                  bucket.makegoodsAwaitingSlot ===
                  0 && "—"}
              </td>
              <td className="py-1 pr-3 font-semibold">
                {bucket.freshShortfall > 0 ? bucket.freshShortfall : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const contract = await getContractDetail(id);
  if (!contract) notFound();

  const currentLines = contract.scheduleLines.filter(
    (line) => line.revision_id === contract.currentRevision?.id,
  );
  const [allCopy, programs, pools, lineContexts, activation] = await Promise.all([
    listCopy(),
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

  const linkedCopyIds = new Set(contract.copy.map((item) => item.id));
  const linkableCopy = allCopy.filter((item) => !linkedCopyIds.has(item.id));
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
  const enterableRevisions = contract.revisions.filter(
    (revision) => revision.status === "current" || revision.status === "draft",
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Link href="/underwriting/contracts" className="text-xs font-semibold text-brand-link">
          ← Back to contracts
        </Link>
        <div className="mt-2 mb-1 flex flex-wrap items-center gap-2.5">
          <h2 className="font-serif text-xl font-bold text-ink-900">
            <Link
              href={`/underwriting/underwriters/${contract.underwriter.id}`}
              className="hover:underline"
            >
              {contract.underwriter.name}
            </Link>
          </h2>
          <Badge variant={CONTRACT_STATUS_VARIANT[contract.status]}>{contract.status}</Badge>
          <Badge variant={FULFILLMENT_VARIANT[contractStatus]}>
            {FULFILLMENT_STATUS_LABEL[contractStatus]}
            {expectedTotal > 0 &&
              ` · ${deliveredTotal} aired, ${scheduledTotal} scheduled of ${expectedTotal}`}
          </Badge>
        </div>
        <p className="mb-4 text-xs text-ink-500">
          {contract.contract_identifier} · {contract.effective_from}
          {contract.effective_to ? ` – ${contract.effective_to}` : ""}
          {contract.sponsorship_category ? ` · ${contract.sponsorship_category}` : ""}
          {contract.sponsorship_total != null
            ? ` · $${contract.sponsorship_total.toLocaleString()}`
            : ""}
          {" · "}
          Affidavit {contract.affidavit_required ? "required" : "not required"}
        </p>

        {error && <Alert className="mb-4">{error}</Alert>}
        {notice && (
          <Alert variant="info" className="mb-4">
            {notice}
          </Alert>
        )}
        {statedMismatch != null && (
          <Alert variant="note" className="mb-4">
            The order states {statedMismatch} spots in total, but the current revision&apos;s lines
            come to {expectedTotal}. Check the lines against the signed order — a partial week, a
            missed phase, or a typo in the order itself.
          </Alert>
        )}
        {separationUndecided && (
          <Alert variant="note" className="mb-4">
            The order states a separation rule (&ldquo;{contract.separation_source_text}&rdquo;)
            with no unit. Auto-fill won&apos;t schedule this contract until a policy is chosen in
            Traffic policy below.
          </Alert>
        )}
        {contract.notes && <p className="mb-4 text-sm text-ink-700">{contract.notes}</p>}

        <div className="mb-6 rounded border border-line p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">
            Executed agreement
          </div>
          <ContractDocumentUpload
            contractId={contract.id}
            existingPath={contract.agreement_document_path}
          />
        </div>

        {/* Revisions ----------------------------------------------------------- */}
        <div className="mb-6 rounded border border-line">
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
                {revision.notes && <span className="text-xs text-ink-500">{revision.notes}</span>}
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
                  {activation.bucketsToSupersede.length === 1 ? "" : "s"} of the current revision (
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
                  {activation.placementsKept === 1 ? "" : "s"} and every broadcast event stay with
                  the old revision.
                </li>
                {activation.makegoodsLeftOpen > 0 && (
                  <li>
                    Leave {activation.makegoodsLeftOpen} makegood
                    {activation.makegoodsLeftOpen === 1 ? "" : "s"} awaiting a slot open under the
                    old revision — resolve or cancel them on the Makegoods screen.
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
                  <Input id="revision_effective_from" name="effective_from" type="date" required />
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
                activated. Activation changes future demand only — aired credits, broadcast events
                and exceptions stay with the revision they happened under.
              </FieldHint>
            </details>
          )}
        </div>

        {/* Schedule lines ------------------------------------------------------- */}
        {[
          ...(contract.draftRevision ? [contract.draftRevision] : []),
          ...(contract.currentRevision ? [contract.currentRevision] : []),
          ...contract.revisions.filter(
            (revision) => revision.status === "superseded" || revision.status === "cancelled",
          ),
        ].map((revision) => {
          const revisionViews = viewsByRevision.get(revision.id) ?? [];
          const isCurrent = revision.status === "current";
          const isDraft = revision.status === "draft";
          const index = contract.revisions.findIndex((r) => r.id === revision.id);
          if (!isCurrent && !isDraft && revisionViews.length === 0) return null;
          return (
            <details
              key={revision.id}
              open={isCurrent || isDraft}
              className="mb-6 rounded border border-line"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                <span className="flex items-center gap-2 text-sm font-bold text-ink-900">
                  Schedule lines — {revisionName(revision, index)}
                  <Badge variant={REVISION_STATUS_VARIANT[revision.status]}>
                    {revision.status}
                  </Badge>
                </span>
                {isCurrent && currentViews.length > 0 && contract.status === "active" && (
                  <form action={autoFillContractAction}>
                    <input type="hidden" name="contract_id" value={contract.id} />
                    <Button type="submit" variant="secondary">
                      Auto-fill this contract
                    </Button>
                  </form>
                )}
              </summary>
              {revisionViews.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-500">
                  No schedule lines yet — enter the order&apos;s schedule below.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {revisionViews.map((view) => (
                    <ScheduleLineItem
                      key={view.scheduleLine.id}
                      view={view}
                      contract={contract}
                      isCurrent={isCurrent}
                      isDraft={isDraft}
                      flightNameById={flightNameById}
                      flightByCopy={flightByCopy}
                      placeable={placeableByLine.get(view.scheduleLine.id) ?? null}
                      nearby={adjacencyByLine.get(view.scheduleLine.id) ?? []}
                    />
                  ))}
                </ul>
              )}
            </details>
          );
        })}

        {/* Add a line ------------------------------------------------------- */}
        {enterableRevisions.length > 0 && (
          <div className="mb-6 rounded border border-line">
            <details className="px-5 py-4">
              <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                Add a schedule line from the order
              </summary>
              <form action={addScheduleLine} className="mt-4 flex flex-col gap-4">
                <input type="hidden" name="contract_id" value={contract.id} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="line_revision">Revision</Label>
                    <Select
                      id="line_revision"
                      name="revision_id"
                      defaultValue={
                        contract.draftRevision?.id ?? contract.currentRevision?.id ?? ""
                      }
                    >
                      {enterableRevisions.map((revision) => (
                        <option key={revision.id} value={revision.id}>
                          {revisionName(
                            revision,
                            contract.revisions.findIndex((r) => r.id === revision.id),
                          )}{" "}
                          ({revision.status})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="line_label">Label</Label>
                    <Input id="line_label" name="label" placeholder="AM drive" maxLength={120} />
                  </div>
                  <div>
                    <Label htmlFor="entry_kind">How the order sells it</Label>
                    <Select id="entry_kind" name="entry_kind" defaultValue="fixed_days">
                      <option value="fixed_days">Fixed days — N credits on each named day</option>
                      <option value="weekly_quota">Weekly quota — N credits a week</option>
                      <option value="monthly_quota">Monthly quota — N credits a month</option>
                      <option value="every_n_weeks">
                        Every N weeks — N credits in one week out of every N
                      </option>
                      <option value="explicit_dates">
                        Explicit dates — a list of dates and counts
                      </option>
                      <option value="week_grid">Week grid — a quantity per week (agency)</option>
                      <option value="range_total">
                        Range total — N credits over the whole run
                      </option>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="pool_id">Inventory pool</Label>
                    <Select id="pool_id" name="pool_id" defaultValue="">
                      <option value="">None — use the program alone</option>
                      {pools
                        .filter((pool) => pool.active)
                        .map((pool) => (
                          <option key={pool.id} value={pool.id}>
                            {pool.name}
                            {pool.targets.length === 0 ? " (no Log mapping yet)" : ""}
                          </option>
                        ))}
                    </Select>
                    <FieldHint>
                      The order&apos;s own name for the inventory — mapped to Log on the{" "}
                      <Link href="/underwriting/pools" className="font-semibold text-brand-link">
                        Pools
                      </Link>{" "}
                      screen.
                    </FieldHint>
                  </div>
                  <div>
                    <Label htmlFor="program_id">Program</Label>
                    <Select id="program_id" name="program_id" defaultValue="">
                      <option value="">Any program in the pool</option>
                      {programs.map((program) => (
                        <option key={program.id} value={program.id}>
                          {program.name}
                        </option>
                      ))}
                    </Select>
                    <FieldHint>
                      A named program narrows the pool; on its own it means any marked opportunity
                      on that program.
                    </FieldHint>
                  </div>
                </div>
                <div>
                  <Label>Eligible day(s) of week</Label>
                  <div className="mt-1 flex flex-wrap gap-3 text-sm text-ink-700">
                    {DAY_LABELS.map((label, index) => (
                      <label key={label} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          name="days_of_week"
                          value={index}
                          className="h-4 w-4"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <FieldHint>
                    Fixed days: the days it airs. Everything else: the days it may air — leave all
                    unchecked for any day.
                  </FieldHint>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div>
                    <Label htmlFor="count_per_day">Per day (fixed days)</Label>
                    <Input
                      id="count_per_day"
                      name="count_per_day"
                      type="number"
                      min={1}
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="quantity">Quantity (quota / cycle / total)</Label>
                    <Input id="quantity" name="quantity" type="number" min={1} />
                  </div>
                  <div>
                    <Label htmlFor="interval_weeks">Every N weeks</Label>
                    <Input
                      id="interval_weeks"
                      name="interval_weeks"
                      type="number"
                      min={2}
                      placeholder="2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="max_per_day">Most per day</Label>
                    <Input id="max_per_day" name="max_per_day" type="number" min={1} />
                    <FieldHint>Only if the order says so.</FieldHint>
                  </div>
                  <div>
                    <Label htmlFor="duration_seconds">Duration (s)</Label>
                    <Input
                      id="duration_seconds"
                      name="duration_seconds"
                      type="number"
                      required
                      min={1}
                      defaultValue={30}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <Label htmlFor="start_date">Start date</Label>
                    <Input id="start_date" name="start_date" type="date" required />
                  </div>
                  <div>
                    <Label htmlFor="end_date">End date</Label>
                    <Input id="end_date" name="end_date" type="date" />
                  </div>
                  <div>
                    <Label htmlFor="service_level">Service level</Label>
                    <Select id="service_level" name="service_level" defaultValue="guaranteed">
                      <option value="guaranteed">Guaranteed</option>
                      <option value="bonus">Bonus weight</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="stated_total">Order states (spots)</Label>
                    <Input id="stated_total" name="stated_total" type="number" min={0} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div>
                    <Label htmlFor="time_mode">Time rule</Label>
                    <Select id="time_mode" name="time_mode" defaultValue="any">
                      <option value="any">Any time the pool allows</option>
                      <option value="window">Inside a window</option>
                      <option value="preferred">Around a preferred time</option>
                      <option value="exact">At an exact time</option>
                      <option value="opening">The program&apos;s opening credit</option>
                      <option value="closing">The program&apos;s closing credit</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="window_start">Window from</Label>
                    <Input id="window_start" name="window_start" type="time" />
                  </div>
                  <div>
                    <Label htmlFor="window_end">Window to</Label>
                    <Input id="window_end" name="window_end" type="time" />
                  </div>
                  <div>
                    <Label htmlFor="preferred_time">Preferred / exact time</Label>
                    <Input id="preferred_time" name="preferred_time" type="time" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="flight_id">Flight</Label>
                  <Select id="flight_id" name="flight_id" defaultValue="">
                    <option value="">Whole contract</option>
                    {contract.flights
                      .filter((flight) => flight.status === "active")
                      .map((flight) => (
                        <option key={flight.id} value={flight.id}>
                          {flight.name}
                        </option>
                      ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="dates_text">Dates or weeks (explicit dates / week grid)</Label>
                  <Textarea
                    id="dates_text"
                    name="dates_text"
                    rows={3}
                    placeholder={
                      "Explicit dates: 2026-09-11, 2026-09-24 x2\nWeek grid: 2026-01-26 6 (one week per line)"
                    }
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="grid_first_monday">Grid: first Monday</Label>
                    <Input id="grid_first_monday" name="grid_first_monday" type="date" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="grid_quantities">Grid: weekly quantities, in order</Label>
                    <Input
                      id="grid_quantities"
                      name="grid_quantities"
                      placeholder="6 4 4 4 3 2 2 2 0 3 …"
                    />
                    <FieldHint>
                      Zeros are real weeks with no credits, exactly as the agency grid prints them.
                    </FieldHint>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="source_text">The order&apos;s own wording</Label>
                    <Input
                      id="source_text"
                      name="source_text"
                      placeholder="52 spots in Carpool Tuesday @ 8:19 AM"
                    />
                    <FieldHint>Kept verbatim for nuance; never interpreted as a rule.</FieldHint>
                  </div>
                  <div>
                    <Label htmlFor="makegood_policy_text">
                      Makegood policy, as the order states
                    </Label>
                    <Input
                      id="makegood_policy_text"
                      name="makegood_policy_text"
                      placeholder="Rescheduled within the program originally sponsored"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="line_notes">Notes</Label>
                  <Input id="line_notes" name="notes" />
                </div>
                <div className="flex justify-end">
                  <Button type="submit">Add schedule line</Button>
                </div>
              </form>
            </details>
          </div>
        )}

        {/* Flights ------------------------------------------------------------- */}
        <div className="mt-6 rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Flights
          </div>
          {contract.flights.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">
              No flights — add one for each concert, production, or event the order groups its dates
              and copy under.
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
        </div>

        {/* Copy ---------------------------------------------------------------- */}
        <div className="mt-6 rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Copy
          </div>
          {contract.copy.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">
              No copy yet — create the first message below.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {contract.copy.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                >
                  <Link
                    href={`/underwriting/copy/${item.id}`}
                    className="font-semibold text-brand-link"
                  >
                    {item.label}
                  </Link>
                  <span className="text-xs text-ink-400">
                    {item.execution_kind} · {item.approval_status}
                    {item.duration_seconds != null && ` · ${item.duration_seconds}s`}
                  </span>
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
          <details className="border-t border-line px-5 py-4">
            <summary className="cursor-pointer text-xs font-semibold text-brand-link">
              Create a new message for this contract
            </summary>
            <form action={createCopy} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="contract_id" value={contract.id} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="label">Label</Label>
                  <Input id="label" name="label" required maxLength={80} placeholder="Message A" />
                </div>
                <div>
                  <Label htmlFor="execution_kind">Execution</Label>
                  <Select id="execution_kind" name="execution_kind" defaultValue="live_read">
                    <option value="live_read">Live read</option>
                    <option value="recorded">Recorded (via DAD)</option>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="script">Script</Label>
                <Textarea id="script" name="script" rows={3} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="duration_seconds_copy">Duration (s)</Label>
                  <Input id="duration_seconds_copy" name="duration_seconds" type="number" min={1} />
                </div>
                <div>
                  <Label htmlFor="cart_identifier">DAD cart #</Label>
                  <Input id="cart_identifier" name="cart_identifier" />
                </div>
                <div>
                  <Label htmlFor="effective_from_copy">Effective from</Label>
                  <Input id="effective_from_copy" name="effective_from" type="date" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit">Create and link</Button>
              </div>
            </form>
          </details>
          {linkableCopy.length > 0 && (
            <form
              action={linkCopyToContract}
              className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4"
            >
              <input type="hidden" name="contract_id" value={contract.id} />
              <Select name="copy_id" defaultValue="" className="max-w-[220px]">
                <option value="" disabled>
                  Or link existing copy…
                </option>
                {linkableCopy.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
              {contract.flights.length > 0 && (
                <Select name="flight_id" defaultValue="" className="max-w-[200px]">
                  <option value="">Whole contract</option>
                  {contract.flights.map((flight) => (
                    <option key={flight.id} value={flight.id}>
                      {flight.name}
                    </option>
                  ))}
                </Select>
              )}
              <Button type="submit" variant="secondary">
                Link
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-6 lg:w-80">
        <div className="rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Status
          </div>
          <form action={setContractStatus} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="contract_id" value={contract.id} />
            <Select name="status" defaultValue={contract.status}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="terminated">Terminated</option>
            </Select>
            <Button type="submit">Update status</Button>
          </form>
        </div>

        <div className="rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Traffic policy
          </div>
          <form action={updateContractPolicy} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="contract_id" value={contract.id} />
            <div>
              <Label htmlFor="stated_total_spots">Order states (total spots)</Label>
              <Input
                id="stated_total_spots"
                name="stated_total_spots"
                type="number"
                min={0}
                defaultValue={contract.stated_total_spots ?? ""}
              />
              <FieldHint>
                Checked against the current revision&apos;s lines above — never the scheduling
                target.
              </FieldHint>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                name="makegood_requires_agency_approval"
                className="h-4 w-4"
                defaultChecked={contract.makegood_requires_agency_approval}
              />
              Makegoods need agency approval
            </label>
            <div>
              <Label htmlFor="preemption_policy">Preemption / makegood policy</Label>
              <Input
                id="preemption_policy"
                name="preemption_policy"
                defaultValue={contract.preemption_policy ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="separation_source_text">Separation, as the order prints it</Label>
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
            <Button type="submit" variant="secondary">
              Save policy
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ScheduleLineItem({
  view,
  contract,
  isCurrent,
  isDraft,
  flightNameById,
  flightByCopy,
  placeable,
  nearby,
}: {
  view: ScheduleLineDemandView;
  contract: ContractDetail;
  isCurrent: boolean;
  isDraft: boolean;
  flightNameById: Map<string, string>;
  flightByCopy: Map<string, string | null>;
  placeable:
    Awaited<ReturnType<typeof listScheduleLinePlacementContexts>>[number]["placeable"] | null;
  nearby: Awaited<ReturnType<typeof listNearbyPlacementsForAdjacency>>;
}) {
  const { scheduleLine, summary } = view;
  const adjacency = checkCompetitiveAdjacency(
    { underwriterId: contract.underwriter.id, categoryId: contract.underwriter.category_id },
    nearby,
  );
  const cancelled = scheduleLine.status === "cancelled";
  const schedulable = isCurrent && !cancelled;
  const flightCopy = contract.copy.filter((item) => {
    const scope = flightByCopy.get(item.id) ?? null;
    return scope === null || scope === scheduleLine.flight_id;
  });
  return (
    <li
      id={`line-${scheduleLine.id}`}
      className={`flex flex-col gap-2 px-5 py-4 ${cancelled ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-ink-900">{scheduleLine.label || view.description}</span>
        {scheduleLine.flight_id && (
          <Badge variant="neutral">{flightNameById.get(scheduleLine.flight_id) ?? "Flight"}</Badge>
        )}
        {scheduleLine.service_level === "bonus" && <Badge variant="muted">bonus</Badge>}
        {(scheduleLine.time_mode === "opening" || scheduleLine.time_mode === "closing") && (
          <Badge variant="accent">{scheduleLine.time_mode} credit</Badge>
        )}
        {cancelled ? (
          <Badge variant="danger">cancelled from {scheduleLine.cancelled_from}</Badge>
        ) : (
          <Badge variant={FULFILLMENT_VARIANT[summary.status]}>
            {FULFILLMENT_STATUS_LABEL[summary.status]}
            {summary.expected > 0 && ` · ${summary.delivered}/${summary.expected}`}
          </Badge>
        )}
      </div>
      <p className="text-xs text-ink-700">{view.description}</p>
      <p className="text-xs text-ink-400">
        {scheduleLine.start_date}
        {scheduleLine.end_date ? ` – ${scheduleLine.end_date}` : " (ongoing)"} ·{" "}
        {scheduleLine.duration_seconds}s
        {scheduleLine.stated_total != null && ` · order states ${scheduleLine.stated_total}`}
        {` · compiles to ${summary.expected}`}
      </p>
      {scheduleLine.source_text && (
        <p className="text-xs italic text-ink-400">&ldquo;{scheduleLine.source_text}&rdquo;</p>
      )}
      {scheduleLine.makegood_policy_text && (
        <p className="text-xs text-ink-400">Makegoods: {scheduleLine.makegood_policy_text}</p>
      )}
      {view.warnings.length > 0 && !cancelled && (
        <ul className="flex flex-col gap-1">
          {view.warnings.map((warning) => (
            <li
              key={warning.code}
              className="rounded border border-warning-fg/30 bg-warning-fg/[0.06] px-2.5 py-1.5 text-xs text-ink-700"
            >
              {warning.message}
            </li>
          ))}
        </ul>
      )}

      <details className="mt-1">
        <summary className="cursor-pointer text-xs font-semibold text-brand-link">
          Demand buckets ({view.buckets.length})
        </summary>
        <div className="mt-2 rounded border border-dashed border-line p-2.5">
          <BucketTable view={view} />
        </div>
      </details>

      {view.placements.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-brand-link">
            Placements ({view.placements.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5 rounded border border-dashed border-line p-2.5">
            {view.placements.map((placement) => {
              const bucket = view.buckets.find((b) => b.bucketId === placement.demand_bucket_id);
              return (
                <li key={placement.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant={PLACEMENT_STATUS_VARIANT[placement.status]}>
                    {placement.outcome === "pending"
                      ? placement.status
                      : placement.outcome === "aired"
                        ? "aired"
                        : "not aired"}
                  </Badge>
                  {placement.makegood_id && <Badge variant="warning">makegood</Badge>}
                  <span className="text-ink-700">
                    {placement.program_name} — {formatPlacementTime(placement.scheduled_at)}
                    {placement.break_label ? ` (${placement.break_label})` : ""}
                  </span>
                  <span className="text-ink-400">for {bucket?.sourceLabel ?? "its bucket"}</span>
                  {placement.override_reason && (
                    <span className="text-warning-fg">override: {placement.override_reason}</span>
                  )}
                  {placement.outcome === "pending" && schedulable && (
                    <form action={clearCreditAction}>
                      <input type="hidden" name="contract_id" value={contract.id} />
                      <input type="hidden" name="placement_id" value={placement.id} />
                      <Button type="submit" variant="ghost">
                        Clear
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {schedulable && flightCopy.length > 0 && contract.status === "active" && (
        <form action={autoFillScheduleLineAction} className="mt-1">
          <input type="hidden" name="contract_id" value={contract.id} />
          <input type="hidden" name="schedule_line_id" value={scheduleLine.id} />
          <Button type="submit" variant="secondary">
            Auto-fill remaining
          </Button>
          <FieldHint>
            Fills every open bucket to its quantity — makegoods first — spreading credits across the
            eligible days, generating the Log rundowns it needs, and never placing this underwriter
            twice in one break or next to the same industry.
          </FieldHint>
        </form>
      )}

      {schedulable && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs font-semibold text-brand-link">
            Place a credit manually
          </summary>
          {flightCopy.length === 0 ? (
            <p className="mt-2 text-xs text-ink-500">
              Create or link copy to this contract first — see &quot;Copy&quot; below.
            </p>
          ) : !placeable || !placeable.ok ? (
            <p className="mt-2 text-xs text-danger">
              {placeable?.message ?? "Could not list eligible breaks."}
            </p>
          ) : placeable.breaks.length === 0 ? (
            <p className="mt-2 text-xs text-ink-500">
              No eligible open break right now — a rundown must exist on a date with open demand, on
              a program this line&apos;s pool maps to, with a marked opportunity that satisfies the
              line&apos;s time rule.
            </p>
          ) : (
            <form
              action={placeCreditAction}
              className="mt-2 flex flex-col gap-3 rounded border border-line p-3"
            >
              <input type="hidden" name="contract_id" value={contract.id} />
              <input type="hidden" name="schedule_line_id" value={scheduleLine.id} />
              {adjacency.warning && (
                <Alert variant="note">
                  Another underwriter in the same industry already has a placement on this program —
                  consider spacing these out. Advisory only, not a block.
                </Alert>
              )}
              <div>
                <Label htmlFor={`break_${scheduleLine.id}`}>Open break</Label>
                <Select id={`break_${scheduleLine.id}`} name="break_id" defaultValue="">
                  <option value="" disabled>
                    Choose a break…
                  </option>
                  {placeable.breaks.map((brk) => (
                    <option
                      key={brk.break_id}
                      value={brk.break_id}
                      disabled={brk.holds_this_contract}
                    >
                      {brk.program_name} — {formatPlacementTime(brk.scheduled_at)} ({brk.label}) ·{" "}
                      {brk.remaining_seconds}s remaining
                      {brk.holds_this_contract ? " · already holds this contract" : ""}
                    </option>
                  ))}
                </Select>
                <FieldHint>
                  The database rejects a placement past the bucket&apos;s quantity or the
                  order&apos;s per-day cap, so an extra credit can&apos;t slip in unnoticed.
                </FieldHint>
              </div>
              <div>
                <Label htmlFor={`copy_${scheduleLine.id}`}>Copy</Label>
                <Select id={`copy_${scheduleLine.id}`} name="copy_id" defaultValue="">
                  <option value="" disabled>
                    Choose copy…
                  </option>
                  {flightCopy.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} ({item.approval_status})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor={`override_${scheduleLine.id}`}>Override reason</Label>
                <Input id={`override_${scheduleLine.id}`} name="override_reason" />
                <FieldHint>
                  Only needed if the copy isn&apos;t approved or is outside its effective dates —
                  and only a manager&apos;s override is actually honored.
                </FieldHint>
              </div>
              <div className="flex justify-end">
                <Button type="submit">Place credit</Button>
              </div>
            </form>
          )}
        </details>
      )}

      {schedulable && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs font-semibold text-ink-500">
            Cancel this line
          </summary>
          <form
            action={cancelScheduleLine}
            className="mt-2 flex flex-wrap items-end gap-3 rounded border border-line p-3"
          >
            <input type="hidden" name="contract_id" value={contract.id} />
            <input type="hidden" name="schedule_line_id" value={scheduleLine.id} />
            <div>
              <Label htmlFor={`cancel_from_${scheduleLine.id}`}>Cancel from</Label>
              <Input
                id={`cancel_from_${scheduleLine.id}`}
                name="cancelled_from"
                type="date"
                defaultValue={scheduleLine.start_date}
              />
              <FieldHint>
                Demand still open on or after this date is cancelled and scheduled credits on or
                after it are cleared. For a revised order, prefer a revision: it keeps the old
                schedule&apos;s history in one place.
              </FieldHint>
            </div>
            <Button type="submit" variant="secondary">
              Cancel line
            </Button>
          </form>
        </details>
      )}

      {isDraft && (
        <form action={removeDraftScheduleLine} className="mt-1">
          <input type="hidden" name="contract_id" value={contract.id} />
          <input type="hidden" name="schedule_line_id" value={scheduleLine.id} />
          <Button type="submit" variant="ghost">
            Remove from draft
          </Button>
        </form>
      )}
    </li>
  );
}
