import { TabNav } from "@/components/ui/tab-nav";
import { requireToolAccess } from "@/lib/auth/authz";
import { listProjects, listSources } from "@/lib/transcription/projects";
import { listLibraryClips } from "@/lib/transcription/clips";
import { searchArchive, isSemanticSearchConfigured } from "@/lib/transcription/search";
import { SearchResults } from "@/components/transcription/search-results";
import { ClipLibrary } from "@/components/transcription/clip-library";
import { SourceLibrary } from "@/components/transcription/source-library";
import { ProjectTable } from "@/components/transcription/project-table";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";

type Tab = "projects" | "sources" | "clips";

export default async function TranscriptionListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  await requireToolAccess("transcription");
  const { q, tab } = await searchParams;
  const query = q?.trim() ?? "";
  const activeTab: Tab = tab === "clips" ? "clips" : tab === "sources" ? "sources" : "projects";

  // A query searches the whole archive at once — transcripts, clips, and
  // project metadata in one ranked list (design doc §3F) — so it replaces the
  // tab content rather than filtering it. Without a query, the tabs are the
  // browse surface.
  const [results, projects, sources, clips] = await Promise.all([
    query ? searchArchive(query) : Promise.resolve([]),
    !query && activeTab === "projects" ? listProjects() : Promise.resolve([]),
    !query && activeTab === "sources" ? listSources() : Promise.resolve([]),
    !query && activeTab === "clips" ? listLibraryClips() : Promise.resolve([]),
  ]);

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        title="Sourcework"
        description="Every interview here is shared with the rest of the team — search past projects to reuse a quote, or start a new one."
        actions={<PrimaryLink href="/sourcework/new">New project</PrimaryLink>}
        className="mb-8"
      />

      <form method="get" className="mb-6 max-w-xl">
        <Input
          type="search"
          name="q"
          placeholder="Search transcripts, excerpts, and interviews…"
          defaultValue={query}
        />
        <p className="mt-1.5 text-xs text-ink-400">
          {isSemanticSearchConfigured()
            ? "Searches what was said and what it was about — try a topic, not just the exact words."
            : "Searches the words that were said. Topic search switches on once an embeddings key is configured."}
        </p>
      </form>

      {query ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-ink-500">
            <span>
              {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
            </span>
            <TextLink href="/sourcework">Clear search</TextLink>
          </div>
          <SearchResults results={results} query={query} />
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
            <ProjectTable projects={projects} />
          )}
        </>
      )}
    </div>
  );
}
