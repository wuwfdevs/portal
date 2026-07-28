import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/transcription/media";
import type { SearchResult, SearchResultKind } from "@/lib/transcription/search";

// One ranked list, three kinds of result (design doc §3F). A saved clip and
// an unclipped stretch of transcript answer the same question — "where do we
// have someone saying this?" — so they compete in one list rather than
// sitting in separate panes the reporter has to check twice.

const KIND_BADGE: Record<
  SearchResultKind,
  { label: string; variant: "accent" | "neutral" | "muted" }
> = {
  clip: { label: "Clip", variant: "accent" },
  transcript: { label: "In transcript", variant: "neutral" },
  project: { label: "Project", variant: "muted" },
};

/**
 * A result's link into the workspace. `t` is what makes a hit a place rather
 * than a citation — the workspace seeks there on load; `clip` additionally
 * opens that clip in the rail so it can be re-trimmed or re-exported without
 * a second hunt.
 */
export function resultHref(result: {
  kind: SearchResultKind;
  id: string;
  projectId: string;
  startMs: number | null;
}): string {
  const params = new URLSearchParams();
  if (result.startMs !== null) params.set("t", String(result.startMs));
  if (result.kind === "clip") params.set("clip", result.id);

  const query = params.toString();
  return `/transcription/${result.projectId}${query ? `?${query}` : ""}`;
}

export function SearchResults({ results, query }: { results: SearchResult[]; query: string }) {
  if (results.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        Nothing matches &ldquo;{query}&rdquo; yet. Try fewer words, or a phrase someone would
        actually have said.
      </div>
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
  const badge = KIND_BADGE[result.kind];
  const heading = result.kind === "clip" ? result.title : result.projectTitle;

  return (
    <div className="rounded border border-line bg-white p-4 hover:border-ink-300">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Badge variant={badge.variant}>{badge.label}</Badge>
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
          result.startMs !== null ? formatDuration(result.startMs) : null,
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
    </div>
  );
}

function formatResultDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
