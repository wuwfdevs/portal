import { redirect } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";
import { requireSourceworkContext } from "@/lib/sourcework/access";
import {
  countProjectFilters,
  listProjectsPage,
  listSources,
  parseProjectListFilter,
  type ProjectListFilter,
} from "@/lib/transcription/projects";
import { listLibraryClips } from "@/lib/transcription/clips";
import { searchArchive, isSemanticSearchConfigured } from "@/lib/transcription/search";
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
import { FilterChips } from "@/components/ui/filter-chips";
import { Input } from "@/components/ui/input";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { PrimaryLink, SecondaryLink, TextLink } from "@/components/ui/primary-link";
import { pluralize } from "@/lib/format";
import { withQuery } from "@/lib/paths";

type Tab = "projects" | "sources" | "clips";

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
    filter?: string;
    kind?: string;
    page?: string;
  }>;
}) {
  const { profile, isEditor } = await requireSourceworkContext();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const activeTab: Tab =
    params.tab === "clips" ? "clips" : params.tab === "sources" ? "sources" : "projects";
  const filter = parseProjectListFilter(params.filter);
  const kind = parseSearchKind(params.kind);
  const pageNumber = parsePage(params.page);
  const showProjects = !query && activeTab === "projects";

  // A query searches the whole archive at once — transcripts, clips, and
  // project metadata in one ranked list (design doc §3F) — so it replaces the
  // tab content rather than filtering it. Without a query, the tabs are the
  // browse surface.
  const [results, projectPage, filterCounts, sources, clips] = await Promise.all([
    query ? searchArchive(query) : Promise.resolve([]),
    showProjects
      ? listProjectsPage({ filter, userId: profile.id, page: pageNumber })
      : Promise.resolve(null),
    showProjects ? countProjectFilters(profile.id) : Promise.resolve(null),
    !query && activeTab === "sources" ? listSources() : Promise.resolve([]),
    !query && activeTab === "clips" ? listLibraryClips() : Promise.resolve([]),
  ]);

  const info = pageInfo(pageNumber, projectPage?.total ?? 0);
  if (projectPage && isPastLastPage(info)) {
    redirect(pageHref("/sourcework", { filter: filter === "all" ? null : filter }, info.pageCount));
  }

  const kindCounts = countResultsByKind(results);
  const kindResults = filterResultsByKind(results, kind);
  const searchHref = (value: string) =>
    withQuery("/sourcework", { q: query, kind: value === "all" ? null : value });

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        title="Sourcework"
        description="Every interview here is shared with the rest of the team — search past projects to reuse a quote, or start a new one."
        className="mb-8"
        actions={
          isEditor ? (
            <SecondaryLink href="/sourcework/editors">Research prompts</SecondaryLink>
          ) : undefined
        }
      />

      <form method="get" className="mb-6 max-w-xl">
        <Input
          type="search"
          name="q"
          placeholder="Search transcripts, excerpts, and interviews…"
          defaultValue={query}
          aria-label="Search the archive"
        />
        {/* Whether topic search is on is an administrator's concern; a
            reporter just gets better results when it is. */}
        <p className="mt-1.5 text-xs text-ink-400">
          {isSemanticSearchConfigured()
            ? "Searches what was said and what it was about — try a topic, not just the exact words."
            : profile.platform_role === "administrator"
              ? "Searches the words that were said. Topic search switches on once an embeddings key is configured."
              : "Searches the words that were said."}
        </p>
      </form>

      {query ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-ink-500">
            <span>
              {pluralize(results.length, "result")} for &ldquo;{query}&rdquo;
            </span>
            <TextLink href="/sourcework">Clear search</TextLink>
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
      ) : (
        <>
          <TabNav
            className="mb-5"
            tabs={[
              { href: "/sourcework", label: "Projects", active: activeTab === "projects" },
              {
                href: "/sourcework?tab=sources",
                label: "Sources",
                active: activeTab === "sources",
              },
              { href: "/sourcework?tab=clips", label: "Excerpts", active: activeTab === "clips" },
            ]}
          />

          {activeTab === "clips" ? (
            <ClipLibrary clips={clips} />
          ) : activeTab === "sources" ? (
            <SourceLibrary sources={sources} />
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
                        href: pageHref(
                          "/sourcework",
                          { filter: value === "all" ? null : value },
                          1,
                        ),
                        active: filter === value,
                      })),
                    },
                  ]}
                >
                  <PrimaryLink href="/sourcework/new">
                    <span>
                      + New<span className="max-sm:sr-only"> project</span>
                    </span>
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
        </>
      )}
    </div>
  );
}
