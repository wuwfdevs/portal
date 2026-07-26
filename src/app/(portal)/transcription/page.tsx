import Link from "next/link";
import { requireToolAccess } from "@/lib/auth/authz";
import { listProjects, type TwProject } from "@/lib/transcription/projects";
import { formatBytes, formatDuration } from "@/lib/transcription/media";
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
  searchParams: Promise<{ q?: string }>;
}) {
  await requireToolAccess("transcription");
  const { q } = await searchParams;
  const projects = await listProjects(q);

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

      <form method="get" className="mb-6 max-w-sm">
        <Input type="search" name="q" placeholder="Search projects…" defaultValue={q ?? ""} />
      </form>

      {projects.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          {q ? `No projects match "${q}".` : "No interviews yet. Upload one to get started."}
        </div>
      ) : (
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
      )}
    </div>
  );
}
