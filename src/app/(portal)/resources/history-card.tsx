import { formatUpdatedDate } from "@/lib/resources/articles";
import type { RcArticleVersion } from "@/lib/resources/queries";

/** An article's versions, newest first, for a detail page's aside. */
export function HistoryCard({ versions }: { versions: RcArticleVersion[] }) {
  return (
    <div id="history" className="rounded border border-line bg-white">
      <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">History</div>
      {versions.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-ink-500">No history recorded.</p>
      ) : (
        <ol className="flex flex-col gap-3 px-5 py-4">
          {versions.map((version) => (
            <li key={version.id}>
              <p className="text-xs text-ink-400">
                {formatUpdatedDate(version.created_at)} ·{" "}
                {version.source === "release" ? "release" : "editor"}
              </p>
              <p className="text-[13px] text-ink-700">
                {version.note ?? `Version ${version.version}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
