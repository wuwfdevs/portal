import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { CONTENT_TYPE_LABEL, computeTotalDurationSeconds } from "@/lib/log/content-library";
import {
  getRundownDetail,
  listContentItems,
  listLocalOpportunitiesForVersion,
  listUnderwritingCopyForItems,
  type RundownItemDetail,
} from "@/lib/log/queries";
import { filterEligibleContent } from "@/lib/log/rundown-eligibility";
import { buildRundownBreakDrafts, selectMissingBreakDrafts } from "@/lib/log/rundown-generation";
import { computeBreakFit, computeBreakStatus, computeRundownSummary } from "@/lib/log/timing";
import { formatStationTimestamp } from "@/lib/log/timezone";
import {
  addWeatherItem,
  createLiveReadItem,
  fillRundownItem,
  removeRundownItem,
  syncRundownBreaks,
  updateItemOverrides,
} from "../../rundown-actions";
import type { LogRundownStatus } from "@/lib/database.types";

const STATUS_VARIANT: Record<LogRundownStatus, BadgeVariant> = {
  draft: "neutral",
  generated: "accent",
  in_progress: "warning",
  submitted: "success",
};

const ITEM_KIND_LABEL: Record<string, string> = {
  content: "Content",
  live_read: "Live read",
  weather: "Weather",
  underwriting_credit: "Underwriting credit",
};

function itemDuration(item: RundownItemDetail): number {
  return item.planned_duration_seconds;
}

