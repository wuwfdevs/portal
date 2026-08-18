import Link from "next/link";
import { requireEditorialAccess } from "@/lib/editorial/access";
import {
  countPitchesByStatus,
  listPitchesWithActivity,
  type PitchListEntry,
} from "@/lib/editorial/data";
import { formatAgeLong, formatAgo } from "@/lib/editorial/format";
import { archiveSelectedPitches } from "./pitches/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const list = (
    <div className="rounded border border-line">
      {entries.map((entry) => (
        <BacklogRow key={entry.pitch.id} entry={entry} view={view} selectable={canBulkArchive} />
      ))}
    </div>
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="w-full min-w-0 sm:w-auto">
          <div className="flex gap-1 overflow-x-auto rounded-full bg-panel-50 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={v.key === "open" ? "/editorial" : `/editorial?view=${v.key}`}
                aria-current={v.key === view ? "page" : undefined}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
                  v.key === view
                    ? "bg-white text-brand-link shadow-sm"
                    : "text-ink-500 hover:text-ink-900",
                )}
              >
                {v.label} <span className="font-normal opacity-60">{countFor(v.key)}</span>
              </Link>
            ))}
          </div>
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
          {list}
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
        list
      )}
    </div>
  );
}

/**
 * The one right-aligned status string a row ends with. Each view answers a
 * different question about the same pitch — who has it (Assigned), why it left
 * (Archived), how long it has gone unlooked-at (Open/Stale) — so the columns
 * those used to be collapse into one line rather than a wider table.
 */
function rowStatus(entry: PitchListEntry, view: BacklogView): string {
  if (view === "assigned") return entry.assigneeName ? `→ ${entry.assigneeName}` : "Unassigned";
  if (view === "archived") return entry.pitch.archived_reason ?? "No reason recorded";
  if (!entry.lastReviewedAt) return "Never reviewed";
  const reviewed = `Reviewed ${formatAgo(entry.lastReviewedAt)}`;
  return entry.deferralCount > 0 ? `${reviewed} · Deferred ${entry.deferralCount}×` : reviewed;
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
    <div className="flex items-start gap-3.5 border-b border-line px-5 py-4 last:border-b-0 hover:bg-panel-50">
      {selectable && (
        <input
          type="checkbox"
          name="pitch_id"
          value={pitch.id}
          aria-label={`Select ${pitch.title}`}
          className="mt-1 h-4 w-4 shrink-0 accent-brand-primary"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/editorial/pitches/${pitch.id}`}
            className="text-[15px] font-semibold text-ink-900 hover:text-brand-link hover:underline"
          >
            {pitch.title}
          </Link>
          {entry.stale && view === "open" && <Badge variant="danger">Stale</Badge>}
        </div>
        <p className="mt-1 text-[13px] text-ink-500">
          {entry.submitterName ?? "A former member"}
          <span aria-hidden="true"> · </span>
          {formatAgeLong(pitch.created_at)}
        </p>
      </div>
      <div
        className={cn(
          "shrink-0 pt-0.5 text-right text-xs text-ink-400",
          view === "archived" ? "max-w-[14rem]" : "whitespace-nowrap",
        )}
      >
        {rowStatus(entry, view)}
      </div>
    </div>
  );
}
