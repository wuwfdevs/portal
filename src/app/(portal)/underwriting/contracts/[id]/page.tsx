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
  type ScheduleLineDemandView,
} from "@/lib/underwriting/queries";
import { formatPlacementTime, listProgramOptions } from "@/lib/underwriting/placement";
import { FULFILLMENT_STATUS_LABEL, type FulfillmentStatus } from "@/lib/underwriting/demand";
import { checkCompetitiveAdjacency } from "@/lib/underwriting/adjacency";
import {
  addScheduleLine,
  cancelFlight,
  cancelScheduleLine,
  createFlight,
  linkCopyToContract,
  setContractStatus,
  setCopyFlight,
  unlinkCopyFromContract,
  updateContractPolicy,
} from "../../contract-actions";
import { createCopy } from "../../copy-actions";
import { clearCreditAction, placeCreditAction } from "../../placement-actions";
import { autoFillContractAction, autoFillScheduleLineAction } from "../../auto-fill-actions";
import { ContractDocumentUpload } from "../../contract-document-upload";
import type { UwContractStatus, UwPlacementStatus } from "@/lib/database.types";

const CONTRACT_STATUS_VARIANT: Record<UwContractStatus, BadgeVariant> = {
  draft: "neutral",
  active: "success",
  expired: "muted",
  terminated: "danger",
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

function PeriodTable({ view }: { view: ScheduleLineDemandView }) {
  if (view.periods.length === 0) return <p className="text-xs text-ink-500">No demand periods.</p>;
  const label = (p: ScheduleLineDemandView["periods"][number]) =>
    p.kind === "day" ? p.periodStart : `Week of ${p.periodStart}`;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-ink-400">
            <th className="py-1 pr-3 font-semibold">Period</th>
            <th className="py-1 pr-3 font-semibold">Expected</th>
            <th className="py-1 pr-3 font-semibold">Scheduled</th>
            <th className="py-1 pr-3 font-semibold">Aired</th>
            <th className="py-1 pr-3 font-semibold">Missed</th>
            <th className="py-1 pr-3 font-semibold">Makegoods</th>
            <th className="py-1 pr-3 font-semibold">Still needed</th>
          </tr>
        </thead>
        <tbody>
          {view.periods.map((p) => (
            <tr
              key={p.periodStart}
              className={p.freshShortfall > 0 ? "text-ink-900" : "text-ink-500"}
            >
              <td className="py-1 pr-3 whitespace-nowrap">
                {label(p)}
                {p.partialWeek && <span className="ml-1 text-warning-fg">(partial)</span>}
              </td>
              <td className="py-1 pr-3">{p.quantity}</td>
              <td className="py-1 pr-3">{p.scheduled}</td>
              <td className="py-1 pr-3">{p.aired}</td>
              <td className="py-1 pr-3">{p.missed}</td>
              <td className="py-1 pr-3">
                {p.makegoodsAired > 0 && `${p.makegoodsAired} aired`}
                {p.makegoodsScheduled > 0 && ` ${p.makegoodsScheduled} scheduled`}
                {p.makegoodsAwaitingSlot > 0 && ` ${p.makegoodsAwaitingSlot} awaiting a slot`}
                {p.makegoodsAired + p.makegoodsScheduled + p.makegoodsAwaitingSlot === 0 && "—"}
              </td>
              <td className="py-1 pr-3 font-semibold">
                {p.freshShortfall > 0 ? p.freshShortfall : "—"}
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

  const [allCopy, programs, pools, lineContexts] = await Promise.all([
    listCopy(),
    listProgramOptions(),
    listInventoryPools(),
    listScheduleLinePlacementContexts(contract.scheduleLines),
  ]);
  const programNameById = new Map(programs.map((program) => [program.id, program.name]));
  const poolNameById = new Map(pools.map((pool) => [pool.id, pool.name]));
  const flightNameById = new Map(contract.flights.map((flight) => [flight.id, flight.name]));
  const views = await buildScheduleLineDemandViews(
    contract,
    contract.scheduleLines,
    contract.allocationsByLine,
    {
      poolNameById,
      programNameById,
    },
  );
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
  for (const line of contract.scheduleLines) {
    if (!line.program_id) continue;
    adjacencyByLine.set(
      line.id,
      await listNearbyPlacementsForAdjacency(line.program_id, contract.id),
    );
  }

  const activeViews = views.filter((view) => view.scheduleLine.status === "active");
  const expectedTotal = activeViews.reduce((sum, view) => sum + view.summary.expected, 0);
  const deliveredTotal = activeViews.reduce((sum, view) => sum + view.summary.delivered, 0);
  const scheduledTotal = activeViews.reduce((sum, view) => sum + view.summary.scheduled, 0);
  const contractStatus: FulfillmentStatus =
    activeViews.length === 0
      ? "no_target"
      : activeViews.some((view) => view.summary.status === "behind")
        ? "behind"
        : activeViews.every((view) => view.summary.status === "fulfilled")
          ? "fulfilled"
          : "on_track";
  const statedMismatch =
    contract.stated_total_spots != null && contract.stated_total_spots !== expectedTotal
      ? contract.stated_total_spots
      : null;
  const separationUndecided =
    Boolean(contract.separation_source_text) && contract.separation_policy === "unspecified";

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
            The order states {statedMismatch} spots in total, but the schedule lines as entered come
            to {expectedTotal}. Check the lines against the signed order — a partial week, a missed
            phase, or a typo in the order itself.
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

        {/* Schedule lines ------------------------------------------------------- */}
        <div className="rounded border border-line">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="text-sm font-bold text-ink-900">Schedule lines</div>
            {activeViews.length > 0 && contract.status === "active" && (
              <form action={autoFillContractAction}>
                <input type="hidden" name="contract_id" value={contract.id} />
                <Button type="submit" variant="secondary">
                  Auto-fill this contract
                </Button>
              </form>
            )}
          </div>
          {views.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">
              No schedule lines yet — enter the order&apos;s schedule below.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {views.map((view) => {
                const { scheduleLine, summary } = view;
                const placeable = placeableByLine.get(scheduleLine.id);
                const nearby = adjacencyByLine.get(scheduleLine.id) ?? [];
                const adjacency = checkCompetitiveAdjacency(
                  {
                    underwriterId: contract.underwriter.id,
                    category: contract.underwriter.category,
                  },
                  nearby,
                );
                const cancelled = scheduleLine.status === "cancelled";
                const flightCopy = contract.copy.filter((item) => {
                  const scope = flightByCopy.get(item.id) ?? null;
                  return scope === null || scope === scheduleLine.flight_id;
                });
                return (
                  <li
                    key={scheduleLine.id}
                    id={`line-${scheduleLine.id}`}
                    className={`flex flex-col gap-2 px-5 py-4 ${cancelled ? "opacity-60" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-ink-900">
                        {scheduleLine.label || view.description}
                      </span>
                      {scheduleLine.flight_id && (
                        <Badge variant="neutral">
                          {flightNameById.get(scheduleLine.flight_id) ?? "Flight"}
                        </Badge>
                      )}
                      {scheduleLine.is_bonus && <Badge variant="muted">bonus</Badge>}
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
                      {scheduleLine.stated_total != null &&
                        ` · order states ${scheduleLine.stated_total}`}
                      {` · expands to ${summary.expected}`}
                    </p>
                    {scheduleLine.source_text && (
                      <p className="text-xs italic text-ink-400">
                        &ldquo;{scheduleLine.source_text}&rdquo;
                      </p>
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
                        Demand by {view.periods[0]?.kind === "week" ? "week" : "date"} (
                        {view.periods.length})
                      </summary>
                      <div className="mt-2 rounded border border-dashed border-line p-2.5">
                        <PeriodTable view={view} />
                      </div>
                    </details>

                    {view.placements.length > 0 && (
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                          Placements ({view.placements.length})
                        </summary>
                        <ul className="mt-2 flex flex-col gap-1.5 rounded border border-dashed border-line p-2.5">
                          {view.placements.map((placement) => (
                            <li
                              key={placement.id}
                              className="flex flex-wrap items-center gap-2 text-xs"
                            >
                              <Badge variant={PLACEMENT_STATUS_VARIANT[placement.status]}>
                                {placement.outcome === "pending"
                                  ? placement.status
                                  : placement.outcome === "aired"
                                    ? "aired"
                                    : "not aired"}
                              </Badge>
                              {placement.makegood_id && <Badge variant="warning">makegood</Badge>}
                              <span className="text-ink-700">
                                {placement.program_name} —{" "}
                                {formatPlacementTime(placement.scheduled_at)}
                                {placement.break_label ? ` (${placement.break_label})` : ""}
                              </span>
                              <span className="text-ink-400">
                                for{" "}
                                {placement.demand_period_start === placement.demand_period_end
                                  ? placement.demand_period_start
                                  : `week of ${placement.demand_period_start}`}
                              </span>
                              {placement.override_reason && (
                                <span className="text-warning-fg">
                                  override: {placement.override_reason}
                                </span>
                              )}
                              {placement.outcome === "pending" && (
                                <form action={clearCreditAction}>
                                  <input type="hidden" name="contract_id" value={contract.id} />
                                  <input type="hidden" name="placement_id" value={placement.id} />
                                  <Button type="submit" variant="ghost">
                                    Clear
                                  </Button>
                                </form>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {!cancelled && flightCopy.length > 0 && contract.status === "active" && (
                      <form action={autoFillScheduleLineAction} className="mt-1">
                        <input type="hidden" name="contract_id" value={contract.id} />
                        <input type="hidden" name="schedule_line_id" value={scheduleLine.id} />
                        <Button type="submit" variant="secondary">
                          Auto-fill remaining
                        </Button>
                        <FieldHint>
                          Fills every open period to its quantity — makegoods first — spreading
                          credits across the eligible days, generating the Log rundowns it needs,
                          and never placing this underwriter twice in one break or next to the same
                          industry.
                        </FieldHint>
                      </form>
                    )}

                    {!cancelled && (
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
                            No eligible open break right now — a rundown must exist on an eligible
                            date, on a program this line&apos;s pool maps to, with a marked
                            opportunity inside the window.
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
                                Another underwriter in {contract.underwriter.category} already has a
                                placement on this program — consider spacing these out. Advisory
                                only, not a block.
                              </Alert>
                            )}
                            <div>
                              <Label htmlFor={`break_${scheduleLine.id}`}>Open break</Label>
                              <Select
                                id={`break_${scheduleLine.id}`}
                                name="break_id"
                                defaultValue=""
                              >
                                <option value="" disabled>
                                  Choose a break…
                                </option>
                                {placeable.breaks.map((brk) => (
                                  <option
                                    key={brk.break_id}
                                    value={brk.break_id}
                                    disabled={brk.holds_this_contract}
                                  >
                                    {brk.program_name} — {formatPlacementTime(brk.scheduled_at)} (
                                    {brk.label}) · {brk.remaining_seconds}s remaining
                                    {brk.holds_this_contract
                                      ? " · already holds this contract"
                                      : ""}
                                  </option>
                                ))}
                              </Select>
                              <FieldHint>
                                The database rejects a placement past the period&apos;s quantity or
                                the day cap, so an extra credit can&apos;t slip in unnoticed.
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
                                Only needed if the copy isn&apos;t approved or is outside its
                                effective dates — and only a manager&apos;s override is actually
                                honored.
                              </FieldHint>
                            </div>
                            <div className="flex justify-end">
                              <Button type="submit">Place credit</Button>
                            </div>
                          </form>
                        )}
                      </details>
                    )}

                    {!cancelled && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs font-semibold text-ink-500">
                          Cancel or revise this line
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
                              Demand on or after this date is void and scheduled credits on or after
                              it are cleared. Add a new line for the revised instruction.
                            </FieldHint>
                          </div>
                          <Button type="submit" variant="secondary">
                            Cancel line
                          </Button>
                        </form>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Add a line ------------------------------------------------------- */}
          <details className="border-t border-line px-5 py-4">
            <summary className="cursor-pointer text-xs font-semibold text-brand-link">
              Add a schedule line from the order
            </summary>
            <form action={addScheduleLine} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="contract_id" value={contract.id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="line_label">Label</Label>
                  <Input id="line_label" name="label" placeholder="AM drive" maxLength={120} />
                </div>
                <div>
                  <Label htmlFor="rule_kind">How the order sells it</Label>
                  <Select id="rule_kind" name="rule_kind" defaultValue="fixed_days">
                    <option value="fixed_days">Fixed days — N credits on each named day</option>
                    <option value="weekly_quota">
                      Weekly quota — N credits a week on any of the allowed days
                    </option>
                    <option value="explicit_dates">
                      Explicit dates — a list of dates and counts
                    </option>
                    <option value="week_grid">
                      Week grid — a quantity per week (agency order)
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
                    A named program narrows the pool; on its own it means any marked opportunity on
                    that program.
                  </FieldHint>
                </div>
              </div>
              <div>
                <Label>Day(s) of week</Label>
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
                  Fixed days: the days it airs. Weekly quota / grid: the days it may air. Explicit
                  dates: ignored.
                </FieldHint>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                  <Label htmlFor="quantity_per_week">Per week (quota)</Label>
                  <Input id="quantity_per_week" name="quantity_per_week" type="number" min={1} />
                </div>
                <div>
                  <Label htmlFor="max_per_day">Most per day (quota/grid)</Label>
                  <Input
                    id="max_per_day"
                    name="max_per_day"
                    type="number"
                    min={1}
                    placeholder="1"
                  />
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
                  <Label htmlFor="target_time">Target time</Label>
                  <Input id="target_time" name="target_time" type="time" />
                </div>
                <div>
                  <Label htmlFor="stated_total">Order states (spots)</Label>
                  <Input id="stated_total" name="stated_total" type="number" min={0} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <Label htmlFor="window_start">Window from</Label>
                  <Input id="window_start" name="window_start" type="time" />
                </div>
                <div>
                  <Label htmlFor="window_end">Window to</Label>
                  <Input id="window_end" name="window_end" type="time" />
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
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-700">
                  <input type="checkbox" name="is_bonus" className="h-4 w-4" />
                  Bonus line
                </label>
              </div>
              <div>
                <Label htmlFor="allocations_text">
                  Dates or weeks (explicit dates / week grid)
                </Label>
                <Textarea
                  id="allocations_text"
                  name="allocations_text"
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
                <Label htmlFor="line_notes">Notes</Label>
                <Input id="line_notes" name="notes" />
              </div>
              <div className="flex justify-end">
                <Button type="submit">Add schedule line</Button>
              </div>
            </form>
          </details>
        </div>

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
                Checked against the lines&apos; expansion above — never the scheduling target.
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
