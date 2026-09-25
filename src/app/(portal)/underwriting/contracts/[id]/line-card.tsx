import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { UwPlacementStatus } from "@/lib/database.types";
import { checkCompetitiveAdjacency } from "@/lib/underwriting/adjacency";
import { FULFILLMENT_STATUS_LABEL, type FulfillmentStatus } from "@/lib/underwriting/demand";
import { formatPlacementTime } from "@/lib/underwriting/placement";
import type {
  ContractDetail,
  ScheduleLineDemandView,
  ScheduleLinePlacementContext,
  listNearbyPlacementsForAdjacency,
} from "@/lib/underwriting/queries";
import { cancelScheduleLine, removeDraftScheduleLine } from "../../contract-actions";
import { clearCreditAction, placeCreditAction } from "../../placement-actions";
import { autoFillScheduleLineAction } from "../../auto-fill-actions";
import { LineActions, type LinePanel } from "./line-actions";

export const FULFILLMENT_VARIANT: Record<FulfillmentStatus, BadgeVariant> = {
  no_target: "neutral",
  on_track: "accent",
  behind: "danger",
  fulfilled: "success",
};

const PLACEMENT_STATUS_VARIANT: Record<UwPlacementStatus, BadgeVariant> = {
  scheduled: "success",
  locked: "accent",
  conflict: "danger",
  superseded: "muted",
};

