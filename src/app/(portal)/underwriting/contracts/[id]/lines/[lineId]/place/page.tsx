import { servesLine } from "@/lib/underwriting/rotation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { stationTodayISO } from "@/lib/log/timezone";
import { checkCompetitiveAdjacency } from "@/lib/underwriting/adjacency";
import { buildPeriodRows } from "@/lib/underwriting/line-details";
import {
  formatPlacementDateTime,
  listPlaceableRundownBreaks,
  listProgramOptions,
  type PlaceableRundownBreak,
} from "@/lib/underwriting/placement";
import {
  buildScheduleLineDemandViews,
  getContractDetail,
  listInventoryPools,
  listNearbyPlacementsForAdjacency,
} from "@/lib/underwriting/queries";
import { suggestNextCopyForLine } from "@/lib/underwriting/rotation-rebalance";
import { placeCreditAction } from "../../../../../placement-actions";
import { BreakPicker, type BreakPickerGroup } from "./break-picker";
import { MessageChoice, type MessageOption } from "./message-choice";

/**
 * Place a credit by hand (docs/underwriting-traffic-redesign.md §11.7) —
 * its own page, mirroring `/lines/[lineId]/edit`, instead of a panel
 * folded into the contract page's line card. Open breaks are listed under
 * the period each would satisfy; `?week=<bucketId>` (from a period's
 * Place button) narrows the list to that period. The message defaults to
 * the rotation's pick. A failed submit lands back here with `?error=`
 * rendered inside the form; success returns to the contract page with
 * this line's periods open.
 */
