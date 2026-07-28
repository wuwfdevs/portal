import Link from "next/link";
import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { getProjectById, getTranscriptForProject } from "@/lib/transcription/projects";
import { listClipsForProject } from "@/lib/transcription/clips";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { getSearchIndexStatus } from "@/lib/transcription/indexing";
import { createClient } from "@/lib/supabase/server";
import { isVideoContentType, formatBytes, formatDuration } from "@/lib/transcription/media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { retryTranscription } from "../actions";
import { DeleteProjectButton } from "../delete-project-button";
import { TranscriptWorkspace } from "./transcript-workspace";
import { ProcessingPoller } from "./processing-poller";
import { ProjectDetails } from "./project-details";
import { ReindexButton } from "./reindex-button";

export default async function TranscriptionProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; clip?: string }>;
}) {
  const { profile } = await requireToolAccess("transcription");
  const { id } = await params;
  const { t, clip } = await searchParams;
  // ?t= arrives from a search result or a clip in the library; anything that
  // isn't a plain number is ignored rather than trusted into a seek.
  const initialSeekMs = t !== undefined && /^\d+$/.test(t) ? Number(t) : null;
  const project = await getProjectById(id);
  if (!project) notFound();

  const canDelete = project.created_by === profile.id;
  const hasMedia = Boolean(project.media_storage_path);
  const [signedUrl, transcript, clips, indexStatus] = await Promise.all([
    project.status === "ready" && project.media_storage_path
      ? getSignedMediaUrl(project.media_storage_path)
      : Promise.resolve(null),
    project.status === "ready"
      ? getTranscriptForProject(project.id)
      : Promise.resolve({ segments: [], speakers: [] }),
    project.status === "ready" ? listClipsForProject(project.id) : Promise.resolve([]),
    project.status === "ready"
      ? createClient().then((client) => getSearchIndexStatus(client, project.id))
      : Promise.resolve({ chunkCount: 0, staleCount: 0 }),
  ]);

  // A transcript that was never indexed is invisible to search while looking
  // completely normal here — so say it at the top, not in a link under the
  // transcript pane. Only for projects that actually have a transcript to
  // index; an empty one has nothing to say.
  const needsIndexing =
    project.status === "ready" && indexStatus.chunkCount === 0 && transcript.segments.length > 0;

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-5">
        <Link href="/transcription" className="text-xs font-semibold text-brand-link">
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
            interviewDate={project.interview_date}
          />
        </div>
        <StatusBadge status={project.status} />
      </div>

      {needsIndexing && <ReindexButton projectId={project.id} variant="banner" />}

      {project.status === "ready" && (
        <div className="max-w-5xl rounded border border-line bg-white p-5">
          {signedUrl ? (
            <TranscriptWorkspace
              projectId={project.id}
              projectTitle={project.title}
              interviewDate={project.interview_date}
              exportDate={project.interview_date ?? project.created_at}
              mediaUrl={signedUrl}
              isVideo={isVideoContentType(project.media_content_type ?? "")}
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
            {project.media_duration_ms && (
              <div>
                <dt className="font-semibold text-ink-700">Duration</dt>
                <dd>{formatDuration(project.media_duration_ms)}</dd>
              </div>
            )}
            {project.media_size_bytes && (
              <div>
                <dt className="font-semibold text-ink-700">File size</dt>
                <dd>{formatBytes(project.media_size_bytes)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <ReindexButton projectId={project.id} chunkCount={indexStatus.chunkCount} />
            {canDelete && <DeleteProjectButton projectId={project.id} />}
          </div>
        </div>
      )}

      {project.status === "uploading" && (
        <div className="max-w-lg rounded border border-dashed border-line p-5 text-sm text-ink-500">
          This project doesn&apos;t have any media yet — either an upload is still running in
          another tab, or it was interrupted.
          {canDelete && (
            <DeleteProjectButton
              projectId={project.id}
              warning="This removes the project and anything already uploaded for it."
            />
          )}
        </div>
      )}

      {project.status === "processing" && (
        <div className="max-w-lg rounded border border-line bg-panel-50 p-5 text-sm text-ink-500">
          Transcribing — this can take a few minutes for a long recording. This page will show the
          transcript as soon as it&apos;s ready; you can also leave and come back.
          <ProcessingPoller />
        </div>
      )}

      {project.status === "failed" && (
        <div className="max-w-lg rounded border border-line bg-white p-5">
          <p className="text-sm text-ink-700">
            {project.error_message ?? "Something went wrong with this project."}
          </p>
          {hasMedia && <RetryForm projectId={project.id} />}
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

function StatusBadge({ status }: { status: "uploading" | "processing" | "ready" | "failed" }) {
  const map = {
    ready: { label: "Ready", variant: "accent" as const },
    uploading: { label: "Uploading", variant: "neutral" as const },
    processing: { label: "Transcribing", variant: "neutral" as const },
    failed: { label: "Failed", variant: "danger" as const },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function RetryForm({ projectId }: { projectId: string }) {
  return (
    <form action={retryTranscription} className="mt-4">
      <input type="hidden" name="project_id" value={projectId} />
      <Button type="submit" variant="secondary">
        Retry transcription
      </Button>
    </form>
  );
}
