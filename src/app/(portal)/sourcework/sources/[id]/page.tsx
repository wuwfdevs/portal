import Link from "next/link";
import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import {
  getSourceDetail,
  getTranscriptForRepresentation,
  type ProjectStatus,
} from "@/lib/transcription/projects";
import { listExcerptsForSource } from "@/lib/transcription/clips";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { isVideoContentType, formatBytes, formatDuration } from "@/lib/transcription/media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { retryTranscription } from "../../actions";
import { TranscriptWorkspace } from "../../[id]/transcript-workspace";
import { ProcessingPoller } from "../../[id]/processing-poller";
import type { SwSourceKind } from "@/lib/database.types";

const KIND_LABEL: Record<SwSourceKind, string> = {
  audio_video: "Audio",
};

/**
 * One source, independent of any project (docs/sourcework-design.md §7.2) —
 * reachable without going through a project first. Shows the same working
 * surface (player, transcript, clip rail/composer) the project workspace
 * shows for this source's active pill — not a separate, thinner summary of
 * it — plus the one thing genuinely specific to viewing a source on its
 * own: which project(s) reference it.
 *
 * There is deliberately no "representation chain" widget here anymore: with
 * exactly one source kind and one pipeline (audio → transcript) in this
 * codebase, a dedicated chain visualization would only be drawing the same
 * two-node shape every time. It's worth building once Phase 3b adds a real
 * second link (OCR, then translate) to actually chain.
 */
export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireToolAccess("transcription");
  const { id } = await params;

  const source = await getSourceDetail(id);
  if (!source) notFound();

  // The project a source-scoped action (retry, excerpt creation) revalidates
  // and links through — earliest-attached, same convention
  // getPrimaryProjectIdForSource uses elsewhere. Every source reaches this
  // page having been created through some project's upload flow, so this is
  // null only if that project was since deleted.
  const primaryProjectId = source.projects[0]?.id ?? null;
  const hasMedia = Boolean(source.originalStoragePath);

  const [signedUrl, transcript, excerpts] = await Promise.all([
    source.status === "ready" && source.originalStoragePath
      ? getSignedMediaUrl(source.originalStoragePath)
      : Promise.resolve(null),
    source.status === "ready" && source.transcript
      ? getTranscriptForRepresentation(source.transcript.id)
      : Promise.resolve({ segments: [], speakers: [] }),
    listExcerptsForSource(id),
  ]);

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-5">
        <Link href="/sourcework?tab=sources" className="text-xs font-semibold text-brand-link">
          ← Back to sources
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-400">
            {KIND_LABEL[source.kind] ?? source.kind}
          </span>
          <h1 className="mb-1.5 font-serif text-[22px] font-bold text-ink-900">{source.title}</h1>
          <p className="text-xs text-ink-500">
            {source.interviewDate &&
              new Date(source.interviewDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            {source.durationMs ? ` · ${formatDuration(source.durationMs)}` : ""}
            {source.sizeBytes ? ` · ${formatBytes(source.sizeBytes)}` : ""}
          </p>
        </div>
        <StatusBadge status={source.status} />
      </div>

      <section className="mb-6">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-500">
          Used in {source.projects.length} project{source.projects.length === 1 ? "" : "s"}
        </h2>
        {source.projects.length === 0 ? (
          <p className="text-sm text-ink-500">Not attached to any project yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
            {source.projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/sourcework/${project.id}?source=${id}`}
                  className="text-sm font-semibold text-brand-link"
                >
                  {project.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {source.status === "ready" && (
        <div className="rounded border border-line bg-white p-5">
          {signedUrl && primaryProjectId ? (
            <TranscriptWorkspace
              projectId={primaryProjectId}
              sourceId={id}
              representationId={source.transcript?.id ?? null}
              projectTitle={source.title}
              interviewDate={source.interviewDate}
              exportDate={source.interviewDate ?? source.createdAt}
              mediaUrl={signedUrl}
              isVideo={isVideoContentType(source.originalContentType ?? "")}
              segments={transcript.segments}
              speakers={transcript.speakers}
              clips={excerpts}
            />
          ) : (
            <p className="text-sm text-ink-500">
              {primaryProjectId
                ? "Couldn't load the media right now. Reload the page to try again."
                : "This source isn't attached to a project, so there's nothing to open here."}
            </p>
          )}
        </div>
      )}

      {source.status === "uploading" && (
        <div className="max-w-lg rounded border border-dashed border-line p-5 text-sm text-ink-500">
          This source doesn&apos;t have any media yet — either an upload is still running in another
          tab, or it was interrupted.
        </div>
      )}

      {source.status === "processing" && (
        <div className="max-w-lg rounded border border-line bg-panel-50 p-5 text-sm text-ink-500">
          Transcribing — this can take a few minutes for a long recording. This page will show the
          transcript as soon as it&apos;s ready; you can also leave and come back.
          <ProcessingPoller />
        </div>
      )}

      {source.status === "failed" && (
        <div className="max-w-lg rounded border border-line bg-white p-5">
          <p className="text-sm text-ink-700">
            {source.errorMessage ??
              source.transcript?.error_message ??
              "Something went wrong with this source."}
          </p>
          {hasMedia && primaryProjectId && (
            <RetryForm projectId={primaryProjectId} sourceId={id} returnTo={`/sourcework/sources/${id}`} />
          )}
        </div>
      )}

      {/* Once the source is ready, the workspace's clip rail above already
          shows every excerpt for this source — this flat list is only for
          the states where that rail isn't rendered, e.g. excerpts made
          before a re-transcription attempt that's since failed. */}
      {source.status !== "ready" && excerpts.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-500">
            Excerpts from this source
          </h2>
          <ul className="flex flex-col gap-3">
            {excerpts.map((excerpt) => (
              <li key={excerpt.id} className="rounded border border-line bg-white p-4">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink-900">{excerpt.title}</span>
                  <span className="text-xs text-ink-400">
                    {formatDuration(excerpt.startMs)}–{formatDuration(excerpt.endMs)}
                    {excerpt.hasExport && " · exported"}
                  </span>
                </div>
                {excerpt.excerpt && (
                  <p className="line-clamp-2 text-sm text-ink-700">{excerpt.excerpt}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const map = {
    ready: { label: "Ready", variant: "accent" as const },
    uploading: { label: "Uploading", variant: "neutral" as const },
    processing: { label: "Transcribing", variant: "neutral" as const },
    failed: { label: "Failed", variant: "danger" as const },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function RetryForm({
  projectId,
  sourceId,
  returnTo,
}: {
  projectId: string;
  sourceId: string;
  returnTo: string;
}) {
  return (
    <form action={retryTranscription} className="mt-4">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="source_id" value={sourceId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <Button type="submit" variant="secondary">
        Retry transcription
      </Button>
    </form>
  );
}