export default async function RundownDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const rundown = await getRundownDetail(id);
  if (!rundown) notFound();

  const approvedContent = await listContentItems({ approvalStatus: "approved" });
  const underwritingCopyIds = [
    ...new Set(
      rundown.breaks.flatMap((brk) => brk.items.flatMap((item) => (item.underwriting_copy_id ? [item.underwriting_copy_id] : []))),
    ),
  ];
  const underwritingCopy = await listUnderwritingCopyForItems(underwritingCopyIds);
  const copyById = new Map(underwritingCopy.map((copy) => [copy.id, copy]));

  // generateRundown() is idempotent on (program_id, air_date) — once this row
  // exists, re-generating just redirects here rather than re-running
  // generation. So a rundown created before a producer added an opportunity
  // (or, as happened once, before a migration seeded one) never picks it up
  // on its own. Compare the clock version's *current* opportunities against
  // what's already here so the page can tell "this clock genuinely has no
  // opportunities" apart from "this rundown is just out of sync" and offer
  // the fix for the latter — see syncRundownBreaks in rundown-actions.ts.
  const currentOpportunities = await listLocalOpportunitiesForVersion(rundown.clock_version_id);
  const shiftDurationMinutes = Math.round(
    (new Date(rundown.shift_end_at).getTime() - new Date(rundown.shift_start_at).getTime()) / 60_000,
  );
  const missingBreakCount = selectMissingBreakDrafts(
    buildRundownBreakDrafts(currentOpportunities, rundown.shift_start_at, shiftDurationMinutes),
    rundown.breaks,
  ).length;

  const summary = computeRundownSummary(
    rundown.breaks.map((brk) => ({
      requirement: brk.requirement,
      available_duration_seconds: brk.available_duration_seconds,
      occupied_duration_seconds: brk.items.reduce((total, item) => total + itemDuration(item), 0),
      item_count: brk.items.length,
    })),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/log" className="text-xs font-semibold text-brand-link">
        ← Back to Today
      </Link>

      <div className="mt-2 mb-1 flex flex-wrap items-center gap-2.5">
        <h2 className="font-serif text-xl font-bold text-ink-900">{rundown.programName}</h2>
        <Badge variant={STATUS_VARIANT[rundown.status]}>{rundown.status.replace("_", " ")}</Badge>
        <Link
          href={`/log/rundowns/${rundown.id}/console`}
          className="ml-auto text-xs font-semibold text-brand-link"
        >
          Open console →
        </Link>
      </div>
      <p className="mb-4 text-xs text-ink-500">
        {rundown.air_date} · {formatStationTimestamp(rundown.shift_start_at)} –{" "}
        {formatStationTimestamp(rundown.shift_end_at)}
      </p>

      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="mb-6 flex flex-wrap gap-2 text-xs text-ink-700">
        <Badge variant={summary.ready ? "success" : "warning"}>{summary.filledBreaks} filled</Badge>
        <Badge variant="muted">{summary.carryingNetworkBreaks} carrying network</Badge>
        {summary.unresolvedRequiredBreaks > 0 && (
          <Badge variant="danger">{summary.unresolvedRequiredBreaks} required, still needs something</Badge>
        )}
        {summary.overCount > 0 && (
          <Badge variant="danger">
            {summary.overCount} running over ({summary.totalOverSeconds}s total)
          </Badge>
        )}
      </div>

      {missingBreakCount > 0 && (
        <Alert variant="note" className="mb-4">
          This rundown was generated before {missingBreakCount === 1 ? "an opportunity" : "some opportunities"}{" "}
          {missingBreakCount === 1 ? "was" : "were"} added to this clock, so{" "}
          {missingBreakCount === 1 ? "it isn't" : "they aren't"} showing below.{" "}
          <form action={syncRundownBreaks} className="mt-2 inline-block">
            <input type="hidden" name="rundown_id" value={rundown.id} />
            <Button type="submit" className="px-2.5 py-1.5 text-xs">
              Sync {missingBreakCount === 1 ? "it" : "them"} in now
            </Button>
          </form>
        </Alert>
      )}

      {rundown.breaks.length === 0 ? (
        <div className="rounded border border-dashed border-line p-6 text-sm text-ink-500">
          This clock has no local opportunities defined yet — every bit of it is network-automatic, so
          there&apos;s nothing here for a host to fill. A producer can add opportunities from the clock
          template screen.
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {rundown.breaks.map((brk) => {
            const occupied = brk.items.reduce((total, item) => total + itemDuration(item), 0);
            const fit = computeBreakFit(brk.available_duration_seconds, occupied);
            const status = computeBreakStatus({ requirement: brk.requirement, item_count: brk.items.length, fit });
            const eligible = filterEligibleContent(approvedContent, brk, rundown.program_id, rundown.air_date);
            const canAddMore = brk.allow_multiple || brk.items.length === 0;

            const statusBadge =
              status === "carrying_network" ? (
                <Badge variant="muted">Carrying network</Badge>
              ) : status === "unresolved_required" ? (
                <Badge variant="danger">Needs something</Badge>
              ) : status === "over" ? (
                <Badge variant="danger">{fit.overSeconds}s over</Badge>
              ) : (
                <Badge variant="success">{fit.remainingSeconds}s to spare</Badge>
              );

            return (
              <li key={brk.id} className="rounded border border-line">
                <div className="flex flex-wrap items-center gap-2.5 border-b border-line bg-panel-50 px-5 py-3">
                  <span className="font-mono text-sm font-bold text-ink-900">
                    {formatStationTimestamp(brk.scheduled_at)}
                  </span>
                  <span className="text-sm font-semibold text-ink-900">{brk.label}</span>
                  <Badge variant={brk.requirement === "required" ? "warning" : "neutral"}>{brk.requirement}</Badge>
                  <span className="ml-auto text-xs text-ink-500">
                    Rejoin network by {formatStationTimestamp(brk.network_rejoin_at)} ·{" "}
                    {brk.available_duration_seconds}s available
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
                  {statusBadge}
                  {status === "carrying_network" && (
                    <span className="text-xs text-ink-400">
                      Nothing placed — the network feed simply continues. That&apos;s fine.
                    </span>
                  )}
                </div>

                {brk.items.length > 0 && (
                  <ul className="flex flex-col gap-3 px-5 py-4">
                    {brk.items.map((item) => {
                      const copy = item.underwriting_copy_id ? copyById.get(item.underwriting_copy_id) : null;
                      const effectiveScript = item.override_script ?? item.contentItem?.script ?? copy?.script ?? item.live_read_script;
                      const masterDuration = item.contentItem
                        ? computeTotalDurationSeconds(item.contentItem.components, item.contentItem.expected_duration_seconds)
                        : null;
                      const isOverridden =
                        item.override_duration_seconds !== null ||
                        item.override_script !== null ||
                        item.override_live_intro_seconds !== null ||
                        item.override_live_outro_seconds !== null ||
                        item.override_tag_seconds !== null;

                      return (
                        <li key={item.id} className="rounded border border-line/70 bg-panel-50/50 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="accent">{ITEM_KIND_LABEL[item.item_kind] ?? item.item_kind}</Badge>
                                {isOverridden && <Badge variant="warning">overridden for this airing</Badge>}
                                <span className="text-sm font-semibold text-ink-900">
                                  {item.contentItem?.title ?? item.live_read_title ?? copy?.label ?? "Weather"}
                                </span>
                              </div>
                              {item.contentItem && (
                                <div className="mt-0.5 text-xs text-ink-400">
                                  {CONTENT_TYPE_LABEL[item.contentItem.content_type]}
                                  {masterDuration !== null && ` · master ${masterDuration}s`}
                                </div>
                              )}
                              {copy && <div className="mt-0.5 text-xs text-ink-400">{copy.execution_kind === "recorded" ? `DAD cart ${copy.cart_identifier ?? "—"}` : "Live read"}</div>}
                              {effectiveScript && (
                                <p className="mt-1.5 whitespace-pre-wrap text-xs text-ink-700">{effectiveScript}</p>
                              )}
                            </div>
                            <span className="shrink-0 font-mono text-xs font-semibold text-ink-900">
                              {itemDuration(item)}s
                            </span>
                          </div>

                          {item.item_kind !== "underwriting_credit" && (
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                              <form action={removeRundownItem}>
                                <input type="hidden" name="rundown_id" value={rundown.id} />
                                <input type="hidden" name="item_id" value={item.id} />
                                <Button type="submit" variant="ghost" className="px-2.5 py-1.5 text-xs">
                                  Remove
                                </Button>
                              </form>
                              {(item.item_kind === "content" || item.item_kind === "weather") && (
                                <details>
                                  <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                                    Adjust for this airing
                                  </summary>
                                  <form action={updateItemOverrides} className="mt-2 flex flex-col gap-2">
                                    <input type="hidden" name="rundown_id" value={rundown.id} />
                                    <input type="hidden" name="item_id" value={item.id} />
                                    <Input
                                      name="override_script"
                                      placeholder="Script for this airing only"
                                      defaultValue={item.override_script ?? ""}
                                    />
                                    <div className="flex gap-2">
                                      <Input
                                        name="override_duration_seconds"
                                        type="number"
                                        min={1}
                                        placeholder="Duration (s)"
                                        defaultValue={item.override_duration_seconds ?? ""}
                                        className="w-32"
                                      />
                                      <Button type="submit" variant="secondary" className="px-2.5 py-1.5 text-xs">
                                        Save override
                                      </Button>
                                    </div>
                                  </form>
                                </details>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {canAddMore && (
                  <div className="flex flex-col gap-2 border-t border-line px-5 py-3">
                    <form action={fillRundownItem} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="rundown_id" value={rundown.id} />
                      <input type="hidden" name="break_id" value={brk.id} />
                      <Select name="content_item_id" className="max-w-[220px]" disabled={eligible.length === 0} defaultValue="">
                        <option value="" disabled>
                          {eligible.length === 0 ? "No eligible content" : "Add existing content…"}
                        </option>
                        {eligible.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.title}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variant="secondary" className="px-2.5 py-1.5 text-xs">
                        Add
                      </Button>
                    </form>
                    <div className="flex flex-wrap gap-3">
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                          Create a one-off live read
                        </summary>
                        <form action={createLiveReadItem} className="mt-2 flex flex-col gap-2">
                          <input type="hidden" name="rundown_id" value={rundown.id} />
                          <input type="hidden" name="break_id" value={brk.id} />
                          <div>
                            <Label htmlFor={`live-title-${brk.id}`}>Title</Label>
                            <Input id={`live-title-${brk.id}`} name="title" required maxLength={120} />
                          </div>
                          <div>
                            <Label htmlFor={`live-script-${brk.id}`}>Script</Label>
                            <Input id={`live-script-${brk.id}`} name="script" />
                          </div>
                          <div>
                            <Label htmlFor={`live-duration-${brk.id}`}>Duration (s)</Label>
                            <Input
                              id={`live-duration-${brk.id}`}
                              name="duration_seconds"
                              type="number"
                              required
                              min={1}
                              className="w-24"
                            />
                          </div>
                          <div>
                            <Button type="submit" variant="secondary" className="px-2.5 py-1.5 text-xs">
                              Add live read
                            </Button>
                          </div>
                        </form>
                      </details>
                      {brk.permitted_content_types.includes("weather") && (
                        <form action={addWeatherItem}>
                          <input type="hidden" name="rundown_id" value={rundown.id} />
                          <input type="hidden" name="break_id" value={brk.id} />
                          <input type="hidden" name="duration_seconds" value={20} />
                          <Button type="submit" variant="ghost" className="px-2.5 py-1.5 text-xs">
                            Add today&apos;s weather
                          </Button>
                        </form>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
