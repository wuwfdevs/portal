import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { ClockThumb } from "@/components/log/clock-thumb";
import { requireLogAccess } from "@/lib/log/access";
import { pageHref, pageInfo, pageRange, parsePage } from "@/lib/pagination";
import {
  deriveProgramStatus,
  formatDateShort,
  formatDaysOfWeek,
  formatDurationMinutes,
  isPlaceholderClockName,
  STATUS_LABEL,
  type ProgramScheduleStatus,
} from "@/lib/log/program-status";
import { formatAirTime } from "@/lib/log/schedule";
import { stationTodayISO } from "@/lib/log/timezone";
import {
  listClockSummaries,
  listClockTemplates,
  listPrograms,
  listScheduleEntries,
} from "@/lib/log/queries";
import { createProgram } from "../program-actions";

const PROGRAMS_PATH = "/log/programs";

const STATUS_PARAM: Record<string, ProgramScheduleStatus> = {
  ready: "on_real_clock",
  "needs-clock": "needs_clock",
  unscheduled: "not_scheduled",
};

const STATUS_VARIANT = {
  on_real_clock: "success",
  needs_clock: "warning",
  not_scheduled: "neutral",
} as const;

/**
 * The programs list (docs/ui-patterns.md) — Log's one entry point for
 * scheduling and clocks, since nobody starts from a clock: each row shows the
 * program's air time and days, the clock it runs on (a thumbnail and a link
 * to that clock), and a status, so the programs still on the shared
 * placeholder clock are one filter away. Search, status chips and page
 * numbers are query-string state (`?q=`, `?status=`, `?page=`); a program is
 * three fields, so it is created inline (`?new=1`). The list is filtered in
 * application code because status is derived from the schedule, not stored.
 */
