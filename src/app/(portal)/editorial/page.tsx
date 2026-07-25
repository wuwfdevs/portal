import Link from "next/link";
import { requireEditorialAccess } from "@/lib/editorial/access";
import {
  countPitchesByStatus,
  listPitchesWithActivity,
  type PitchListEntry,
} from "@/lib/editorial/data";
import { formatAge, formatShortDate } from "@/lib/editorial/format";
import { archiveSelectedPitches } from "./pitches/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";

type BacklogView = "open" | "stale" | "assigned" | "archived";

const VIEWS: { key: BacklogView; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "stale", label: "Stale" },
  { key: "assigned", label: "Assigned" },
  { key: "archived", label: "Archived" },
];

const EMPTY_MESSAGE: Record<BacklogView, string> = {
  open: "No open pitches yet. Submit the first one and it lands here for the next meeting.",
  stale: "Nothing stale — every open pitch is either recent or has been looked at.",
  assigned: "No assigned stories yet. Pitches land here once a meeting assigns them.",
  archived: "No archived pitches.",
};

export default async function BacklogPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; error?: string }>;
}) {
  const { role } = await requireEditorialAccess();
  const { view: viewParam, error } = await searchParams;
  const view: BacklogView = VIEWS.find((v) => v.key === viewParam)?.key ?? "open";

  // Staleness only applies to open pitches, and the Stale tab needs its count on
  // every view — so the open list is always loaded and the other views layer on.
  const [openEntries, counts] = await Promise.all([
    listPitchesWithActivity(["open"]),
    countPitchesByStatus(),
  ]);
  const staleCount = openEntries.filter((entry) => entry.stale).length;
  const entries =
    view === "open"
      ? openEntries
      : view === "stale"
        ? openEntries.filter((entry) => entry.stale)
        : await listPitchesWithActivity([view]);
  const canBulkArchive = view === "stale" && role === "editor" && entries.length > 0;

  const countFor = (key: BacklogView): number => (key === "stale" ? staleCount : counts[key]);

  const table = (
    <TableFrame>
      <Table className="min-w-[720px]">
        <thead>
          <HeaderRow>
            {canBulkArchive && (
              <Th className="w-10">
                <span className="sr-only">Select</span>
              </Th>
            )}
            <Th>Title</Th>
            <Th>Submitted by</Th>
            <Th>Age</Th>
            {view === "assigned" ? (
              <Th>Assigned to</Th>
            ) : view === "archived" ? (
              <Th>Reason</Th>
            ) : (
              <>
                <Th>Last reviewed</Th>
                <Th>Deferred</Th>
              </>
            )}
          </HeaderRow>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <BacklogRow
              key={entry.pitch.id}
              entry={entry}
              view={view}
              selectable={canBulkArchive}
            />
          ))}
        </tbody>
      </Table>
    </TableFrame>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-wrap gap-1.5">
          {VIEWS.map((v) => {
            const count = countFor(v.key);
            return (
              <Link
                key={v.key}
                href={v.key === "open" ? "/editorial" : `/editorial?view=${v.key}`}
                aria-current={v.key === view ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  v.key === view
                    ? "bg-brand-surface text-brand-link"
                    : "text-ink-500 hover:bg-panel-50 hover:text-ink-900",
                )}
              >
                {v.label}
                {count > 0 && (
                  <span
                    className={cn("ml-1.5", v.key === view ? "text-brand-link/70" : "text-ink-400")}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        <div className="flex-1" />
        <Link href="/editorial/pitches/new">
          <Button>New pitch</Button>
        </Link>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}

      {view === "open" && staleCount > 0 && (
        <Alert variant="info" className="mb-4">
          {staleCount} {staleCount === 1 ? "pitch has" : "pitches have"} been sitting without a
          decision.{" "}
          <Link href="/editorial?view=stale" className="font-semibold text-brand-link underline">
            Review them
          </Link>
        </Alert>
      )}

      {view === "stale" && entries.length > 0 && (
        <p className="mb-3 text-xs leading-relaxed text-ink-400">
          Pitches that have aged out or been deferred repeatedly. Archiving one keeps it on the
          record — it just stops crowding the backlog.
        </p>
      )}

      {entries.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm leading-relaxed text-ink-500">
          {EMPTY_MESSAGE[view]}
        </div>
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
    </div>
  );
}

function BacklogRow({
  entry,
  view,
  selectable,
}: {
  entry: PitchListEntry;
  view: BacklogView;
  selectable: boolean;
}) {
  const { pitch } = entry;
  return (
    <Row>
      {selectable && (
        <Cell>
          <input
            type="checkbox"
            name="pitch_id"
            value={pitch.id}
            aria-label={`Select ${pitch.title}`}
            className="h-4 w-4"
          />
        </Cell>
      )}
      <Cell>
        <Link
          href={`/editorial/pitches/${pitch.id}`}
          className="font-semibold text-ink-900 hover:text-brand-link hover:underline"
        >
          {pitch.title}
        </Link>
        {entry.stale && view === "open" && (
          <span className="ml-2 align-middle">
            <Badge variant="danger">Stale</Badge>
          </span>
        )}
      </Cell>
      <Cell className="text-ink-500">{entry.submitterName ?? "—"}</Cell>
      <Cell className="whitespace-nowrap tabular-nums text-ink-500">
        {formatAge(pitch.created_at)}
      </Cell>
      {view === "assigned" ? (
        <Cell className="text-ink-500">{entry.assigneeName ?? "—"}</Cell>
      ) : view === "archived" ? (
        <Cell className="text-ink-500">{pitch.archived_reason ?? "—"}</Cell>
      ) : (
        <>
          <Cell className="whitespace-nowrap text-ink-500">
            {entry.lastReviewedAt ? formatShortDate(entry.lastReviewedAt) : "Never"}
          </Cell>
          <Cell className="tabular-nums text-ink-500">
            {entry.deferralCount > 0 ? `${entry.deferralCount}×` : "—"}
          </Cell>
        </>
      )}
    </Row>
  );
}
