import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, defineStatusMap } from "@/components/ui/status-badge";
import { formatShortDate } from "@/lib/format";
import { formatDuration } from "@/lib/transcription/media";
import type { SearchResult, SearchResultKind } from "@/lib/transcription/search";
import { groupResultsByProject, splitHighlight } from "@/lib/transcription/search-groups";

// One ranked list, three kinds of result (design doc §3F). A saved clip and
// an unclipped stretch of transcript answer the same question — "where do we
// have someone saying this?" — so they compete in one list rather than
// sitting in separate panes the reporter has to check twice.

const KIND_BADGE = defineStatusMap<SearchResultKind>({
  clip: { label: "Excerpt", variant: "accent" },
  transcript: { label: "In transcript", variant: "neutral" },
  document: { label: "In document", variant: "neutral" },
  project: { label: "Project", variant: "muted" },
});

/**
 * A result's link into the workspace. `source` picks the right pill for a
 * multi-source project (Phase 3a) — without it the workspace falls back to
 * the project's earliest-attached source, which for a hit against a later
 * one means the wrong media, a `t`/`page` that lands nowhere meaningful, and
 * a `clip` that can't be found in that pill's excerpt list. `t` (audio) or
 * `page` (document) is what makes a hit a place rather than a citation — the
 * workspace seeks/navigates there on load; `clip` additionally opens that
 * clip in the rail so it can be re-trimmed or re-exported without a second
 * hunt (document excerpts don't have an analogous rail to open into yet).
 */
export function resultHref(result: {
  kind: SearchResultKind;
  id: string;
  projectId: string;
  sourceId: string | null;
  startMs: number | null;
  pageNumber: number | null;
}): string {
  const params = new URLSearchParams();
  if (result.sourceId) params.set("source", result.sourceId);
  if (result.startMs !== null) params.set("t", String(result.startMs));
  else if (result.pageNumber !== null) params.set("page", String(result.pageNumber));
  if (result.kind === "clip" && result.startMs !== null) params.set("clip", result.id);

  const query = params.toString();
  return `/sourcework/${result.projectId}${query ? `?${query}` : ""}`;
}

export function SearchResults({ results, query }: { results: SearchResult[]; query: string }) {
  if (results.length === 0) {
    return (
      <EmptyState>
        Nothing matches &ldquo;{query}&rdquo; yet. Try fewer words, or a phrase someone would
        actually have said.
      </EmptyState>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {results.map((result) => (
        <li key={`${result.kind}:${result.id}`}>
          <ResultCard result={result} query={query} />
        </li>
      ))}
    </ul>
  );
}

/** Results regrouped by project: one heading per interview or document set, the first few hits under it, the rest a click away. */
export function GroupedSearchResults({
  results,
  query,
}: {
  results: SearchResult[];
  query: string;
}) {
  if (results.length === 0) return <SearchResults results={results} query={query} />;
  const groups = groupResultsByProject(results);
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => {
        const shown = group.results.slice(0, GROUP_VISIBLE);
        const rest = group.results.slice(GROUP_VISIBLE);
        return (
          <section key={group.projectId} aria-label={group.projectTitle}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="font-serif text-lg font-semibold text-ink-900">
                <Link
                  href={`/sourcework/${group.projectId}`}
                  className="hover:text-brand-link hover:underline"
                >
                  {group.projectTitle}
                </Link>
              </h2>
              <span className="text-xs text-ink-500">
                {group.results.length} result{group.results.length === 1 ? "" : "s"}
              </span>
            </div>
            {group.projectDescription && (
              <p className="mb-3 mt-0.5 text-sm italic text-ink-400">{group.projectDescription}</p>
            )}
            <ul className="mt-3 flex flex-col gap-3">
              {shown.map((result) => (
                <li key={`${result.kind}:${result.id}`}>
                  <ResultCard result={result} query={query} inGroup />
                </li>
              ))}
            </ul>
            {rest.length > 0 && (
              <details className="group/more mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-brand-link">
                  <span className="group-open/more:hidden">
                    Show {rest.length} more in {group.projectTitle}
                  </span>
                  <span className="hidden group-open/more:inline">Show fewer</span>
                </summary>
                <ul className="mt-3 flex flex-col gap-3">
                  {rest.map((result) => (
                    <li key={`${result.kind}:${result.id}`}>
                      <ResultCard result={result} query={query} inGroup />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** How many hits of one project show before "Show N more". */
const GROUP_VISIBLE = 3;

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitHighlight(text, query).map((part, index) =>
        part.hit ? (
          <mark key={index} className="rounded-sm bg-brand-surface px-0.5 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function ResultCard({
  result,
  query,
  inGroup = false,
}: {
  result: SearchResult;
  query: string;
  /** Under a project heading already, so the project's name and background aren't repeated. */
  inGroup?: boolean;
}) {
  const heading = result.kind === "clip" ? result.title : result.projectTitle;

  return (
    <Card className="p-4 hover:border-ink-300">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <StatusBadge map={KIND_BADGE} value={result.kind} />
        <Link href={resultHref(result)} className="font-semibold text-brand-link">
          {heading || "Untitled"}
        </Link>
      </div>

      {result.kind !== "project" && (
        <p className="mb-2 line-clamp-3 text-sm text-ink-700">
          <Highlighted text={result.snippet} query={query} />
        </p>
      )}

      <p className="text-xs text-ink-500">
        {[
          result.speakerLabel,
          result.startMs !== null
            ? formatDuration(result.startMs)
            : result.pageNumber !== null
              ? `p. ${result.pageNumber}`
              : null,
          // A clip already shows its own title above, so name the recording
          // here instead — "what else did they say about this?" is the next
          // question every time.
          result.kind === "clip" && !inGroup ? result.projectTitle : null,
          formatResultDate(result.interviewDate),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {/* The project's background: the context a stranger to this recording
          needs before they can use the quote (design doc §3G). */}
      {!inGroup && result.projectDescription && (
        <p className="mt-1.5 line-clamp-2 text-xs italic text-ink-400">
          {result.projectDescription}
        </p>
      )}
    </Card>
  );
}

function formatResultDate(value: string | null): string | null {
  if (!value) return null;
  return formatShortDate(value, { year: true });
}