export function BucketTable({ view }: { view: ScheduleLineDemandView }) {
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

/**
 * One schedule line on the contract page (the reviewed mockup): the
 * line's name and rule, a delivery bar, and a "⋮" menu holding the
 * less-frequent actions — manual placement, demand by period, placements,
 * cancel from a date, remove from draft. Auto-fill stays a visible button
 * because it is the normal path.
 */
export function LineCard({
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
  placeable: ScheduleLinePlacementContext["placeable"] | null;
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

  const panels: LinePanel[] = [];
  if (schedulable) {
    panels.push({
      key: "place",
      label: "Place a credit",
      content:
        flightCopy.length === 0 ? (
          <p className="text-xs text-ink-500">
            Create or link copy to this contract first — see the Copy tab.
          </p>
        ) : !placeable || !placeable.ok ? (
          <p className="text-xs text-danger">
            {placeable?.message ?? "Could not list eligible breaks."}
          </p>
        ) : placeable.breaks.length === 0 ? (
          <p className="text-xs text-ink-500">
            No eligible open break right now — a rundown must exist on a date with open demand, on a
            program this line&apos;s pool maps to, with a marked opportunity that satisfies the
            line&apos;s time rule.
          </p>
        ) : (
          <form action={placeCreditAction} className="flex flex-col gap-3">
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
                    {brk.rundown_status === "in_progress" || brk.rundown_status === "submitted"
                      ? " · live rundown"
                      : ""}
                  </option>
                ))}
              </Select>
              <FieldHint>
                The database rejects a placement past the bucket&apos;s quantity or the order&apos;s
                per-day cap, so an extra credit can&apos;t slip in unnoticed.
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
                Only needed if the copy isn&apos;t approved or is outside its effective dates — and
                only a manager&apos;s override is actually honored.
              </FieldHint>
            </div>
            <div className="flex justify-end">
              <Button type="submit">Place credit</Button>
            </div>
          </form>
        ),
    });
  }
  panels.push({
    key: "buckets",
    label: `Demand by period (${view.buckets.length})`,
    content: <BucketTable view={view} />,
  });
  if (view.placements.length > 0) {
    panels.push({
      key: "placements",
      label: `Placements (${view.placements.length})`,
      content: (
        <ul className="flex flex-col gap-1.5">
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
      ),
    });
  }
  if (schedulable) {
    panels.push({
      key: "cancel",
      label: "Cancel from a date",
      variant: "danger",
      content: (
        <form action={cancelScheduleLine} className="flex flex-wrap items-end gap-3">
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
              Demand still open on or after this date is cancelled and scheduled credits on or after
              it are cleared. For a revised order, prefer a revision: it keeps the old
              schedule&apos;s history in one place.
            </FieldHint>
          </div>
          <Button type="submit" variant="secondary">
            Cancel line
          </Button>
        </form>
      ),
    });
  }
  if (isDraft) {
    panels.push({
      key: "remove",
      label: "Remove from draft",
      variant: "danger",
      content: (
        <form action={removeDraftScheduleLine} className="flex items-center gap-3">
          <input type="hidden" name="contract_id" value={contract.id} />
          <input type="hidden" name="schedule_line_id" value={scheduleLine.id} />
          <span className="text-xs text-ink-700">Nothing has scheduled from a draft line.</span>
          <Button type="submit" variant="secondary">
            Remove
          </Button>
        </form>
      ),
    });
  }

  return (
    <li
      id={`line-${scheduleLine.id}`}
      className={`flex flex-wrap items-center gap-4 px-5 py-4 ${cancelled ? "opacity-60" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-ink-900">
            {scheduleLine.label || view.description}
          </span>
          <Badge variant={scheduleLine.service_level === "bonus" ? "muted" : "neutral"}>
            {scheduleLine.service_level === "bonus" ? "Bonus" : "Guaranteed"}
          </Badge>
          {scheduleLine.flight_id && (
            <Badge variant="neutral">
              {flightNameById.get(scheduleLine.flight_id) ?? "Flight"}
            </Badge>
          )}
          {(scheduleLine.time_mode === "opening" || scheduleLine.time_mode === "closing") && (
            <Badge variant="accent">{scheduleLine.time_mode} credit</Badge>
          )}
          {cancelled && (
            <Badge variant="danger">cancelled from {scheduleLine.cancelled_from}</Badge>
          )}
        </div>
        <p className="mt-0.5 text-[13px] text-ink-700">
          {view.description} · {scheduleLine.duration_seconds}s
        </p>
        <p className="mt-0.5 text-xs text-ink-500">
          {scheduleLine.start_date}
          {scheduleLine.end_date ? ` – ${scheduleLine.end_date}` : " (ongoing)"}
          {scheduleLine.stated_total != null &&
            ` · ${scheduleLine.stated_total} spots on the order`}
          {` · compiles to ${summary.expected}`}
        </p>
        {scheduleLine.source_text && (
          <p className="mt-0.5 text-xs italic text-ink-500">
            &ldquo;{scheduleLine.source_text}&rdquo;
          </p>
        )}
        {scheduleLine.makegood_policy_text && (
          <p className="mt-0.5 text-xs text-ink-500">
            Makegoods: {scheduleLine.makegood_policy_text}
          </p>
        )}
        {view.warnings.length > 0 && !cancelled && (
          <ul className="mt-2 flex flex-col gap-1">
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
      </div>

      <div className="w-full sm:w-52">
        <ProgressBar
          done={summary.delivered}
          pending={summary.scheduled}
          total={summary.expected}
          complete={summary.status === "fulfilled"}
        />
        <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-500">
          <span>
            {summary.expected > 0
              ? `${summary.delivered} aired · ${summary.scheduled} scheduled of ${summary.expected}`
              : "No demand"}
          </span>
          {!cancelled && (
            <Badge variant={FULFILLMENT_VARIANT[summary.status]}>
              {FULFILLMENT_STATUS_LABEL[summary.status]}
            </Badge>
          )}
        </div>
        {isDraft && (
          <p className="mt-1 text-xs text-ink-500">Schedules once the revision is activated.</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {schedulable && flightCopy.length > 0 && contract.status === "active" && (
          <form action={autoFillScheduleLineAction}>
            <input type="hidden" name="contract_id" value={contract.id} />
            <input type="hidden" name="schedule_line_id" value={scheduleLine.id} />
            <Button type="submit" variant="secondary" className="px-3 py-2 text-[13px]">
              Auto-fill remaining
            </Button>
          </form>
        )}
        <LineActions
          label={`More actions for ${scheduleLine.label || view.description}`}
          panels={panels}
        />
      </div>
    </li>
  );
}
