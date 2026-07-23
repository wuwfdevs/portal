import Link from "next/link";
import { requireEditorialAccess } from "@/lib/editorial/access";
import { listPitchesWithActivity, type PitchListEntry } from "@/lib/editorial/data";
import { formatAge, formatShortDate } from "@/lib/editorial/format";
import { archiveSelectedPitches } from "./pitches/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type BacklogView = "open" | "stale" | "assigned" | "archived";

const VIEWS: { key: BacklogView; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "stale", label: "Stale" },
  { key: "assigned", label: "Assigned" },
  { key: "archived", label: "Archived" },
];

export default async function BacklogPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { role } = await requireEditorialAccess();
  const { view: viewParam } = await searchParams;
  const view: BacklogView = (VIEWS.find((v) => v.key === viewParam)?.key ?? "open") as BacklogView;

  const status = view === "assigned" ? "assigned" : view === "archived" ? "archived" : "open";
  const all = await listPitchesWithActivity([status]);
  const entries = view === "stale" ? all.filter((entry) => entry.stale) : all;
  const staleCount = view === "open" ? all.filter((entry) => entry.stale).length : 0;
  const canBulkArchive = view === "stale" && role === "editor" && entries.length > 0;

  const table = (
    <div className="overflow-x-auto rounded border border-line">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line bg-panel-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500">
            {canBulkArchive && <th className="w-10 px-4 py-2.5" />}
            <th className="px-4 py-2.5">Title</th>
            <th className="px-4 py-2.5">Submitted by</th>
            <th className="px-4 py-2.5">Age</th>
            {view === "assigned" ? (
              <th className="px-4 py-2.5">Assigned to</th>
            ) : view === "archived" ? (
              <th className="px-4 py-2.5">Reason</th>
            ) : (
              <>
                <th className="px-4 py-2.5">Last reviewed</th>
                <th className="px-4 py-2.5">Deferred</th>
              </>
            )}
          </tr>
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
      </table>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex gap-1.5">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={v.key === "open" ? "/editorial" : `/editorial?view=${v.key}`}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                v.key === view
                  ? "bg-brand-surface text-brand-link"
                  : "text-ink-500 hover:bg-panel-50",
              )}
            >
              {v.label}
              {v.key === view && ` (${entries.length})`}
            </Link>
          ))}
        </div>
        {staleCount > 0 && (
          <span className="text-xs text-ink-400">
            {staleCount} {staleCount === 1 ? "pitch looks" : "pitches look"} stale —{" "}
            <Link href="/editorial?view=stale" className="font-semibold text-brand-link">
              review them
            </Link>
          </span>
        )}
        <div className="flex-1" />
        <Link href="/editorial/pitches/new">
          <Button>+ New pitch</Button>
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          {view === "open" && "No open pitches. Submit the first one."}
          {view === "stale" && "Nothing stale — the backlog is in good shape."}
          {view === "assigned" && "No assigned stories yet."}
          {view === "archived" && "No archived pitches."}
        </div>
      ) : canBulkArchive ? (
        <form action={archiveSelectedPitches}>
          {table}
          <div className="mt-3 flex items-center justify-end gap-2.5">
            <input
              name="reason"
              placeholder="Reason (optional)"
              className="w-64 rounded border border-line px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400"
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
    <tr className="border-b border-line last:border-b-0">
      {selectable && (
        <td className="px-4 py-3">
          <input
            type="checkbox"
            name="pitch_id"
            value={pitch.id}
            aria-label={`Select ${pitch.title}`}
          />
        </td>
      )}
      <td className="px-4 py-3">
        <Link
          href={`/editorial/pitches/${pitch.id}`}
          className="font-semibold text-ink-900 hover:text-brand-link"
        >
          {pitch.title}
        </Link>
      </td>
      <td className="px-4 py-3 text-ink-500">{entry.submitterName ?? "—"}</td>
      <td className="px-4 py-3 text-ink-500">{formatAge(pitch.created_at)}</td>
      {view === "assigned" ? (
        <td className="px-4 py-3 text-ink-500">{entry.assigneeName ?? "—"}</td>
      ) : view === "archived" ? (
        <td className="px-4 py-3 text-ink-500">{pitch.archived_reason ?? "—"}</td>
      ) : (
        <>
          <td className="px-4 py-3 text-ink-500">
            {entry.lastReviewedAt ? formatShortDate(entry.lastReviewedAt) : "—"}
          </td>
          <td className="px-4 py-3 text-ink-500">
            {entry.deferralCount > 0 ? `${entry.deferralCount}×` : "—"}
            {entry.stale && view === "open" && <span title="Stale"> ⚠</span>}
          </td>
        </>
      )}
    </tr>
  );
}
