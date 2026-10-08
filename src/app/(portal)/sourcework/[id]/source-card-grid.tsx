"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextLink } from "@/components/ui/primary-link";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatShortDate } from "@/lib/format";
import { formatDuration } from "@/lib/transcription/media";
import type { ProjectSourceSummary } from "@/lib/transcription/projects";
import { SOURCE_KIND_LABEL, projectStatusMap } from "@/lib/transcription/status";
import type { LibraryClip } from "@/lib/transcription/clips";
import { ClipLibrary } from "@/components/transcription/clip-library";
import { ScopedSearchPanel } from "@/components/transcription/scoped-search-panel";
import { AddSourceModal } from "./add-source-modal";
import { listProjectExcerptsAction, searchProjectAction } from "./workspace-search-actions";

/**
 * Switches between a card grid of every source this project references and
 * the active source's workspace (passed in as `children`, already rendered
 * server-side by the page) — only one is ever visible at a time, standard
 * list/detail behavior: picking a card collapses the grid and reveals that
 * source's workspace. Replaces the old pill row (docs/sourcework-design.md
 * §7.2), which didn't scale visually once a project referenced more than a
 * handful of sources and, unlike this, left the workspace and the switcher
 * both on screen at once.
 *
 * The source's own workspace is meant to read as its own screen, not a tab
 * of a permanent source-management toolbar — "+ Add source" and the source
 * list only make sense while actually picking a source, so they live on the
 * grid, and the workspace instead gets the same breadcrumb-style "back"
 * link the standalone Source Detail page already uses to return to a list
 * (sourcework/sources/[id]/page.tsx's "← Back to sources"). "← Back to
 * projects" (the level above this one) lives only on the grid for the same
 * reason — the page used to show it unconditionally above this component,
 * which stacked two back links while looking at a single source's workspace
 * ("← Back to projects" then "← All sources in this project"); one level of
 * breadcrumb at a time reads better than both at once.
 *
 * Which one you land on is driven by the URL, not a client default: opening
 * a project plain (no ?source=) starts on the list — a project is a
 * collection of sources first, the same reason /sourcework itself opens on
 * a list of projects rather than jumping straight into one — while an
 * explicit ?source= (a card just clicked, a link from search, a deep link)
 * starts straight on that source's workspace.
 *
 * The title bar switches with it: `projectHeader` (title/description edit/
 * "Delete this project") only makes sense while looking at the project as a
 * whole, so it shows on the grid; `sourceHeader` (that source's own title,
 * status, and its Rebuild-index/Remove menu) shows over the workspace,
 * matching the standalone Source Detail page's header instead of leaving the
 * project's title pinned at the top regardless of which source is active.
 * Both are already rendered server-side by the page, same as `children`.
 *
 * The browsing view also carries a Sources/Excerpts tab pair (mirroring
 * /sourcework's own tabs, one level down) and a search box scoped to this
 * project's own sources (docs/sourcework-design.md's search scoping) —
 * `ScopedSearchPanel` swaps the tabs out for ranked results while a query is
 * active. The Excerpts tab's data is fetched lazily, on first click, via a
 * Server Action rather than being SSR'd alongside `sources` — a project's
 * sources can each carry hundreds of excerpts, and most visits to this page
 * never open that tab at all. `ClipLibrary`'s own client-side filter box is
 * turned off here (`showFilter={false}`) — it would just be a second, weaker
 * search box stacked under the ScopedSearchPanel one above it.
 */
