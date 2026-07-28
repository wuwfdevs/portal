import Link from "next/link";
import { requireToolAccess } from "@/lib/auth/authz";
import { listProjects, type TwProject } from "@/lib/transcription/projects";
import { listLibraryClips } from "@/lib/transcription/clips";
import { searchArchive, isSemanticSearchConfigured } from "@/lib/transcription/search";
import { formatBytes, formatDuration } from "@/lib/transcription/media";
import { SearchResults } from "@/components/transcription/search-results";
import { ClipLibrary } from "@/components/transcription/clip-library";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TwProjectStatus } from "@/lib/database.types";

const STATUS_BADGE: Record<
  TwProjectStatus,
  { label: string; variant: "accent" | "neutral" | "muted" | "danger" }
> = {
  ready: { label: "Ready", variant: "accent" },
  uploading: { label: "Uploading", variant: "neutral" },
  processing: { label: "Transcribing", variant: "neutral" },
  failed: { label: "Failed", variant: "danger" },
};

type Tab = "projects" | "clips";

function formatInterviewDate(project: TwProject): string {
  const source = project.interview_date ?? project.created_at;
  return new Date(source).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function TranscriptionListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  await requireToolAccess("transcription");
  const { q, tab } = await searchParams;
  const query = q?.trim() ?? "";
  const activeTab: Tab = tab === "clips" ? "clips" : "projects";

  // A query searches the whole archive at once — transcripts, clips, and
  // project metadata in one ranked list (design doc §3F) — so it replaces the
  // tab content rather than filtering it. Without a query, the tabs are the
  // browse surface.
  const [results, projects, clips] = await Promise.all([
    query ? searchArchive(query) : Promise.resolve([]),
    !query && activeTab === "projects" ? listProjects() : Promise.resolve([]),
    !query && activeTab === "clips" ? listLibraryClips() : Promise.resolve([]),
  ]);

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 font-serif text-[28px] font-bold text-ink-900">
            Transcription Workspace
          </h1>
          <p className="max-w-xl text-[15px] text-ink-500">
            Every interview here is shared with the rest of the team — search past projects to reuse
            a quote, or start a new one.
          </p>
        </div>
        <Link href="/transcription/new">
          <Button>New project</Button>
        </Link>
      </div>

      <form method="get" className="mb-6 max-w-xl">
        <Input
          type="search"
          name="q"
          placeholder="Search transcripts, clips, and interviews…"
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
            <Link href="/transcription" className="text-xs font-semibold text-brand-link">
              Clear search
            </Link>
          </div>
          <SearchResults results={results} query={query} />
        </>
      ) : (
        <>
          <nav className="mb-5 flex gap-1 border-b border-line">
            <TabLink tab="projects" activeTab={activeTab} label="Projects" />
            <TabLink tab="clips" activeTab={activeTab} label="Clips" />
          </nav>

          {activeTab === "clips" ? (
            <ClipLibrary clips={clips} />
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
      href={tab === "projects" ? "/transcription" : `/transcription?tab=${tab}`}
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

function ProjectTable({ projects }: { projects: TwProject[] }) {
  if (projects.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No interviews yet. Upload one to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-line">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line bg-panel-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500">
            <th className="px-4 py-2.5">Title</th>
            <th className="px-4 py-2.5">Interview date</th>
            <th className="px-4 py-2.5">Duration</th>
            <th className="px-4 py-2.5">Size</th>
            <th className="px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const badge = STATUS_BADGE[project.status];
            return (
              <tr
                key={project.id}
                className="border-b border-line last:border-b-0 hover:bg-panel-50"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/transcription/${project.id}`}
                    className="font-semibold text-brand-link"
                  >
                    {project.title}
                  </Link>
                  {project.description && (
                    <p className="mt-0.5 max-w-md truncate text-xs text-ink-400">
                      {project.description}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-500">{formatInterviewDate(project)}</td>
                <td className="px-4 py-3 text-ink-500">
                  {project.media_duration_ms ? formatDuration(project.media_duration_ms) : "—"}
                </td>
                <td className="px-4 py-3 text-ink-500">
                  {project.media_size_bytes ? formatBytes(project.media_size_bytes) : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
