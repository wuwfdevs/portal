"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import type { ThemeListItem } from "@/lib/transcription/themes";

/**
 * Every theme the caller can see, nested by parent (a "meta-theme" is
 * simply a theme with children — docs/sourcework-analysis-design.md §3), a
 * plain nested list rather than a tree widget (§5). Themes are tool-wide,
 * not project-scoped (§2), so — unlike SourceLibrary/ClipLibrary — there is
 * no per-project grouping to offer, only this flat filter. Purely
 * presentational, like ClipLibrary/SourceLibrary — theme creation is
 * NewThemeForm (sourcework/themes/), a route-owned component rendered
 * alongside this one, not inside it.
 */
export function ThemeLibrary({ themes }: { themes: ThemeListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return themes;
    return themes.filter((theme) => theme.title.toLowerCase().includes(trimmed));
  }, [themes, query]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, ThemeListItem[]>();
    for (const theme of filtered) {
      const list = map.get(theme.parentThemeId) ?? [];
      list.push(theme);
      map.set(theme.parentThemeId, list);
    }
    return map;
  }, [filtered]);

  // A query can match a child whose parent it doesn't match, which breaks
  // strict nesting — fall back to a flat list while filtering rather than
  // silently hiding a real match. Full-tree search (showing an unmatched
  // ancestor just to keep a matched descendant nested) is a "no concrete
  // need yet" case, not built here.
  const isFiltering = query.trim().length > 0;
  const topLevel = childrenByParent.get(null) ?? [];

  return (
    <div>
      <Input
        type="search"
        placeholder="Filter themes by title…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mb-4 max-w-xs"
      />

      {themes.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No themes yet. Group data points from a project&rsquo;s Research tab into a pattern to
          start one.
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-ink-500">No themes match &ldquo;{query}&rdquo;.</p>
      ) : isFiltering ? (
        <ul className="flex flex-col gap-2">
          {filtered.map((theme) => (
            <li key={theme.id}>
              <ThemeRow theme={theme} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2">
          {topLevel.map((theme) => (
            <ThemeNode key={theme.id} theme={theme} childrenByParent={childrenByParent} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ThemeNode({
  theme,
  childrenByParent,
}: {
  theme: ThemeListItem;
  childrenByParent: Map<string | null, ThemeListItem[]>;
}) {
  const children = childrenByParent.get(theme.id) ?? [];
  return (
    <li>
      <ThemeRow theme={theme} />
      {children.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2 border-l border-line pl-4">
          {children.map((child) => (
            <ThemeNode key={child.id} theme={child} childrenByParent={childrenByParent} />
          ))}
        </ul>
      )}
    </li>
  );
}

function ThemeRow({ theme }: { theme: ThemeListItem }) {
  return (
    <Link
      href={`/sourcework/themes/${theme.id}`}
      className="block rounded border border-line bg-white p-3 hover:border-brand-primary"
    >
      <p className="font-semibold text-ink-900">{theme.title}</p>
      <p className="text-xs text-ink-500">
        {theme.dataPointCount} data point{theme.dataPointCount === 1 ? "" : "s"}
        {theme.projectTitles.length > 0 &&
          `, spanning ${theme.projectTitles.length} project${theme.projectTitles.length === 1 ? "" : "s"}`}
      </p>
      {theme.notes && <p className="mt-1 line-clamp-2 text-xs text-ink-400">{theme.notes}</p>}
    </Link>
  );
}
