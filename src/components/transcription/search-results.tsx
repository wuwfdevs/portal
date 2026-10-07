import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, defineStatusMap } from "@/components/ui/status-badge";
import { formatShortDate } from "@/lib/format";
import { formatDuration } from "@/lib/transcription/media";
import type { SearchResult, SearchResultKind } from "@/lib/transcription/search";

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
          <ResultCard result={result} />
        </li>
      ))}
    </ul>
  );
}

function ResultCard({ result }: { result: SearchResult }) {
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
        <p className="mb-2 line-clamp-3 text-sm text-ink-700">{result.snippet}</p>
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
          result.kind === "clip" ? result.projectTitle : null,
          formatResultDate(result.interviewDate),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {/* The project's background: the context a stranger to this recording
          needs before they can use the quote (design doc §3G). */}
      {result.projectDescription && (
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
