import type { SearchResult, SearchResultKind } from "@/lib/transcription/search";

export type SearchKindFilter = "all" | SearchResultKind;

export const SEARCH_KIND_FILTERS: { value: SearchKindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "clip", label: "Excerpts" },
  { value: "transcript", label: "In transcripts" },
  { value: "document", label: "In documents" },
  { value: "project", label: "Projects" },
];

export function parseSearchKind(raw: string | undefined): SearchKindFilter {
  return SEARCH_KIND_FILTERS.some((entry) => entry.value === raw)
    ? (raw as SearchKindFilter)
    : "all";
}

export function filterResultsByKind(
  results: SearchResult[],
  kind: SearchKindFilter,
): SearchResult[] {
  return kind === "all" ? results : results.filter((result) => result.kind === kind);
}

export function countResultsByKind(results: SearchResult[]): Record<SearchKindFilter, number> {
  const counts: Record<SearchKindFilter, number> = {
    all: results.length,
    clip: 0,
    transcript: 0,
    document: 0,
    project: 0,
  };
  for (const result of results) counts[result.kind] += 1;
  return counts;
}

export interface ProjectResultGroup {
  projectId: string;
  projectTitle: string;
  projectDescription: string | null;
  results: SearchResult[];
}

/**
 * Results regrouped by project, so five hits from one interview read as one
 * project with five places in it, not five unrelated cards. Order follows the
 * results' own ranking: a group sits where its best hit did, and hits keep
 * their rank inside it.
 */
export function groupResultsByProject(results: SearchResult[]): ProjectResultGroup[] {
  const groups = new Map<string, ProjectResultGroup>();
  for (const result of results) {
    const group = groups.get(result.projectId);
    if (group) {
      group.results.push(result);
    } else {
      groups.set(result.projectId, {
        projectId: result.projectId,
        projectTitle: result.projectTitle,
        projectDescription: result.projectDescription,
        results: [result],
      });
    }
  }
  return [...groups.values()];
}

export interface HighlightPart {
  text: string;
  hit: boolean;
}

/**
 * Splits text into runs so the words the reader searched for can be marked.
 * Any query word of two or more characters counts, case-insensitively; a
 * result found by meaning rather than by words simply has nothing to mark.
 */
export function splitHighlight(text: string, query: string): HighlightPart[] {
  const words = [
    ...new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
        .filter((word) => word.length >= 2),
    ),
  ];
  if (words.length === 0 || text === "") return [{ text, hit: false }];

  const escaped = words
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "giu");
  const parts: HighlightPart[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index), hit: false });
    parts.push({ text: match[0], hit: true });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts;
}
