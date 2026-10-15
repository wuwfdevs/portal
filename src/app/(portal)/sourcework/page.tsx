import Link from "next/link";
import { redirect } from "next/navigation";
import { SourceworkTabs } from "./sourcework-tabs";
import { requireSourceworkContext } from "@/lib/sourcework/access";
import {
  countProjectFilters,
  listProjectsPage,
  listSources,
  parseProjectListFilter,
  type ProjectListFilter,
} from "@/lib/transcription/projects";
import { listLibraryClips } from "@/lib/transcription/clips";
import {
  DEFAULT_LIMIT as SEARCH_RESULT_LIMIT,
  searchArchive,
  isSemanticSearchConfigured,
} from "@/lib/transcription/search";
import {
  SEARCH_KIND_FILTERS,
  countResultsByKind,
  filterResultsByKind,
  parseSearchKind,
} from "@/lib/transcription/search-groups";
import { isPastLastPage, pageHref, pageInfo, parsePage } from "@/lib/pagination";
import { GroupedSearchResults } from "@/components/transcription/search-results";
import { ClipLibrary } from "@/components/transcription/clip-library";
import { SourceLibrary } from "@/components/transcription/source-library";
import { ProjectTable } from "@/components/transcription/project-table";
import { DismissibleHint } from "@/components/ui/dismissible-hint";
import { FilterChips } from "@/components/ui/filter-chips";
import { NotebookSearchForm } from "@/components/transcription/notebook-search";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { SubNav } from "@/components/ui/sub-nav";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { formatShortDate, pluralize } from "@/lib/format";
import { withQuery } from "@/lib/paths";
import { notebookPath, projectPath } from "@/lib/transcription/links";

type Tab = "projects" | "notebook";
type NotebookView = "sources" | "excerpts";

const FILTER_LABEL: Record<ProjectListFilter, string> = {
  all: "All",
  mine: "Started by me",
  attention: "Needs attention",
  empty: "No sources",
};

const EMPTY_MESSAGE: Record<ProjectListFilter, string> = {
  all: "No projects yet. Start one, then add interviews and documents to it.",
  mine: "You haven’t started any projects yet.",
  attention:
    "Nothing needs attention: every source is processed and no data points are waiting for review.",
  empty: "Every project has at least one source.",
};

