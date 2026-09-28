import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatUpdatedDate } from "@/lib/resources/articles";
import type { RcArticleVersion } from "@/lib/resources/queries";

/**
 * An article's versions, newest first, for a detail page's aside. Each one
 * opens that version in place (`?version=N`); the newest is the page itself.
 * `viewing` marks the version on screen.
 */
export function HistoryCard({
  versions,
  hrefFor,
  viewing,
}: {
  versions: RcArticleVersion[];
  hrefFor: (version: number | null) => string;
  viewing: number;
}) {
  const newest = versions[0]?.version;
  return (
    <div id="history" className="rounded border border-line bg-white">
      <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">History</div>
      {versions.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-ink-500">No history recorded.</p>
      ) : (
        <ol className="flex flex-col py-2">
          {versions.map((version) => {
            const current = version.version === viewing;
            return (
              <li key={version.id}>
                <Link
                  href={hrefFor(version.version === newest ? null : version.version)}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "block px-5 py-1.5",
                    current
                      ? "border-l-2 border-brand-primary bg-panel-50 pl-[18px]"
                      : "hover:bg-panel-50",
                  )}
                >
                  <span className="block text-xs text-ink-400">
                    Version {version.version} · {formatUpdatedDate(version.created_at)} ·{" "}
                    {version.source === "release" ? "release" : "editor"}
                  </span>
                  <span className="block text-[13px] text-ink-700">
                    {version.note ?? `Version ${version.version}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
