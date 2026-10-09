import type { BadgeVariant } from "@/components/ui/badge";
import type { MigrationItemCategory } from "@/lib/underwriting/agreement-migration";
import { pluralize } from "@/lib/format";

// How the migration screens name and colour an entry's category
// (agreement-migration.ts's migrationItemCategory), in one place so the
// home page's bars, the review page's chips, and the run's badges agree.

export const CATEGORY_ORDER: MigrationItemCategory[] = [
  "ready",
  "needs_look",
  "failed",
  "importing",
  "not_run",
];

export const CATEGORY_META: Record<
  MigrationItemCategory,
  { label: string; badge: BadgeVariant; bar: string }
> = {
  ready: { label: "Ready", badge: "success", bar: "bg-success-fg" },
  needs_look: { label: "Needs a look", badge: "warning", bar: "bg-warning-border" },
  failed: { label: "Failed", badge: "danger", bar: "bg-danger" },
  importing: { label: "Importing", badge: "accent", bar: "bg-brand-primary" },
  not_run: { label: "Not run", badge: "neutral", bar: "bg-panel-100" },
};

/** "29 ready · 7 need a look · 2 failed", leaving out the zeros. */
export function describeCounts(counts: Record<MigrationItemCategory, number>): string {
  const phrase: Record<MigrationItemCategory, (n: number) => string> = {
    ready: (n) => `${n} ready`,
    needs_look: (n) => `${pluralize(n, "needs", "need")} a look`,
    failed: (n) => `${n} failed`,
    importing: (n) => `${n} importing`,
    not_run: (n) => `${n} not run`,
  };
  return CATEGORY_ORDER.filter((category) => counts[category] > 0)
    .map((category) => phrase[category](counts[category]))
    .join(" · ");
}

/** One bar split by category, with the counts beside it as text for everyone, screen readers included. */
export function BatchProgress({
  counts,
  total,
}: {
  counts: Record<MigrationItemCategory, number>;
  total: number;
}) {
  const text = describeCounts(counts);
  return (
    <div className="flex flex-col gap-1.5">
      <div aria-hidden="true" className="flex h-2 w-full overflow-hidden rounded-full bg-panel-100">
        {CATEGORY_ORDER.filter((category) => category !== "not_run").map((category) =>
          counts[category] > 0 ? (
            <span
              key={category}
              className={CATEGORY_META[category].bar}
              style={{ width: `${(counts[category] / Math.max(total, 1)) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <span className="text-[13px] text-ink-500">{text || "No entries"}</span>
    </div>
  );
}
