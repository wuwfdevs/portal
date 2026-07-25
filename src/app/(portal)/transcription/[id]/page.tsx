import Link from "next/link";
import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { getProjectById, getTranscriptForProject } from "@/lib/transcription/projects";
import { listClipsForProject } from "@/lib/transcription/clips";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { isVideoContentType, formatBytes, formatDuration } from "@/lib/transcription/media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteProject, retryTranscription } from "../actions";
import { TranscriptWorkspace } from "./transcript-workspace";

export default async function TranscriptionProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireToolAccess("transcription");
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) notFound();

  const canDelete = project.created_by === profile.id;
  const hasMedia = Boolean(project.media_storage_path);
  const [signedUrl, transcript, clips] = await Promise.all([
    project.status === "ready" && project.media_storage_path
      ? getSignedMediaUrl(project.media_storage_path)
      : Promise.resolve(null),
    project.status === "ready"
      ? getTranscriptForProject(project.id)
      : Promise.resolve({ segments: [], speakers: [] }),
    project.status === "ready" ? listClipsForProject(project.id) : Promise.resolve([]),
  ]);

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
          {project.description && (
            <p className="max-w-xl text-sm text-ink-500">{project.description}</p>
          )}
        </div>
        <StatusBadge status={project.status} />
      </div>

      {project.status === "ready" && (
        <div className="max-w-5xl rounded border border-line bg-white p-5">
          {signedUrl ? (
            <TranscriptWorkspace
              projectId={project.id}
              mediaUrl={signedUrl}
              isVideo={isVideoContentType(project.media_content_type ?? "")}
              segments={transcript.segments}
              speakers={transcript.speakers}
              clips={clips}
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
        </div>
      )}

      {project.status === "uploading" && (
        <div className="max-w-lg rounded border border-dashed border-line p-5 text-sm text-ink-500">
          This project doesn&apos;t have any media yet — either an upload is still running in
          another tab, or it was interrupted.
          {canDelete && <DeleteForm projectId={project.id} label="Delete this project" />}
        </div>
      )}

      {project.status === "processing" && (
        <div className="max-w-lg rounded border border-line bg-panel-50 p-5 text-sm text-ink-500">
          Transcribing — this can take a few minutes for a long recording. Feel free to leave this
          page; the project list will show it as Ready when it&apos;s done.
        </div>
      )}

      {project.status === "failed" && (
        <div className="max-w-lg rounded border border-line bg-white p-5">
          <p className="text-sm text-ink-700">
            {project.error_message ?? "Something went wrong with this project."}
          </p>
          {hasMedia ? (
            <RetryForm projectId={project.id} />
          ) : (
            canDelete && <DeleteForm projectId={project.id} label="Delete and try again" />
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

function DeleteForm({ projectId, label }: { projectId: string; label: string }) {
  return (
    <form action={deleteProject} className="mt-4">
      <input type="hidden" name="project_id" value={projectId} />
      <Button type="submit" variant="secondary">
        {label}
      </Button>
    </form>
  );
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