export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    new?: string;
    error?: string;
    status?: string;
    page?: string;
    unusedClocks?: string;
  }>;
}) {
  const { q, new: newParam, error, status, page: pageParam, unusedClocks } = await searchParams;
  const { isProducer } = await requireLogAccess();
  const creating = isProducer && newParam === "1";
  const query = (q ?? "").trim().toLowerCase();
  const statusFilter = status ? (STATUS_PARAM[status] ?? null) : null;
  const today = stationTodayISO();

  const [programs, scheduleEntries, templates, summaries] = await Promise.all([
    listPrograms(),
    listScheduleEntries(),
    listClockTemplates(),
    listClockSummaries(today),
  ]);

  const entriesByProgram = new Map<string, typeof scheduleEntries>();
  const programIdsByTemplate = new Map<string, Set<string>>();
  for (const entry of scheduleEntries) {
    const existing = entriesByProgram.get(entry.program_id);
    if (existing) existing.push(entry);
    else entriesByProgram.set(entry.program_id, [entry]);
    const programIds = programIdsByTemplate.get(entry.clock_template_id);
    if (programIds) programIds.add(entry.program_id);
    else programIdsByTemplate.set(entry.clock_template_id, new Set([entry.program_id]));
  }

  const rows = programs
    .filter((program) => query === "" || program.name.toLowerCase().includes(query))
    .map((program) => {
      const entries = entriesByProgram.get(program.id) ?? [];
      const live = entries
        .filter((entry) => entry.end_date === null || entry.end_date >= today)
        .sort((a, b) => a.air_time.localeCompare(b.air_time));
      return { program, live, status: deriveProgramStatus(entries, today) };
    });

  const counts: Record<ProgramScheduleStatus, number> = {
    on_real_clock: 0,
    needs_clock: 0,
    not_scheduled: 0,
  };
  for (const row of rows) counts[row.status] += 1;

  const shown = statusFilter ? rows.filter((row) => row.status === statusFilter) : rows;
  const info = pageInfo(parsePage(pageParam), shown.length);
  const { from, to } = pageRange(info.page);
  const pageRows = shown.slice(from, to + 1);

  const usedTemplateIds = new Set(scheduleEntries.map((entry) => entry.clock_template_id));
  const unused = templates.filter((template) => !usedTemplateIds.has(template.id));

  const chipHref = (value: string | null) => pageHref(PROGRAMS_PATH, { q, status: value }, 1);
  const chips = [
    { label: "All", href: chipHref(null), active: statusFilter === null, count: rows.length },
    {
      label: STATUS_LABEL.on_real_clock,
      href: chipHref("ready"),
      active: statusFilter === "on_real_clock",
      count: counts.on_real_clock,
    },
    {
      label: STATUS_LABEL.needs_clock,
      href: chipHref("needs-clock"),
      active: statusFilter === "needs_clock",
      count: counts.needs_clock,
    },
    {
      label: STATUS_LABEL.not_scheduled,
      href: chipHref("unscheduled"),
      active: statusFilter === "not_scheduled",
      count: counts.not_scheduled,
    },
  ];
  const listParams = { q, status };

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={{
          placeholder: "Search programs",
          label: "Search programs",
          defaultValue: q,
          hidden: status ? { status } : undefined,
        }}
        chips={chips}
        chipsLabel="Filter by status"
      >
        {isProducer && !creating && (
          <PrimaryLink href={`${PROGRAMS_PATH}?new=1`}>+ New program</PrimaryLink>
        )}
      </ListToolbar>

      {error && !creating && <Alert>{error}</Alert>}

      {creating && (
        <InlineCreateCard
          title="New program"
          action={createProgram}
          submitLabel="Create program"
          cancelHref={PROGRAMS_PATH}
        >
          {error && <Alert className="mb-4">{error}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={120}
                placeholder="Morning Edition"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="kind">Kind</Label>
              <Select id="kind" name="kind" defaultValue="recurring">
                <option value="recurring">Recurring</option>
                <option value="special">Special</option>
              </Select>
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
        </InlineCreateCard>
      )}

      {shown.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          {programs.length === 0 ? "No programs yet." : "No programs match."}
        </div>
      ) : (
        <TableFrame>
          <Table>
            <thead>
              <HeaderRow>
                <Th>Program</Th>
                <Th>Airs</Th>
                <Th>Days</Th>
                <Th>Clock</Th>
                <Th>Status</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {pageRows.map(({ program, live, status: rowStatus }) => {
                const primary = live[0] ?? null;
                const summary = primary ? summaries.get(primary.clock_template_id) : undefined;
                const placeholder = primary
                  ? isPlaceholderClockName(primary.clockTemplateName)
                  : false;
                const sharedBy = primary
                  ? (programIdsByTemplate.get(primary.clock_template_id)?.size ?? 0)
                  : 0;
                return (
                  <Row key={program.id}>
                    <Cell>
                      <Link
                        href={`${PROGRAMS_PATH}/${program.id}`}
                        className="font-bold text-brand-link hover:underline"
                      >
                        {program.name}
                      </Link>
                      {program.kind === "special" && (
                        <Badge variant="warning" className="ml-2">
                          Special
                        </Badge>
                      )}
                    </Cell>
                    <Cell className="whitespace-nowrap">
                      {primary
                        ? `${formatAirTime(primary.air_time)} · ${formatDurationMinutes(primary.duration_minutes)}`
                        : "—"}
                    </Cell>
                    <Cell className="whitespace-nowrap">
                      {primary
                        ? primary.entry_type === "recurring"
                          ? formatDaysOfWeek(primary.days_of_week)
                          : primary.entry_type === "override"
                            ? "Override"
                            : "Holiday"
                        : "—"}
                    </Cell>
                    <Cell>
                      {primary ? (
                        <div className="flex items-center gap-3">
                          <ClockThumb
                            slots={summary?.slots ?? []}
                            placeholder={placeholder}
                            label={
                              placeholder
                                ? "Placeholder clock, one slot for the whole hour"
                                : `Clock face for ${primary.clockTemplateName}`
                            }
                          />
                          <div className="flex min-w-0 flex-col leading-tight">
                            <Link
                              href={`/log/clocks/${primary.clock_template_id}?from=${program.id}`}
                              className={
                                placeholder
                                  ? "font-semibold text-ink-500 hover:underline"
                                  : "font-semibold text-brand-link hover:underline"
                              }
                            >
                              {primary.clockTemplateName}
                            </Link>
                            <span className="text-xs text-ink-500">
                              {placeholder
                                ? `Shared by ${sharedBy} ${sharedBy === 1 ? "program" : "programs"}`
                                : summary?.current
                                  ? `Version in effect since ${formatDateShort(summary.current.effective_from)}${
                                      summary.versionCount > 1
                                        ? ` · ${summary.versionCount} versions`
                                        : ""
                                    }`
                                  : "No version yet"}
                              {live.length > 1 &&
                                ` · +${live.length - 1} more ${live.length === 2 ? "entry" : "entries"}`}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-400">Schedule it to choose a clock</span>
                      )}
                    </Cell>
                    <Cell>
                      <Badge variant={STATUS_VARIANT[rowStatus]}>{STATUS_LABEL[rowStatus]}</Badge>
                    </Cell>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}

      <Pagination info={info} path={PROGRAMS_PATH} params={listParams} noun="programs" />

      {unused.length > 0 && (
        <div className="text-xs text-ink-500">
          <Link
            href={pageHref(
              PROGRAMS_PATH,
              { ...listParams, unusedClocks: unusedClocks ? null : "1" },
              1,
            )}
            className="font-bold text-brand-link hover:underline"
          >
            Unused clocks ({unused.length})
          </Link>
          <span> — clocks no program is scheduled on.</span>
        </div>
      )}

      {unusedClocks === "1" && unused.length > 0 && (
        <div className="rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Unused clocks
          </div>
          <ul className="divide-y divide-line">
            {unused.map((template) => (
              <li key={template.id} className="px-5 py-3 text-sm">
                <Link
                  href={`/log/clocks/${template.id}`}
                  className="font-semibold text-brand-link hover:underline"
                >
                  {template.name}
                </Link>
                {template.description && (
                  <span className="ml-2 text-ink-500">{template.description}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