export default async function PlaceCreditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; lineId: string }>;
  searchParams: Promise<{ error?: string; week?: string }>;
}) {
  const { id, lineId } = await params;
  const { error, week } = await searchParams;
  const contract = await getContractDetail(id);
  if (!contract) notFound();
  const line = contract.scheduleLines.find((candidate) => candidate.id === lineId);
  if (!line) notFound();

  const base = `/underwriting/contracts/${contract.id}`;
  const backHref = `${base}?details=${line.id}#line-${line.id}`;
  const schedulable =
    contract.status === "active" &&
    line.status === "active" &&
    line.revision_id === contract.currentRevision?.id;

  const linkByCopy = new Map(contract.copyLinks.map((link) => [link.copy_id, link]));
  const lineScopes = contract.copyLinks.map((link) => ({ lineId: link.schedule_line_id }));
  const lineCopy = contract.copy.filter((item) => {
    const link = linkByCopy.get(item.id);
    const flight = link?.flight_id ?? null;
    if (flight !== null && flight !== line.flight_id) return false;
    return servesLine({ lineId: link?.schedule_line_id ?? null }, line.id, lineScopes);
  });

  const [pools, programs, placeable, nearby, suggestedCopyId] = await Promise.all([
    listInventoryPools(),
    listProgramOptions(),
    schedulable ? listPlaceableRundownBreaks(line.id) : null,
    line.program_id ? listNearbyPlacementsForAdjacency(line.program_id, contract.id) : [],
    schedulable ? suggestNextCopyForLine(contract.id, line) : null,
  ]);
  const [view] = await buildScheduleLineDemandViews(contract, [line], contract.bucketsByLine, {
    poolNameById: new Map(pools.map((pool) => [pool.id, pool.name])),
    programNameById: new Map(programs.map((program) => [program.id, program.name])),
  });
  if (!view) notFound();
  const { summary } = view;
  const title = line.label || view.description;
  const adjacency = checkCompetitiveAdjacency(
    { underwriterId: contract.underwriter.id, categoryId: contract.underwriter.category_id },
    nearby,
  );

  const rows = buildPeriodRows(view.buckets, view.placements);
  const rowByBucket = new Map(rows.map((row) => [row.bucketId, row]));
  const weekRow = week ? (rowByBucket.get(week) ?? null) : null;
  const breaks = placeable?.ok ? placeable.breaks : [];
  const scoped = weekRow ? breaks.filter((brk) => brk.bucket_id === weekRow.bucketId) : breaks;

  const groups: BreakPickerGroup[] = [];
  const byBucket = new Map<string, PlaceableRundownBreak[]>();
  for (const brk of [...scoped].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))) {
    const list = byBucket.get(brk.bucket_id) ?? [];
    list.push(brk);
    byBucket.set(brk.bucket_id, list);
  }
  for (const [bucketId, list] of [...byBucket].sort(([a], [b]) => {
    const ra = rowByBucket.get(a);
    const rb = rowByBucket.get(b);
    return (ra?.periodStart ?? "").localeCompare(rb?.periodStart ?? "");
  })) {
    const row = rowByBucket.get(bucketId);
    groups.push({
      key: bucketId,
      label: row?.label ?? "Other dates",
      needed: row && row.needed > 0 ? `${row.needed} needed` : null,
      options: list.map((brk) => ({
        id: brk.break_id,
        when: formatPlacementDateTime(brk.scheduled_at),
        where: `${brk.program_name} · ${brk.label}`,
        room: `${brk.remaining_seconds}s open`,
        disabledReason: brk.holds_this_contract ? "Already holds this contract" : undefined,
      })),
    });
  }

  const today = stationTodayISO();
  const messageOptions: MessageOption[] = lineCopy.map((item) => ({
    id: item.id,
    label: item.label,
    approvalStatus: item.approval_status,
    usable:
      item.approval_status === "approved" &&
      item.effective_from <= today &&
      (item.effective_to === null || item.effective_to >= today),
  }));
  const suggested = messageOptions.find((option) => option.id === suggestedCopyId) ?? null;
  const stillNeeded = rows.filter((row) => row.needed > 0);

  return (
    <div>
      <Link href={backHref} className="text-xs font-semibold text-brand-link">
        ← Back to the contract
      </Link>
      <h2 className="mt-2 mb-1 font-serif text-xl font-bold text-ink-900">Place a credit</h2>
      <p className="mb-5 text-sm text-ink-700">
        <span className="font-semibold text-ink-900">{title}</span>
        {line.label ? ` · ${view.description}` : ""} · {line.duration_seconds}s
        {summary.expected > 0 && (
          <span className="text-ink-500">
            {" "}
            · {summary.freshShortfall} of {summary.expected} still needed
          </span>
        )}
      </p>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {!schedulable ? (
            <Alert>
              Credits are placed by hand only on an active line of an active contract&apos;s current
              revision. This line isn&apos;t one.
            </Alert>
          ) : lineCopy.length === 0 ? (
            <Alert variant="note">
              Create or link a message to this contract first —{" "}
              <Link href={`${base}?tab=copy`} className="font-semibold text-brand-link">
                the Copy tab
              </Link>
              .
            </Alert>
          ) : placeable && !placeable.ok ? (
            <Alert>{placeable.message}</Alert>
          ) : (
            <form
              action={placeCreditAction}
              className="flex flex-col gap-6 rounded border border-line bg-white p-5"
            >
              <input type="hidden" name="contract_id" value={contract.id} />
              <input type="hidden" name="schedule_line_id" value={line.id} />
              {weekRow && <input type="hidden" name="week" value={weekRow.bucketId} />}
              {error && <Alert>{error}</Alert>}

              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[15px] font-bold text-ink-900">Open break</h3>
                  <span className="text-xs text-ink-500">
                    {weekRow ? (
                      <>
                        Breaks in {weekRow.label.toLowerCase()} ·{" "}
                        <Link
                          href={`${base}/lines/${line.id}/place`}
                          className="font-semibold text-brand-link"
                        >
                          Show every date
                        </Link>
                      </>
                    ) : (
                      "Open breaks on dates this line still owes a credit"
                    )}
                  </span>
                </div>
                {adjacency.warning && (
                  <p className="text-xs text-ink-500">
                    Another underwriter in the same industry already has a credit on this program.
                    Advisory, not a block.
                  </p>
                )}
                {groups.length === 0 ? (
                  <p className="rounded border border-dashed border-line px-4 py-3 text-xs text-ink-500">
                    {weekRow
                      ? "No open break in this period right now. A rundown must exist on one of its dates, on a program this line's pool maps to, with a marked opportunity that satisfies the line's time rule."
                      : "No eligible open break right now. A rundown must exist on a date with open demand, on a program this line's pool maps to, with a marked opportunity that satisfies the line's time rule."}
                  </p>
                ) : (
                  <BreakPicker groups={groups} />
                )}
              </section>

              <section className="flex flex-col gap-3 border-t border-line pt-5">
                <h3 className="text-[15px] font-bold text-ink-900">Message</h3>
                <MessageChoice suggested={suggested} options={messageOptions} />
              </section>

              <div className="flex items-center justify-end gap-4">
                <Link href={backHref} className="text-[13px] font-semibold text-brand-link">
                  Cancel
                </Link>
                <Button type="submit" disabled={groups.length === 0}>
                  Place credit
                </Button>
              </div>
            </form>
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-72">
          <div className="rounded border border-line px-5 py-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
              This line
            </div>
            <ProgressBar
              label="Spots delivered on this line"
              done={summary.delivered}
              pending={summary.scheduled}
              total={summary.expected}
              complete={summary.status === "fulfilled"}
            />
            <p className="mt-2 text-[13px] text-ink-700">
              {summary.delivered} aired · {summary.scheduled} scheduled · {summary.freshShortfall}{" "}
              needed
            </p>
          </div>

          {stillNeeded.length > 0 && (
            <div className="rounded border border-line px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                  Still needed
                </span>
                <Link href={backHref} className="text-xs font-semibold text-brand-link">
                  All {rows.length} periods
                </Link>
              </div>
              <ul className="flex flex-col text-[13px]">
                {stillNeeded.slice(0, 6).map((row) => (
                  <li
                    key={row.bucketId}
                    className="flex items-center justify-between gap-3 border-b border-line py-1.5 last:border-b-0"
                  >
                    <Link
                      href={`${base}/lines/${line.id}/place?week=${row.bucketId}`}
                      className={
                        weekRow?.bucketId === row.bucketId
                          ? "font-bold text-ink-900"
                          : "text-ink-700 hover:text-brand-link"
                      }
                    >
                      {row.label}
                    </Link>
                    <span className="text-ink-500">
                      {row.needed} of {row.quantity}
                    </span>
                  </li>
                ))}
                {stillNeeded.length > 6 && (
                  <li className="pt-1.5 text-xs text-ink-500">
                    and {stillNeeded.length - 6} more period
                    {stillNeeded.length - 6 === 1 ? "" : "s"}
                  </li>
                )}
              </ul>
            </div>
          )}

          {lineCopy.length > 0 && (
            <div className="rounded border border-line px-5 py-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Rotation
              </div>
              <p className="mb-2 text-xs text-ink-500">
                One cycle across the whole contract, in broadcast order. Aired and pinned credits
                stay put; the rest re-sequence after any change.
              </p>
              <ol className="flex flex-col gap-1 pl-4 text-[13px] text-ink-700">
                {messageOptions.map((option) => (
                  <li
                    key={option.id}
                    className={option.id === suggested?.id ? "font-bold text-ink-900" : ""}
                  >
                    {option.label}
                    {option.id === suggested?.id && (
                      <span className="font-normal text-ink-500"> · next</span>
                    )}
                    {!option.usable && (
                      <span className="font-normal text-ink-500"> · {option.approvalStatus}</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
