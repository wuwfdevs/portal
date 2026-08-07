import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { CONTENT_TYPE_LABEL, computeTotalDurationSeconds } from "@/lib/log/content-library";
import { getRundownDetail, listContentItems } from "@/lib/log/queries";
import { filterEligibleContent } from "@/lib/log/rundown-eligibility";
import { computeRundownSummary, computeSlotFit } from "@/lib/log/timing";
import { formatStationTimestamp } from "@/lib/log/timezone";
import { clearRundownItem, fillRundownItem } from "../../rundown-actions";
import type { LogRundownStatus } from "@/lib/database.types";

const STATUS_VARIANT: Record<LogRundownStatus, BadgeVariant> = {
  draft: "neutral",
  generated: "accent",
  in_progress: "warning",
  submitted: "success",
};

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

  const summary = computeRundownSummary(
    rundown.items.map((item) => ({
      content_item_id: item.content_item_id,
      requirement_level: item.requirement_level,
      planned_duration_seconds: item.planned_duration_seconds,
      slot_duration_seconds: item.slot.duration_seconds,
    })),
  );

  return (
    <div>
      <Link href="/log" className="text-xs font-semibold text-brand-link">
        ← Back to Today
      </Link>

      <div className="mt-2 mb-1 flex flex-wrap items-center gap-2.5">
        <h2 className="font-serif text-xl font-bold text-ink-900">{rundown.programName}</h2>
        <Badge variant={STATUS_VARIANT[rundown.status]}>{rundown.status.replace("_", " ")}</Badge>
      </div>
      <p className="mb-4 text-xs text-ink-500">
        {rundown.air_date} · {formatStationTimestamp(rundown.shift_start_at)} –{" "}
        {formatStationTimestamp(rundown.shift_end_at)}
      </p>

      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="mb-4 flex flex-wrap gap-2 text-xs text-ink-700">
        <Badge variant={summary.ready ? "success" : "warning"}>
          {summary.filledItems} of {summary.totalItems} local breaks filled
        </Badge>
        {summary.emptyRequiredItems > 0 && (
          <Badge variant="danger">{summary.emptyRequiredItems} still need something</Badge>
        )}
        {summary.overCount > 0 && (
          <Badge variant="danger">
            {summary.overCount} running over ({summary.totalOverSeconds}s total)
          </Badge>
        )}
      </div>

      {rundown.items.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          This clock has no local breaks — every slot is network-automatic, so there&apos;s nothing here
          for a host to fill.
        </div>
      ) : (
        <TableFrame>
          <Table>
            <thead>
              <HeaderRow>
                <Th>Time</Th>
                <Th>Slot</Th>
                <Th>Requirement</Th>
                <Th>Content</Th>
                <Th>Fit</Th>
                <Th>Action</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {rundown.items.map((item) => {
                const fit = computeSlotFit(
                  item.slot.duration_seconds,
                  item.content_item_id ? item.planned_duration_seconds : null,
                );
                const eligible = filterEligibleContent(
                  approvedContent,
                  item.slot,
                  rundown.program_id,
                  rundown.air_date,
                );

                return (
                  <Row key={item.id}>
                    <Cell className="whitespace-nowrap text-ink-700">
                      {formatStationTimestamp(item.scheduled_at)}
                    </Cell>
                    <Cell>
                      <div className="font-semibold text-ink-900">
                        {item.slot.label ?? "Local break"}
                        {item.slot.segment_label ? ` (${item.slot.segment_label})` : ""}
                      </div>
                      <div className="text-xs text-ink-400">{item.slot.duration_seconds}s available</div>
                    </Cell>
                    <Cell>
                      <Badge variant={item.requirement_level === "required" ? "warning" : "muted"}>
                        {item.requirement_level}
                      </Badge>
                    </Cell>
                    <Cell>
                      {item.contentItem ? (
                        <div>
                          <div className="font-semibold text-ink-900">{item.contentItem.title}</div>
                          <div className="text-xs text-ink-400">
                            {CONTENT_TYPE_LABEL[item.contentItem.content_type]} ·{" "}
                            {computeTotalDurationSeconds(
                              item.contentItem.components,
                              item.contentItem.expected_duration_seconds,
                            ) ?? "?"}
                            s
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-400">Empty</span>
                      )}
                    </Cell>
                    <Cell>
                      {item.content_item_id ? (
                        <Badge variant={fit.fits ? "success" : "danger"}>
                          {fit.fits ? `${fit.remainingSeconds}s to spare` : `${fit.overSeconds}s over`}
                        </Badge>
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </Cell>
                    <Cell>
                      <div className="flex flex-col gap-2">
                        <form action={fillRundownItem} className="flex items-center gap-1.5">
                          <input type="hidden" name="rundown_id" value={rundown.id} />
                          <input type="hidden" name="item_id" value={item.id} />
                          <Select
                            name="content_item_id"
                            className="max-w-[180px]"
                            defaultValue={item.content_item_id ?? ""}
                            disabled={eligible.length === 0}
                          >
                            <option value="" disabled>
                              {eligible.length === 0 ? "No eligible content" : "Choose content…"}
                            </option>
                            {eligible.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.title}
                              </option>
                            ))}
                          </Select>
                          <Button type="submit" variant="secondary">
                            {item.content_item_id ? "Replace" : "Fill"}
                          </Button>
                        </form>
                        {item.content_item_id && (
                          <form action={clearRundownItem}>
                            <input type="hidden" name="rundown_id" value={rundown.id} />
                            <input type="hidden" name="item_id" value={item.id} />
                            <input
                              type="hidden"
                              name="slot_duration_seconds"
                              value={item.slot.duration_seconds}
                            />
                            <Button type="submit" variant="ghost">
                              Clear
                            </Button>
                          </form>
                        )}
                      </div>
                    </Cell>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