export function SourceCardGrid({
  projectId,
  sources,
  activeSourceId,
  startOnList,
  projectHeader,
  sourceHeader,
  children,
}: {
  projectId: string;
  sources: ProjectSourceSummary[];
  activeSourceId: string | null;
  /** True when the URL didn't name a specific source (or named one that no longer exists) — see the comment above. */
  startOnList: boolean;
  projectHeader: ReactNode;
  sourceHeader: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(startOnList);
  const [browseTab, setBrowseTab] = useState<"sources" | "excerpts">("sources");
  const [excerpts, setExcerpts] = useState<LibraryClip[] | null>(null);
  const [isLoadingExcerpts, setIsLoadingExcerpts] = useState(false);

  function handleShowExcerpts() {
    setBrowseTab("excerpts");
    if (excerpts !== null || isLoadingExcerpts) return;
    setIsLoadingExcerpts(true);
    listProjectExcerptsAction(projectId)
      .then((rows) => setExcerpts(rows))
      .finally(() => setIsLoadingExcerpts(false));
  }

  // `children` is server-rendered for whichever source `activeSourceId`
  // names — it only updates once a navigation to a new `?source=` actually
  // completes. Adjusting `isBrowsing` here during render (React's documented
  // pattern for deriving state from a prop change, rather than an effect —
  // see "You Might Not Need an Effect"), keyed on the props that change when
  // that navigation lands, means we never show `false` while `children` is
  // still the previous source's workspace: flipping it eagerly in the
  // card's onClick instead was a flash of the old source before the new one
  // replaced it.
  const navigationKey = `${activeSourceId ?? ""}:${startOnList}`;
  const [prevNavigationKey, setPrevNavigationKey] = useState(navigationKey);
  if (navigationKey !== prevNavigationKey) {
    setPrevNavigationKey(navigationKey);
    setIsBrowsing(startOnList);
  }

  return (
    <div className="mb-4">
      {isBrowsing ? (
        <>
          <div className="mb-5">
            <TextLink href="/sourcework">← Back to projects</TextLink>
          </div>
          {projectHeader}

          <div>
            <ScopedSearchPanel
              placeholder="Search this project's transcripts, documents, and excerpts…"
              onSearch={(query) => searchProjectAction(projectId, query)}
              actions={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsAdding(true)}
                  className="shrink-0"
                >
                  + Add source
                </Button>
              }
            >
              <nav className="mb-4 flex gap-1 border-b border-line">
                <BrowseTabButton
                  label="Sources"
                  active={browseTab === "sources"}
                  onClick={() => setBrowseTab("sources")}
                />
                <BrowseTabButton
                  label={`Excerpts${excerpts ? ` (${excerpts.length})` : ""}`}
                  active={browseTab === "excerpts"}
                  onClick={handleShowExcerpts}
                />
              </nav>

              {browseTab === "sources" && sources.length === 0 ? (
                <EmptyState
                  title="No sources yet"
                  action={
                    <Button type="button" onClick={() => setIsAdding(true)}>
                      Add the first source
                    </Button>
                  }
                >
                  Upload an interview or PDF, or reference one already in the library.
                </EmptyState>
              ) : browseTab === "sources" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sources.map((s) => {
                    const isActive = s.sourceId === activeSourceId;
                    return (
                      <Link
                        key={s.sourceId}
                        href={`/sourcework/${projectId}?source=${s.sourceId}`}
                        scroll={false}
                        className={`flex flex-col gap-2 rounded border p-4 ${
                          isActive
                            ? "border-brand-primary bg-brand-surface"
                            : "border-line bg-white hover:border-brand-primary"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                            {SOURCE_KIND_LABEL[s.source.kind]}
                          </span>
                          <StatusBadge map={projectStatusMap(s.source.kind)} value={s.status} />
                        </div>
                        <p className="font-semibold text-ink-900">{s.source.title}</p>
                        <p className="text-xs text-ink-500">
                          {formatShortDate(s.source.interview_date ?? s.source.created_at, {
                            year: true,
                          })}
                          {s.source.kind === "document"
                            ? s.source.page_count
                              ? ` · ${s.source.page_count} page${s.source.page_count === 1 ? "" : "s"}`
                              : ""
                            : s.source.original_duration_ms
                              ? ` · ${formatDuration(s.source.original_duration_ms)}`
                              : ""}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              ) : isLoadingExcerpts || excerpts === null ? (
                <p className="text-sm text-ink-500">Loading excerpts…</p>
              ) : (
                <ClipLibrary clips={excerpts} showProjectMeta={false} showFilter={false} />
              )}
            </ScopedSearchPanel>
          </div>
        </>
      ) : (
        <>
          <div className="mb-3">
            <Button
              type="button"
              variant="link"
              onClick={() => {
                // Flip the local view immediately (instant, no flash while the
                // navigation below is in flight), but also actually clear
                // `?source=` from the URL — otherwise re-picking the very same
                // source from the grid is a Link to the URL we're already on,
                // which Next treats as a no-op: activeSourceId/startOnList
                // never change, so the navigationKey effect above never fires
                // and clicking the card does nothing.
                setIsBrowsing(true);
                router.push(`/sourcework/${projectId}`, { scroll: false });
              }}
              className="text-brand-link"
            >
              ← All sources in this project ({sources.length})
            </Button>
          </div>
          {sourceHeader}
          {children}
        </>
      )}

      {isAdding && (
        <AddSourceModal
          projectId={projectId}
          hasSources={sources.length > 0}
          onClose={() => setIsAdding(false)}
          onDone={(sourceId) => {
            setIsAdding(false);
            router.push(`/sourcework/${projectId}?source=${sourceId}`);
          }}
        />
      )}
    </div>
  );
}

function BrowseTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
        active
          ? "border-brand-primary text-ink-900"
          : "border-transparent text-ink-500 hover:text-ink-700"
      }`}
    >
      {label}
    </button>
  );
}