export default async function TranscriptionListPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    tab?: string;
    view?: string;
    filter?: string;
    kind?: string;
    page?: string;
  }>;
}) {
  const { profile, isEditor } = await requireSourceworkContext();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  // `sources` and `clips` are the two tabs the Notebook replaced; old links and bookmarks still
  // land on the right view. A query always belongs to the Notebook, wherever the link came from.
  const legacyView: NotebookView | null =
    params.tab === "clips" ? "excerpts" : params.tab === "sources" ? "sources" : null;
  const activeTab: Tab = query || params.tab === "notebook" || legacyView ? "notebook" : "projects";
  const notebookView: NotebookView =
    params.view === "excerpts" || legacyView === "excerpts" ? "excerpts" : "sources";
  const filter = parseProjectListFilter(params.filter);
  const kind = parseSearchKind(params.kind);
  const pageNumber = parsePage(params.page);
  const showProjects = activeTab === "projects";

  // A query searches the whole archive at once — transcripts, clips, and
  // project metadata in one ranked list (design doc §3F) — so it replaces the
  // tab content rather than filtering it. Without a query, the tabs are the
  // browse surface.
  // The first page of the plain list opens on what is waiting for a person: a failed source or
  // findings to decide. It is a shortcut into the list's own "Needs attention" filter, not a
  // second list, so it is read only where it would show.
  const showAttention = showProjects && filter === "all" && pageNumber === 1;
  const [results, projectPage, filterCounts, sources, clips, attentionPage] = await Promise.all([
    query ? searchArchive(query) : Promise.resolve([]),
    showProjects
      ? listProjectsPage({ filter, userId: profile.id, page: pageNumber })
      : Promise.resolve(null),
    showProjects ? countProjectFilters(profile.id) : Promise.resolve(null),
    !query && activeTab === "notebook" && notebookView === "sources"
      ? listSources()
      : Promise.resolve([]),
    !query && activeTab === "notebook" && notebookView === "excerpts"
      ? listLibraryClips()
      : Promise.resolve([]),
    showAttention
      ? listProjectsPage({ filter: "attention", userId: profile.id, page: 1 })
      : Promise.resolve(null),
  ]);
  // What needs a person first, then the most recently active projects to fill the strip to three.
  const needsYou = attentionPage?.rows.slice(0, 3) ?? [];
  const resumeRows = [
    ...needsYou,
    ...(projectPage?.rows.filter((row) => !needsYou.some((other) => other.id === row.id)) ?? []),
  ].slice(0, 3);

  const info = pageInfo(pageNumber, projectPage?.total ?? 0);
  if (projectPage && isPastLastPage(info)) {
    redirect(pageHref("/sourcework", { filter: filter === "all" ? null : filter }, info.pageCount));
  }

  const kindCounts = countResultsByKind(results);
  const kindResults = filterResultsByKind(results, kind);
  const searchHref = (value: string) =>
    withQuery("/sourcework", {
      tab: "notebook",
      view: notebookView === "excerpts" ? "excerpts" : null,
      q: query,
      kind: value === "all" ? null : value,
    });

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader size="page" title="Sourcework" className="mb-6" />

      <DismissibleHint id="sourcework-shared" className="mb-6">
        Every interview here is shared with the rest of the team. Search the notebook to reuse a
        quote, or start a new project.
      </DismissibleHint>

      {resumeRows.length > 0 && (
        <section aria-labelledby="resume" className="mb-8">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="resume" className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
              Pick up where you left off
            </h2>
            {(filterCounts?.attention ?? 0) > 0 && (
              <TextLink href={pageHref("/sourcework", { filter: "attention" }, 1)}>
                {pluralize(filterCounts?.attention ?? 0, "project needs", "projects need")} you
              </TextLink>
            )}
          </div>
          <ul className="-mx-6 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 pb-2 sm:-mx-10 sm:scroll-px-10 sm:px-10 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
            {resumeRows.map((row) => {
              const failed = row.failedCount > 0;
              const waiting = row.reviewCount > 0;
              return (
                <li
                  key={row.id}
                  className="w-[78%] max-w-sm shrink-0 snap-start md:w-auto md:max-w-none"
                >
                  <Link
                    href={
                      failed
                        ? projectPath(row.id)
                        : waiting
                          ? projectPath(row.id, "review")
                          : projectPath(row.id)
                    }
                    className={
                      failed
                        ? "flex h-full flex-col gap-1.5 rounded border border-danger/40 bg-danger/[0.04] p-4 hover:border-danger"
                        : "flex h-full flex-col gap-1.5 rounded border border-line bg-white p-4 hover:border-brand-primary"
                    }
                  >
                    <span
                      className={
                        failed
                          ? "text-[10px] font-bold uppercase tracking-wider text-danger"
                          : "text-[10px] font-bold uppercase tracking-wider text-brand-link"
                      }
                    >
                      {failed
                        ? `${pluralize(row.failedCount, "source")} failed to process`
                        : waiting
                          ? `Review · ${row.reviewCount} waiting`
                          : "Recent"}
                    </span>
                    <span className="font-semibold text-ink-900">{row.title}</span>
                    <span className="text-xs text-ink-500">
                      Last activity {formatShortDate(row.lastActivity, { year: true })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <SourceworkTabs className="mb-5" active={activeTab} isEditor={isEditor} />

      {activeTab === "notebook" ? (
        <>
          <SubNav
            label="Notebook sections"
            items={[
              {
                href: notebookPath(),
                label: "Sources",
                active: !query && notebookView === "sources",
              },
              {
                href: notebookPath("excerpts"),
                label: "Excerpts",
                active: !query && notebookView === "excerpts",
              },
            ]}
          />
          {isSemanticSearchConfigured() ? (
            <DismissibleHint id="sourcework-search" className="mb-4">
              Search finds what was said and what it was about, so try a topic, not just the exact
              words.
            </DismissibleHint>
          ) : (
            // Whether topic search is on is an administrator's concern; a reporter just gets
            // better results when it is. This line is a status, not a how-to, so it stays.
            profile.platform_role === "administrator" && (
              <p className="mb-4 text-xs text-ink-400">
                Searches the words that were said. Topic search switches on once an embeddings key
                is configured.
              </p>
            )
          )}

          {/* One search box. In Sources it is part of the list, which also narrows by title as
              you type; everywhere else it stands alone above the results or the excerpts. */}
          {!query && notebookView === "sources" ? (
            <SourceLibrary sources={sources} />
          ) : (
            <NotebookSearchForm
              className="mb-4"
              view={notebookView === "excerpts" ? "excerpts" : undefined}
              defaultValue={query}
            />
          )}

          {query ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-ink-500">
                <span>
                  {results.length >= SEARCH_RESULT_LIMIT
                    ? `Top ${results.length} results`
                    : pluralize(results.length, "result")}{" "}
                  for &ldquo;{query}&rdquo;
                  {results.length >= SEARCH_RESULT_LIMIT &&
                    " — there may be more. Try a more specific search to narrow them."}
                </span>
                <TextLink href={notebookPath(notebookView === "excerpts" ? "excerpts" : undefined)}>
                  Clear search
                </TextLink>
              </div>
              {results.length > 0 && (
                <FilterChips
                  label="Kind of result"
                  className="mb-5"
                  chips={SEARCH_KIND_FILTERS.filter(
                    (entry) => entry.value === "all" || kindCounts[entry.value] > 0,
                  ).map((entry) => ({
                    label: entry.label,
                    count: kindCounts[entry.value],
                    href: searchHref(entry.value),
                    active: kind === entry.value,
                  }))}
                />
              )}
              <GroupedSearchResults results={kindResults} query={query} />
            </>
          ) : notebookView === "excerpts" ? (
            <ClipLibrary clips={clips} showFilter={false} />
          ) : null}
        </>
      ) : (
        projectPage &&
        filterCounts && (
          <>
            <ListToolbar
              className="mb-4"
              filters={[
                {
                  label: "Show",
                  chips: (Object.keys(FILTER_LABEL) as ProjectListFilter[]).map((value) => ({
                    label: FILTER_LABEL[value],
                    count: filterCounts[value],
                    href: pageHref("/sourcework", { filter: value === "all" ? null : value }, 1),
                    active: filter === value,
                  })),
                },
              ]}
            >
              <PrimaryLink href="/sourcework/new">
                <span>+ New project</span>
              </PrimaryLink>
            </ListToolbar>
            <ProjectTable
              rows={projectPage.rows}
              currentUserId={profile.id}
              emptyMessage={EMPTY_MESSAGE[filter]}
            />
            <Pagination
              info={info}
              path="/sourcework"
              params={{ filter: filter === "all" ? null : filter }}
              noun="projects"
            />
          </>
        )
      )}
    </div>
  );
}
