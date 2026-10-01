import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { Pagination } from "@/components/ui/pagination";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { pageInfo, parsePage } from "@/lib/pagination";
import { formatPlacementDateTime } from "@/lib/underwriting/placement";
import { shortDate } from "@/lib/underwriting/dates";
import {
  PLACEMENT_LIST_FILTERS,
  countPlacementsByFilter,
  filterPlacements,
  groupPlacementsByWeek,
  type PlacementListFilter,
} from "@/lib/underwriting/placement-list";
import type { PlacementWithOutcome, ScheduleLineDemandView } from "@/lib/underwriting/queries";
import { clearCreditAction } from "../../placement-actions";

const PAGE_SIZE = 25;

const EMPTY_MESSAGE: Record<PlacementListFilter, string> = {
  upcoming: "Nothing scheduled ahead. Auto-fill or place credits from a line under By line.",
  aired: "Nothing has aired under the current revision yet.",
  not_aired: "No credit under the current revision has been missed.",
};

/**
 * The Schedule tab's "By date" view: the current revision's placements in
 * air order, filtered by outcome, grouped into Monday-start weeks, and
 * paged. A "not aired" row links to the exception raised for it.
 */
export function PlacementsByDate({
  base,
  contractId,
  contractActive,
  placements,
  copyLabelById,
  exceptionIdByPlacement,
  filter,
  rawPage,
}: {
  base: string;
  contractId: string;
  contractActive: boolean;
  placements: { placement: PlacementWithOutcome; view: ScheduleLineDemandView }[];
  copyLabelById: Map<string, string>;
  exceptionIdByPlacement: Map<string, string>;
  filter: PlacementListFilter;
  rawPage: string | undefined;
}) {
  const counts = countPlacementsByFilter(placements.map(({ placement }) => placement));
  const filterHref = (value: PlacementListFilter) =>
    value === "upcoming" ? `${base}?view=date` : `${base}?view=date&show=${value}`;
  const shown = filterPlacements(
    placements.map((entry) => ({ ...entry, outcome: entry.placement.outcome })),
    filter,
  );
  const info0 = pageInfo(parsePage(rawPage), shown.length, PAGE_SIZE);
  // A bookmarked page past the end shows the last page rather than an empty list.
  const page = Math.min(info0.page, info0.pageCount);
  const info = pageInfo(page, shown.length, PAGE_SIZE);
  const pageItems = shown
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    .map((entry) => ({ ...entry, placementDate: entry.placement.placement_date }));
  const weeks = groupPlacementsByWeek(pageItems);

  return (
    <section aria-label="Placements by date" className="flex flex-col gap-3">
      <FilterChips
        label="Show placements"
        chips={PLACEMENT_LIST_FILTERS.map(({ value, label }) => ({
          label,
          href: filterHref(value),
          active: filter === value,
          count: counts[value],
        }))}
      />
      {shown.length === 0 ? (
        <p className="rounded border border-dashed border-line px-5 py-4 text-sm text-ink-500">
          {EMPTY_MESSAGE[filter]}
        </p>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Airs</Th>
                <Th>Program · break</Th>
                <Th>Line</Th>
                <Th>Copy</Th>
                <Th>Outcome</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </HeaderRow>
            </thead>
            <tbody>
              {weeks.map((week) => [
                <tr key={`week-${week.weekStart}`} className="border-b border-line bg-panel-50">
                  <td
                    colSpan={6}
                    data-stack="full"
                    className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-500"
                  >
                    Week of {shortDate(week.weekStart)}
                  </td>
                </tr>,
                ...week.items.map(({ placement, view }) => {
                  const exceptionId = exceptionIdByPlacement.get(placement.id);
                  const canClear =
                    placement.outcome === "pending" &&
                    view.scheduleLine.status === "active" &&
                    contractActive;
                  return (
                    <Row key={placement.id}>
                      <Cell stack="title" className="whitespace-nowrap font-semibold text-ink-900">
                        {formatPlacementDateTime(placement.scheduled_at)}
                      </Cell>
                      <Cell label="Program" className="text-ink-700">
                        {placement.program_name}
                        {placement.break_label ? ` · ${placement.break_label}` : ""}
                      </Cell>
                      <Cell label="Line" className="text-ink-500">
                        {view.scheduleLine.label || view.description}
                      </Cell>
                      <Cell label="Copy" className="text-ink-700">
                        {copyLabelById.get(placement.copy_id) ?? "—"}
                      </Cell>
                      <Cell stack="aside">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {placement.makegood_id && <Badge variant="warning">makegood</Badge>}
                          {placement.outcome === "not_aired" && exceptionId ? (
                            <Link
                              href={`/underwriting/exceptions/${exceptionId}`}
                              className="hover:underline"
                            >
                              <Badge variant="danger">not aired ›</Badge>
                            </Link>
                          ) : (
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
                          )}
                        </span>
                      </Cell>
                      <Cell stack="full" className="text-right">
                        {canClear && (
                          <form action={clearCreditAction}>
                            <input type="hidden" name="contract_id" value={contractId} />
                            <input type="hidden" name="placement_id" value={placement.id} />
                            <input type="hidden" name="return_to" value="placements" />
                            <Button type="submit" variant="ghost" className="py-0.5 text-xs">
                              Clear
                            </Button>
                          </form>
                        )}
                      </Cell>
                    </Row>
                  );
                }),
              ])}
            </tbody>
          </Table>
        </TableFrame>
      )}
      <Pagination
        info={info}
        path={base}
        params={{ view: "date", show: filter === "upcoming" ? null : filter }}
        noun="placements"
        className="mt-0"
      />
    </section>
  );
}
