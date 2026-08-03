import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import {
  getProjectById,
  getTranscriptForRepresentation,
  processingLabel,
} from "@/lib/transcription/projects";
import { listExcerptsForSource } from "@/lib/transcription/clips";
import { listDocumentExcerptsForSource } from "@/lib/transcription/document-excerpts";
import { getDocumentContentForRepresentation } from "@/lib/transcription/document-content";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { isVideoContentType, formatBytes, formatDuration } from "@/lib/transcription/media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { retryTranscription } from "../actions";
import { ProjectActionsMenu } from "../project-actions-menu";
import { TranscriptWorkspace } from "./transcript-workspace";
import { DocumentWorkspace } from "./document-workspace";
import { ProjectDetails } from "./project-details";
import { RepresentationStatusBanner } from "./representation-status-banner";
import { SourceActionsMenu } from "./source-actions-menu";
import { countOtherProjectsForSource } from "./source-actions";
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
  // A project-level action (see ProjectActionsMenu in the header below),
  // deliberately not scoped to whichever source happens to be on screen —
  // deleting *a* source precisely is SourceActionsMenu's "Remove…" choice
  // now, so this stays simply about the project itself. deleteProject still
  // only cascades the project's *primary* (earliest-attached) source, and
  // only if no other project references it — see actions.ts's deleteProject.
  const hasAnyMedia = project.sources.some((s) => Boolean(s.source.original_storage_path));
  const deleteLabel = "Delete this project";
  const deleteWarning = hasAnyMedia
    ? "This permanently deletes the project. Its primary source is removed too, unless another project still references it — anything else attached stays in the library."
    : "This removes the project and anything already uploaded for it.";
  // ?source= picks which source is showing; absent (or unknown) falls back
  // to the earliest-attached source — same "primary" this project always
  // had before a second source could be attached (docs/sourcework-design.md
  // §7). SourceCardGrid separately decides whether to start on the list or
  // straight on this source, based on whether ?source= was actually given.
  const activeSourceSummary =
    project.sources.find((s) => s.sourceId === sourceParam) ?? project.sources[0] ?? null;
  const source = activeSourceSummary?.source ?? null;
  const transcriptRepresentation = activeSourceSummary?.transcript ?? null;
  const activeStatus = activeSourceSummary?.status ?? "uploading";
  const hasMedia = Boolean(source?.original_storage_path);
  const isDocument = source?.kind === "document";
  // The uploaded file and the text extracted from it succeed or fail
  // independently, so they gate different things: the file decides whether
  // there's a workspace to show at all, the representation only decides what
  // goes in its text pane. See RepresentationStatusBanner.
  const fileReady = source?.status === "ready" && hasMedia;
  const representationStatus = transcriptRepresentation?.status ?? "pending";
  const contentReady = fileReady && representationStatus === "ready";

  const [signedUrl, transcript, clips, documentContent, documentExcerpts, otherProjectCount] =
    await Promise.all([
      fileReady && source?.original_storage_path
        ? getSignedMediaUrl(source.original_storage_path)
        : Promise.resolve(null),
      !isDocument && contentReady && transcriptRepresentation
        ? getTranscriptForRepresentation(transcriptRepresentation.id)
        : Promise.resolve({ segments: [], speakers: [] }),
      !isDocument && fileReady && activeSourceSummary
        ? listExcerptsForSource(activeSourceSummary.sourceId)
        : Promise.resolve([]),
      isDocument && contentReady && transcriptRepresentation
        ? getDocumentContentForRepresentation(transcriptRepresentation.id)
        : Promise.resolve({ pages: [], blocks: [] }),
      isDocument && fileReady && activeSourceSummary
        ? listDocumentExcerptsForSource(activeSourceSummary.sourceId)
        : Promise.resolve([]),
      // Feeds SourceActionsMenu's "Remove…" choice, so its warning text can
      // say how many other projects a "delete entirely" would also affect.
      // Not gated on fileReady — the menu (in sourceHeader below) shows
      // whether or not the file itself is ready.
      activeSourceSummary
        ? countOtherProjectsForSource(activeSourceSummary.sourceId, project.id)
        : Promise.resolve(0),
    ]);

  // Shown on the browsing grid — a project-level title bar (edit, delete)
  // makes sense while looking at the project as a whole. See SourceCardGrid's
  // comment on why this and sourceHeader below are two separate slots rather
  // than one header that's always the project's.
  const projectHeader = (
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
        />
      </div>
      <div className="flex items-start gap-3">
        <StatusBadge status={project.status} kind={source?.kind ?? "audio_video"} />
        {canDelete && (
          <ProjectActionsMenu projectId={project.id} label={deleteLabel} warning={deleteWarning} />
        )}
      </div>
    </div>
  );

  // Shown over the active source's workspace instead — this source's own
  // title, its own status (not the project's), and its own Rebuild-index/
  // Remove menu, the same information the standalone Source Detail page
  // leads with. Null only when the project has no sources at all, the same
  // case SourceCardGrid's grid would render empty.
  const sourceHeader =
    activeSourceSummary && source ? (
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-400">
            {isDocument ? "PDF" : "Audio"}
          </span>
          <h1 className="mb-1.5 font-serif text-[22px] font-bold text-ink-900">{source.title}</h1>
          <p className="text-xs text-ink-500">
            {isDocument
              ? source.page_count
                ? `${source.page_count} page${source.page_count === 1 ? "" : "s"}`
                : ""
              : source.interview_date &&
                new Date(source.interview_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
            {!isDocument && source.original_duration_ms
              ? ` · ${formatDuration(source.original_duration_ms)}`
              : ""}
            {source.original_size_bytes ? ` · ${formatBytes(source.original_size_bytes)}` : ""}
          </p>
        </div>
        <div className="flex items-start gap-3">
          <StatusBadge status={activeStatus} kind={isDocument ? "document" : "audio_video"} />
          <SourceActionsMenu
            projectId={project.id}
            sourceId={activeSourceSummary.sourceId}
            sourceTitle={source.title}
            otherProjectCount={otherProjectCount}
          />
        </div>
      </div>
    ) : null;

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <SourceCardGrid
        projectId={project.id}
        sources={project.sources}
        activeSourceId={activeSourceSummary?.sourceId ?? null}
        startOnList={!project.sources.some((s) => s.sourceId === sourceParam)}
        projectHeader={projectHeader}
        sourceHeader={sourceHeader}
      >
        {fileReady && isDocument && (
          <div className="rounded border border-line bg-white p-5">
            <RepresentationStatusBanner
              status={representationStatus}
              kind="document"
              errorMessage={transcriptRepresentation?.error_message ?? null}
              projectId={project.id}
              sourceId={activeSourceSummary?.sourceId ?? null}
            />
            {signedUrl && activeSourceSummary ? (
              <DocumentWorkspace
                // A fresh mount per distinct ?page= target — this component
                // only reads initialPage in a useState initializer, so a
                // search result that only changes ?page= while staying on
                // this same source (e.g. this workspace's own embedded
                // per-source search box) would otherwise leave the viewer on
                // whatever page it already had open. See the analogous
                // TranscriptWorkspace key below for the audio counterpart.
                key={`${activeSourceSummary.sourceId}:${initialPage ?? ""}`}
                projectId={project.id}
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
          </div>
        )}

        {fileReady && !isDocument && (
          <div className="rounded border border-line bg-white p-5">
            <RepresentationStatusBanner
              status={representationStatus}
              kind="audio_video"
              errorMessage={transcriptRepresentation?.error_message ?? null}
              projectId={project.id}
              sourceId={activeSourceSummary?.sourceId ?? null}
            />
            {signedUrl && activeSourceSummary ? (
              <TranscriptWorkspace
                // A fresh mount per distinct ?t=/?clip= target. Both only
                // ever seed a useState/ref once (initialSeekAppliedRef,
                // selectedClip's initializer), so a search result that only
                // changes ?t= or ?clip= while staying on this same source —
                // e.g. this workspace's own embedded per-source search box —
                // would otherwise leave the player and highlighted clip
                // exactly where they were instead of jumping to the new hit.
                key={`${activeSourceSummary.sourceId}:${initialSeekMs ?? ""}:${clip ?? ""}`}
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
          </div>
        )}

        {/* Below here the *file* isn't available, so there is no workspace to
            show — the upload is still running, or it failed outright. A
            failure in the text extracted from an uploaded file is not one of
            these states; it rides above the workspace as a banner. sourceHeader
            still shows above this (Remove… covers a stuck source too); only
            the retry itself is repeated inline here. */}
        {!fileReady && activeStatus === "uploading" && (
          <div className="max-w-lg rounded border border-dashed border-line p-5 text-sm text-ink-500">
            This project doesn&apos;t have any {isDocument ? "document" : "media"} yet — either an
            upload is still running in another tab, or it was interrupted.
          </div>
        )}

        {!fileReady && activeStatus !== "uploading" && (
          <div className="max-w-lg rounded border border-line bg-white p-5">
            <p className="text-sm text-ink-700">
              {source?.error_message ??
                transcriptRepresentation?.error_message ??
                "Something went wrong with this project."}
            </p>
            {hasMedia && (
              <RetryForm projectId={project.id} sourceId={activeSourceSummary?.sourceId ?? null} />
            )}
          </div>
        )}
      </SourceCardGrid>
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
