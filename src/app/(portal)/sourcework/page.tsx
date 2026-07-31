import Link from "next/link";
import { requireToolAccess } from "@/lib/auth/authz";
import { listProjects, listSources } from "@/lib/transcription/projects";
import { listLibraryClips } from "@/lib/transcription/clips";
import { searchArchive, isSemanticSearchConfigured } from "@/lib/transcription/search";
import { SearchResults } from "@/components/transcription/search-results";
import { ClipLibrary } from "@/components/transcription/clip-library";
import { SourceLibrary } from "@/components/transcription/source-library";
import { ProjectTable } from "@/components/transcription/project-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 font-serif text-[28px] font-bold text-ink-900">
            Sourcework
          </h1>
          <p className="max-w-xl text-[15px] text-ink-500">
            Every interview here is shared with the rest of the team — search past projects to reuse
            a quote, or start a new one.
          </p>
        </div>
        <Link href="/sourcework/new">
          <Button>New project</Button>
        </Link>
      </div>

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
            <Link href="/sourcework" className="text-xs font-semibold text-brand-link">
              Clear search
            </Link>
          </div>
          <SearchResults results={results} query={query} />
        </>
      ) : (
        <>
          <nav className="mb-5 flex gap-1 border-b border-line">
            <TabLink tab="projects" activeTab={activeTab} label="Projects" />
            <TabLink tab="sources" activeTab={activeTab} label="Sources" />
            <TabLink tab="clips" activeTab={activeTab} label="Excerpts" />
          </nav>

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

function TabLink({ tab, activeTab, label }: { tab: Tab; activeTab: Tab; label: string }) {
  const isActive = tab === activeTab;
  return (
    <Link
      href={tab === "projects" ? "/sourcework" : `/sourcework?tab=${tab}`}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
        isActive
          ? "border-brand-primary text-ink-900"
          : "border-transparent text-ink-500 hover:text-ink-700"
      }`}
    >
      {label}
    </Link>
  );
}
