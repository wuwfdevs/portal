import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEditorialAccess } from "@/lib/editorial/access";
import {
  countPitchesByStatus,
  getCurrentMeeting,
  getPitchValues,
  listPillars,
  listPitchFormFields,
  listPitchesWithActivity,
  type PitchListEntry,
} from "@/lib/editorial/data";
import {
  BACKLOG_PATH,
  backlogQuery,
  buildBacklogFilterGroups,
  fieldText,
  FORMAT_FIELD_KEY,
  matchesBacklogFilters,
  parseBacklogParams,
  SUMMARY_FIELD_KEY,
  URGENCY_FIELD_KEY,
  type BacklogView,
} from "@/lib/editorial/backlog-filters";
import { NON_PILLAR_OPTIONS, PRIMARY_PILLAR_FIELD_KEY } from "@/lib/editorial/form";
import { formatAgeLong, formatAgo } from "@/lib/editorial/format";
import { isPastLastPage, pageHref, pageInfo, pageRange } from "@/lib/pagination";
import { archiveSelectedPitches } from "./pitches/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { ThisWeekBand } from "./this-week-band";
import type { EpFieldValue } from "@/lib/database.types";

const EMPTY_MESSAGE: Record<BacklogView, string> = {
  open: "No open pitches yet. Submit the first one and it lands here for the next meeting.",
  stale: "Nothing stale — every open pitch is either recent or has been looked at.",
  assigned: "No assigned stories yet. Pitches land here once a meeting assigns them.",
  archived: "No archived pitches.",
};

/**
 * The tool's home: the meeting in progress up top, then the backlog as a list
 * page (docs/ui-patterns.md) — search, one Filter menu (view, pillar, format,
 * urgency), a stacking table, pages. Filtering and paging happen here in JS:
 * the lists are small and staleness is derived, not stored.
 */
