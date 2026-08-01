import Link from "next/link";
import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { getProjectById, getTranscriptForRepresentation, processingLabel } from "@/lib/transcription/projects";
import { listExcerptsForSource } from "@/lib/transcription/clips";
import { listDocumentExcerptsForSource } from "@/lib/transcription/document-excerpts";
import { getDocumentContentForRepresentation } from "@/lib/transcription/document-content";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { isVideoContentType, formatBytes, formatDuration } from "@/lib/transcription/media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { retryTranscription } from "../actions";
import { DeleteProjectButton } from "../delete-project-button";
import { TranscriptWorkspace } from "./transcript-workspace";
import { DocumentWorkspace } from "./document-workspace";
import { ProcessingPoller } from "./processing-poller";
import { ProjectDetails } from "./project-details";
import { ReindexButton } from "./reindex-button";
import { SourceCardGrid } from "./source-card-grid";

// See new/page.tsx's comment on why this lives on the page rather than in
// actions.ts, and docs/sourcework-design.md §8.6 on why it's needed at all:
// the retry action here can kick off a Mistral OCR call via after().
export const maxDuration = 300;

export default async function TranscriptionProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; clip?: string; source?: string; page?: string }>;
}) {
  const { profile } = await requireToolAccess("transcription");
  const { id } = await params;
  const { t, clip, source: sourceParam, page } = await searchParams;
  // ?t= arrives from a search result or a clip in the library; anything that
  // isn't a plain number is ignored rather than trusted into a seek.
  const initialSeekMs = t !== undefined && /^\d+$/.test(t) ? Number(t) : null;
  const initialPage = page !== undefined && /^\d+$/.test(page) ? Number(page) : null;
  const project = await getProjectById(id);
  if (!project) notFound();

  const canDelete = project.createdBy === profile.id;
  // ?source= picks which pill is showing; absent (or unknown) falls back to
  // the earliest-attached source — same "primary" this project always had
  // before a second source could be attached (docs/sourcework-design.md §7).
  const activeSourceSummary =
    project.sources.find((s) => s.sourceId === sourceParam) ?? project.sources[0] ?? null;
  const source = activeSourceSummary?.source ?? null;
  const transcriptRepresentation = activeSourceSummary?.transcript ?? null;
  const activeStatus = activeSourceSummary?.status ?? "uploading";
  const hasMedia = Boolean(source?.original_storage_path);
  const isDocument = source?.kind === "document";

  const [signedUrl, transcript, clips, documentContent, documentExcerpts] = await Promise.all([
    activeStatus === "ready" && source?.original_storage_path
      ? getSignedMediaUrl(source.original_storage_path)
      : Promise.resolve(null),
    !isDocument && activeStatus === "ready" && transcriptRepresentation
      ? getTranscriptForRepresentation(transcriptRepresentation.id)
      : Promise.resolve({ segments: [], speakers: [] }),
    !isDocument && activeStatus === "ready" && activeSourceSummary
      ? listExcerptsForSource(activeSourceSummary.sourceId)
      : Promise.resolve([]),
    isDocument && activeStatus === "ready" && transcriptRepresentation
      ? getDocumentContentForRepresentation(transcriptRepresentation.id)
      : Promise.resolve({ pages: [], blocks: [] }),
    isDocument && activeStatus === "ready" && activeSourceSummary
      ? listDocumentExcerptsForSource(activeSourceSummary.sourceId)
      : Promise.resolve([]),
  ]);

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-5">
        <Link href="/sourcework" className="text-xs font-semibold text-brand-link">
          ← Back to projects
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 font-serif text-[22px] font-bold text-ink-900">{project.title}</h1>
          {project.description ? (
            <p className="mb-1.5 max-w-xl text-sm text-ink-500">{project.description}</p>
          ) : (
            <p className="mb-1.5 max-w-xl text-sm italic text-ink-400">
              No background yet — a note here is what tells someone finding a quote from this
              recording in two years what it was.
            </p>
          )}
          <ProjectDetails
            projectId={project.id}
            title={project.title}
            description={project.description}
            interviewDate={source?.interview_date ?? null}
          />
        </div>
        <StatusBadge status={project.status} kind={source?.kind ?? "audio_video"} />
      </div>

      {project.sources.length > 0 && (
        <SourceCardGrid
          projectId={project.id}
          sources={project.sources}
          activeSourceId={activeSourceSummary?.sourceId ?? null}
        />
      )}

      {activeStatus === "ready" && isDocument && (
        <div className="rounded border border-line bg-white p-5">
          {signedUrl && activeSourceSummary ? (
            <DocumentWorkspace
              sourceId={activeSourceSummary.sourceId}
              representationId={transcriptRepresentation?.id ?? null}
              fileUrl={signedUrl}
              pages={documentContent.pages}
              blocks={documentContent.blocks}
              excerpts={documentExcerpts}
              initialPage={initialPage}
            />
          ) : (
            <p className="text-sm text-ink-500">
              Couldn&apos;t load the document right now. Reload the page to try again.
            </p>
          )}
          {source?.page_count && (
            <dl className="mt-4 flex gap-6 text-xs text-ink-500">
              <div>
                <dt className="font-semibold text-ink-700">Pages</dt>
                <dd>{source.page_count}</dd>
              </div>
              {source.original_size_bytes && (
                <div>
                  <dt className="font-semibold text-ink-700">File size</dt>
                  <dd>{formatBytes(source.original_size_bytes)}</dd>
                </div>
              )}
            </dl>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {canDelete && <DeleteProjectButton projectId={project.id} />}
          </div>
        </div>
      )}

      {activeStatus === "ready" && !isDocument && (
        <div className="rounded border border-line bg-white p-5">
          {signedUrl && activeSourceSummary ? (
            <TranscriptWorkspace
              projectId={project.id}
              sourceId={activeSourceSummary.sourceId}
              representationId={transcriptRepresentation?.id ?? null}
              projectTitle={project.title}
              interviewDate={source?.interview_date ?? null}
              exportDate={source?.interview_date ?? project.createdAt}
              mediaUrl={signedUrl}
              isVideo={isVideoContentType(source?.original_content_type ?? "")}
              segments={transcript.segments}
              speakers={transcript.speakers}
              clips={clips}
              initialSeekMs={initialSeekMs}
              highlightClipId={clip ?? null}
            />
          ) : (
            <p className="text-sm text-ink-500">
              Couldn&apos;t load the media right now. Reload the page to try again.
            </p>
          )}
          <dl className="mt-4 flex gap-6 text-xs text-ink-500">
            {source?.original_duration_ms && (
              <div>
                <dt className="font-semibold text-ink-700">Duration</dt>
                <dd>{formatDuration(source.original_duration_ms)}</dd>
              </div>
            )}
            {source?.original_size_bytes && (
              <div>
                <dt className="font-semibold text-ink-700">File size</dt>
                <dd>{formatBytes(source.original_size_bytes)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <ReindexButton projectId={project.id} />
            {canDelete && <DeleteProjectButton projectId={project.id} />}
          </div>
        </div>
      )}

      {activeStatus === "uploading" && (
        <div className="max-w-lg rounded border border-dashed border-line p-5 text-sm text-ink-500">
          This project doesn&apos;t have any {isDocument ? "document" : "media"} yet — either an
          upload is still running in another tab, or it was interrupted.
          {canDelete && (
            <DeleteProjectButton
              projectId={project.id}
              warning="This removes the project and anything already uploaded for it."
            />
          )}
        </div>
      )}

      {activeStatus === "processing" && (
        <div className="max-w-lg rounded border border-line bg-panel-50 p-5 text-sm text-ink-500">
          {processingLabel(source?.kind ?? "audio_video")} — this can take a few minutes for a{" "}
          {isDocument ? "large document" : "long recording"}. This page will show the result as
          soon as it&apos;s ready; you can also leave and come back.
          <ProcessingPoller />
        </div>
      )}

      {activeStatus === "failed" && (
        <div className="max-w-lg rounded border border-line bg-white p-5">
          <p className="text-sm text-ink-700">
            {source?.error_message ??
              transcriptRepresentation?.error_message ??
              "Something went wrong with this project."}
          </p>
          {hasMedia && (
            <RetryForm projectId={project.id} sourceId={activeSourceSummary?.sourceId ?? null} />
          )}
          {canDelete && (
            <DeleteProjectButton
              projectId={project.id}
              label={hasMedia ? "Delete this project" : "Delete and try again"}
              warning="This removes the project and anything already uploaded for it."
            />
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  kind,
}: {
  status: "uploading" | "processing" | "ready" | "failed";
  kind: "audio_video" | "document";
}) {
  const map = {
    ready: { label: "Ready", variant: "accent" as const },
    uploading: { label: "Uploading", variant: "neutral" as const },
    processing: { label: processingLabel(kind), variant: "neutral" as const },
    failed: { label: "Failed", variant: "danger" as const },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function RetryForm({ projectId, sourceId }: { projectId: string; sourceId: string | null }) {
  return (
    <form action={retryTranscription} className="mt-4">
      <input type="hidden" name="project_id" value={projectId} />
      {sourceId && <input type="hidden" name="source_id" value={sourceId} />}
      <Button type="submit" variant="secondary">
        Retry
      </Button>
    </form>
  );
}