export default async function BacklogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { profile, role } = await requireEditorialAccess();
  const raw = await searchParams;
  const params = parseBacklogParams(raw);
  const error = typeof raw.error === "string" ? raw.error : undefined;

  // Staleness only applies to open pitches, and the Stale chip needs its count
  // on every view — so the open list is always loaded and the other views layer on.
  const [openEntries, counts, fields, pillars, current] = await Promise.all([
    listPitchesWithActivity(["open"]),
    countPitchesByStatus(),
    listPitchFormFields(),
    listPillars({ activeOnly: true }),
    getCurrentMeeting(profile.id),
  ]);
  const staleCount = openEntries.filter((entry) => entry.stale).length;
  const viewEntries =
    params.view === "open"
      ? openEntries
      : params.view === "stale"
        ? openEntries.filter((entry) => entry.stale)
        : await listPitchesWithActivity([params.view]);

  const valuesByPitch = await getPitchValues(viewEntries.map((entry) => entry.pitch.id));
  const keyByFieldId = new Map(fields.map((field) => [field.id, field.key]));
  const valuesFor = (entry: PitchListEntry): Record<string, EpFieldValue | undefined> => {
    const values: Record<string, EpFieldValue | undefined> = {};
    for (const row of valuesByPitch.get(entry.pitch.id) ?? []) {
      const key = keyByFieldId.get(row.field_id);
      if (key) values[key] = row.value;
    }
    return values;
  };
  const rows = viewEntries
    .map((entry) => ({ entry, values: valuesFor(entry) }))
    .filter(({ entry, values }) =>
      matchesBacklogFilters(params, { title: entry.pitch.title, values }),
    );

  const info = pageInfo(params.page, rows.length);
  if (isPastLastPage(info)) redirect(pageHref(BACKLOG_PATH, backlogQuery(params), info.pageCount));
  const { from, to } = pageRange(params.page);
  const pageRows = rows.slice(from, to + 1);

  const viewCounts: Record<BacklogView, number> = { ...counts, stale: staleCount };
  const optionsOf = (key: string) => fields.find((field) => field.key === key)?.options ?? [];
  const groups = buildBacklogFilterGroups(params, viewCounts, {
    pillars: [...pillars.map((pillar) => pillar.name), ...NON_PILLAR_OPTIONS],
    formats: optionsOf(FORMAT_FIELD_KEY),
    urgencies: optionsOf(URGENCY_FIELD_KEY),
  });
  // The search form carries the other filters as hidden fields. Never `q`
  // itself: ListSearch's visible input is the one source of the term, and a
  // hidden copy ahead of it would win FormData.get("q") on submit.
  const query = backlogQuery(params);
  const hidden = Object.fromEntries(
    Object.entries(backlogQuery({ ...params, q: "" })).filter(
      (pair): pair is [string, string] => pair[1] !== null,
    ),
  );
  const canBulkArchive = params.view === "stale" && role === "editor" && pageRows.length > 0;

  const table = (
    <TableFrame>
      <Table stack>
        <thead>
          <HeaderRow>
            {canBulkArchive && (
              <Th>
                <span className="sr-only">Select</span>
              </Th>
            )}
            <Th>Pitch</Th>
            <Th>Pillar</Th>
            <Th>Format</Th>
            <Th>Submitted</Th>
            <Th className="text-right">
              {params.view === "assigned"
                ? "Reporter"
                : params.view === "archived"
                  ? "Why"
                  : "Last reviewed"}
            </Th>
          </HeaderRow>
        </thead>
        <tbody>
          {pageRows.map(({ entry, values }) => (
            <Row key={entry.pitch.id}>
              {canBulkArchive && (
                <Cell stack="aside" className="w-10 pr-0">
                  <input
                    type="checkbox"
                    name="pitch_id"
                    value={entry.pitch.id}
                    aria-label={`Select ${entry.pitch.title}`}
                    className="mt-0.5 h-4 w-4 accent-brand-primary"
                  />
                </Cell>
              )}
              <Cell stack="title" className="min-w-0 md:max-w-md">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/editorial/pitches/${entry.pitch.id}`}
                    className="text-body font-semibold text-ink-900 hover:text-brand-link hover:underline"
                  >
                    {entry.pitch.title}
                  </Link>
                  {entry.onSlateMeetingId && <Badge variant="accent">On slate</Badge>}
                  {entry.stale && params.view === "open" && <Badge variant="warning">Stale</Badge>}
                </div>
                {fieldText(values, SUMMARY_FIELD_KEY) && (
                  <p className="mt-0.5 truncate text-ui text-ink-500">
                    {fieldText(values, SUMMARY_FIELD_KEY)}
                  </p>
                )}
              </Cell>
              <Cell label="Pillar" className="text-ui text-ink-700">
                {fieldText(values, PRIMARY_PILLAR_FIELD_KEY) || "—"}
              </Cell>
              <Cell label="Format" className="text-ui text-ink-500">
                {fieldText(values, FORMAT_FIELD_KEY) || "—"}
              </Cell>
              <Cell label="Submitted" className="whitespace-nowrap text-ui text-ink-500">
                {entry.submitterName ?? "A former member"} · {formatAgeLong(entry.pitch.created_at)}
              </Cell>
              <Cell
                label={
                  params.view === "assigned"
                    ? "Reporter"
                    : params.view === "archived"
                      ? "Why"
                      : "Last reviewed"
                }
                className="text-ui text-ink-500 md:text-right"
              >
                {rowStatus(entry, params.view)}
              </Cell>
            </Row>
          ))}
        </tbody>
      </Table>
    </TableFrame>
  );

  return (
    <div>
      <ThisWeekBand summary={current} role={role} />

      <ListToolbar
        className="mb-5"
        search={{
          placeholder: "Search pitches",
          label: "Search pitches",
          defaultValue: params.q,
          hidden,
        }}
        filters={groups}
        primary={{ href: "/editorial/pitches/new", label: "New pitch" }}
      />

      {error && <Alert className="mb-4">{error}</Alert>}

      {params.view === "stale" && rows.length > 0 && (
        <p className="mb-3 text-xs leading-relaxed text-ink-400">
          Pitches that have aged out or been deferred repeatedly. Archiving one keeps it on the
          record — it just stops crowding the backlog.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState className="leading-relaxed">
          {params.q || params.pillar || params.format || params.urgency
            ? "No pitches match these filters."
            : EMPTY_MESSAGE[params.view]}
        </EmptyState>
      ) : canBulkArchive ? (
        <form action={archiveSelectedPitches}>
          {table}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2.5">
            <Input
              name="reason"
              placeholder="Reason (optional)"
              className="w-full sm:w-64"
              maxLength={200}
            />
            <Button type="submit" variant="secondary">
              Archive selected
            </Button>
          </div>
        </form>
      ) : (
        table
      )}

      <Pagination info={info} path={BACKLOG_PATH} params={query} noun="pitches" />
    </div>
  );
}

/**
 * The one right-aligned status string a row ends with. Each view answers a
 * different question about the same pitch — who has it (Assigned), why it left
 * (Archived), how long it has gone unlooked-at (Open/Stale).
 */
function rowStatus(entry: PitchListEntry, view: BacklogView): string {
  if (view === "assigned") return entry.assigneeName ?? "Unassigned";
  if (view === "archived") return entry.pitch.archived_reason ?? "No reason recorded";
  if (!entry.lastReviewedAt) return "Never reviewed";
  const reviewed = `Reviewed ${formatAgo(entry.lastReviewedAt)}`;
  return entry.deferralCount > 0 ? `${reviewed} · Deferred ${entry.deferralCount}×` : reviewed;
}
