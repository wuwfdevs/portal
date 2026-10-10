import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { getSourceDetail, getTranscriptForRepresentation } from "@/lib/transcription/projects";
import { listExcerptsForSource } from "@/lib/transcription/clips";
import { listDocumentExcerptsForSource } from "@/lib/transcription/document-excerpts";
import { getDocumentContentForRepresentation } from "@/lib/transcription/document-content";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { isVideoContentType, formatDuration } from "@/lib/transcription/media";
import { SOURCE_KIND_LABEL, projectStatusMap } from "@/lib/transcription/status";
import { formatBytes, formatShortDate } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { Input, Label } from "@/components/ui/input";
import { updateSource } from "../../[id]/source-actions";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { retryTranscription } from "../../actions";
import { TranscriptWorkspace } from "../../[id]/transcript-workspace";
import { DocumentWorkspace } from "../../[id]/document-workspace";
import { RepresentationStatusBanner } from "../../[id]/representation-status-banner";
import { SourceActionsMenu } from "../../[id]/source-actions-menu";
import {
  listResearchQuestions,
  listDataPointsForSource,
  getSourceResearch,
} from "@/lib/sourcework/research-queries";
import { sortDataPointsBySpan } from "@/lib/sourcework/research";
import { listThemesForDataPoints } from "@/lib/sourcework/theme-queries";
import type { SourceResearchView } from "../../[id]/data-point-rail";
import { DocumentTabs } from "./document-tabs";
import { SourceProjectsList } from "./source-projects-list";
import { projectPath, sourcePath, themePath } from "@/lib/transcription/links";
import { pluralize } from "@/lib/format";

// See ../../new/page.tsx's comment on why this lives on the page rather
// than in actions.ts, and docs/sourcework-design.md §8.6 on why it's needed
// at all: the retry action here can kick off a Mistral OCR call via after().
export const maxDuration = 300;

/**
 * One source, independent of any project (docs/sourcework-design.md §7.2) —
 * reachable without going through a project first. Shows the same working
 * surface (player+transcript, or PDF+text, depending on kind — see §8.5)
 * the project workspace shows for this source's active pill — not a
 * separate, thinner summary of it — plus the one thing genuinely specific
 * to viewing a source on its own: which project(s) reference it.
 *
 * There is deliberately no "representation chain" widget here — see §7.2's
 * correction and §8.5: a second pipeline shape (PDF → native-or-OCR →
 * document text) still doesn't need one, it needs a different workspace
 * body, which is what the kind branch below is.
 */
export default async function SourceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    project?: string;
    t?: string;
    clip?: string;
    page?: string;
    edit?: string;
    error?: string;
  }>;
}) {
  await requireToolAccess("transcription");
  const { id } = await params;
  const { project: projectParam, t, clip, page, edit, error } = await searchParams;
  // ?t= / ?page= / ?clip= arrive from a search result or an excerpt; anything
  // that isn't a plain number is ignored rather than trusted into a seek.
  const initialSeekMs = t !== undefined && /^\d+$/.test(t) ? Number(t) : null;
  const initialPage = page !== undefined && /^\d+$/.test(page) ? Number(page) : null;

  const source = await getSourceDetail(id);
  if (!source) notFound();

  // The project this source was opened from, if any — it names the back link and
  // is the project "Remove from this project" detaches from. `primaryProjectId`
  // is what a source-scoped action (retry, excerpt creation) revalidates and
  // links through: that project, else the earliest-attached one. It is null
  // only if every project that had this source was since deleted.
  const contextProject = source.projects.find((project) => project.id === projectParam) ?? null;
  const primaryProjectId = contextProject?.id ?? source.projects[0]?.id ?? null;
  const otherProjectCount = source.projects.length - (contextProject ? 1 : 0);
  const returnTo = sourcePath(id, { projectId: contextProject?.id });
  // Two views of one source. Opened from a project it is that project's source:
  // the back link is the way to the others and nothing lists projects. Opened on
  // its own (the library) it gains a Projects tab beside Transcript / Excerpts /
  // Speakers — a real list, since a recording can be in dozens of projects.
  const projectsList = contextProject ? null : <SourceProjectsList projects={source.projects} />;
  const hasMedia = Boolean(source.originalStoragePath);
  const isDocument = source.kind === "document";
  // See ../../[id]/representation-status-banner.tsx: the file and the text
  // extracted from it fail independently, so the viewer is gated on the file
  // and the representation's state is reported over it.
  const fileReady = source.fileStatus === "ready" && hasMedia;
  const representationStatus = source.transcript?.status ?? "pending";
  const contentReady = fileReady && representationStatus === "ready";

  // Data points mode: only from a project that has at least one active question.
  const research: SourceResearchView | null = contextProject
    ? await loadResearchView(contextProject.id, id, source.status, isDocument)
    : null;

  const [signedUrl, transcript, excerpts, documentContent, documentExcerpts] = await Promise.all([
    fileReady && source.originalStoragePath
      ? getSignedMediaUrl(source.originalStoragePath)
      : Promise.resolve(null),
    !isDocument && contentReady && source.transcript
      ? getTranscriptForRepresentation(source.transcript.id)
      : Promise.resolve({ segments: [], speakers: [] }),
    isDocument ? Promise.resolve([]) : listExcerptsForSource(id),
    isDocument && contentReady && source.transcript
      ? getDocumentContentForRepresentation(source.transcript.id)
      : Promise.resolve({ pages: [], blocks: [] }),
    isDocument ? listDocumentExcerptsForSource(id) : Promise.resolve([]),
  ]);

  const documentView = signedUrl ? (
    <DocumentWorkspace
      // A fresh mount per distinct ?page= target — the viewer only reads
      // initialPage in a useState initializer.
      key={`${id}:${initialPage ?? ""}`}
      projectId={primaryProjectId}
      sourceId={id}
      representationId={source.transcript?.id ?? null}
      fileUrl={signedUrl}
      pages={documentContent.pages}
      blocks={documentContent.blocks}
      excerpts={documentExcerpts}
      initialPage={initialPage}
      research={research}
    />
  ) : (
    <p className="text-sm text-ink-500">
      Couldn&apos;t load the document right now. Reload the page to try again.
    </p>
  );

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        className="mb-6"
        back={
          contextProject
            ? { href: projectPath(contextProject.id), label: contextProject.title }
            : { href: "/sourcework?tab=sources", label: "Back to sources" }
        }
        eyebrow={SOURCE_KIND_LABEL[source.kind] ?? source.kind}
        title={source.title}
        description={
          <>
            {isDocument
              ? source.pageCount
                ? `${pluralize(source.pageCount, "page")}`
                : ""
              : source.interviewDate && formatShortDate(source.interviewDate, { year: true })}
            {!isDocument && source.durationMs ? ` · ${formatDuration(source.durationMs)}` : ""}
            {source.sizeBytes ? ` · ${formatBytes(source.sizeBytes)}` : ""}
          </>
        }
        actions={
          <>
            <StatusBadge map={projectStatusMap(source.kind)} value={source.status} />
            <SourceActionsMenu
              projectId={contextProject?.id ?? null}
              sourceId={id}
              sourceTitle={source.title}
              otherProjectCount={otherProjectCount}
              editHref={`${returnTo}${returnTo.includes("?") ? "&" : "?"}edit=1`}
            />
          </>
        }
      />

      {edit === "1" && (
        <InlineCreateCard
          className="mb-6 max-w-xl"
          title="Edit source"
          action={updateSource}
          submitLabel="Save"
          cancelHref={returnTo}
        >
          <input type="hidden" name="source_id" value={id} />
          <input type="hidden" name="project_id" value={contextProject?.id ?? ""} />
          <div className="flex flex-col gap-3">
            {error && <Alert>{error}</Alert>}
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" defaultValue={source.title} required />
            </div>
            {!isDocument && (
              <div>
                <Label htmlFor="interview_date">Date recorded</Label>
                <Input
                  id="interview_date"
                  name="interview_date"
                  type="date"
                  defaultValue={source.interviewDate ?? ""}
                />
              </div>
            )}
          </div>
        </InlineCreateCard>
      )}

      {fileReady && isDocument && (
        <Card className="p-5">
          <RepresentationStatusBanner
            status={representationStatus}
            kind="document"
            errorMessage={source.transcript?.error_message ?? null}
            projectId={primaryProjectId}
            sourceId={id}
            returnTo={returnTo}
          />
          {projectsList ? (
            <DocumentTabs projectCount={source.projects.length} projectsPane={projectsList}>
              {documentView}
            </DocumentTabs>
          ) : (
            documentView
          )}
        </Card>
      )}

      {fileReady && !isDocument && (
        <Card className="p-5 max-lg:border-0 max-lg:bg-transparent max-lg:p-0">
          <RepresentationStatusBanner
            status={representationStatus}
            kind="audio_video"
            errorMessage={source.transcript?.error_message ?? null}
            projectId={primaryProjectId}
            sourceId={id}
            returnTo={returnTo}
          />
          {signedUrl ? (
            <TranscriptWorkspace
              // A fresh mount per distinct ?t=/?clip= target. Both only ever seed
              // a useState/ref once, so a search result that only changes them
              // while staying on this source would otherwise leave the player and
              // the highlighted excerpt exactly where they were.
              key={`${id}:${initialSeekMs ?? ""}:${clip ?? ""}`}
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
              initialSeekMs={initialSeekMs}
              highlightClipId={clip ?? null}
              projectsPane={projectsList}
              projectCount={source.projects.length}
              research={research}
            />
          ) : (
            <p className="text-sm text-ink-500">
              Couldn&apos;t load the media right now. Reload the page to try again.
            </p>
          )}
        </Card>
      )}

      {/* Only reached when the *file* isn't available — see the project
          workspace's equivalent comment. A failed extraction over a
          perfectly good file is a banner, not one of these. */}
      {!fileReady && source.fileStatus === "uploading" && (
        <EmptyState className="max-w-lg p-5">
          This source doesn&apos;t have any {isDocument ? "document" : "media"} yet — either an
          upload is still running in another tab, or it was interrupted.
        </EmptyState>
      )}

      {!fileReady && source.fileStatus !== "uploading" && (
        <Card className="max-w-lg p-5">
          <p className="text-sm text-ink-700">
            {source.errorMessage ??
              source.transcript?.error_message ??
              "Something went wrong with this source."}
          </p>
          {hasMedia && <RetryForm projectId={primaryProjectId} sourceId={id} returnTo={returnTo} />}
        </Card>
      )}

      {/* Once an audio source is ready, the workspace's clip rail above
          already shows every excerpt for it — this flat list is only for
          the states where that rail isn't rendered, e.g. excerpts made
          before a re-transcription attempt that's since failed. Document
          excerpts always show inside DocumentWorkspace itself once ready;
          this fallback covers the same not-ready states for a document. */}
      {!fileReady && !isDocument && excerpts.length > 0 && (
        <section className="mt-8">
          <SectionHeading level="eyebrow" className="mb-3">
            Excerpts from this source
          </SectionHeading>
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

      {!fileReady && isDocument && documentExcerpts.length > 0 && (
        <section className="mt-8">
          <SectionHeading level="eyebrow" className="mb-3">
            Excerpts from this source
          </SectionHeading>
          <ul className="flex flex-col gap-3">
            {documentExcerpts.map((excerpt) => (
              <li key={excerpt.id} className="rounded border border-line bg-white p-4">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink-900">{excerpt.title}</span>
                  <span className="text-xs text-ink-400">
                    {excerpt.pages.length === 1
                      ? `p. ${excerpt.pages[0]}`
                      : `pp. ${excerpt.pages.join(", ")}`}
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

function RetryForm({
  projectId,
  sourceId,
  returnTo,
}: {
  projectId: string | null;
  sourceId: string;
  returnTo: string;
}) {
  return (
    <form action={retryTranscription} className="mt-4">
      <input type="hidden" name="project_id" value={projectId ?? ""} />
      <input type="hidden" name="source_id" value={sourceId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <Button type="submit" variant="secondary">
        Retry
      </Button>
    </form>
  );
}

async function loadResearchView(
  projectId: string,
  sourceId: string,
  status: Parameters<typeof getSourceResearch>[1][number]["status"],
  isDocument: boolean,
): Promise<SourceResearchView | null> {
  const questions = await listResearchQuestions(projectId);
  const active = questions.filter((question) => !question.archivedAt);
  if (active.length === 0) return null;
  const [points, researchBySource] = await Promise.all([
    listDataPointsForSource(projectId, sourceId),
    getSourceResearch(projectId, [
      { sourceId, status, kind: isDocument ? "document" : "audio_video" },
    ]),
  ]);
  const state = researchBySource.get(sourceId)?.state ?? { kind: "idle" as const };
  const themeLinks = await listThemesForDataPoints(
    points.filter((point) => point.status === "accepted").map((point) => point.id),
  );
  return {
    points: sortDataPointsBySpan(points),
    labels: Object.fromEntries(questions.map((question) => [question.id, question.label])),
    questionTexts: Object.fromEntries(
      questions.map((question) => [question.id, question.question]),
    ),
    extraction: state,
    themes: Object.fromEntries(
      [...themeLinks.entries()].map(([pointId, links]) => [
        pointId,
        links.map((link) => ({
          href: themePath(projectId, link.themeId),
          title: link.title,
          stance: link.stance,
        })),
      ]),
    ),
  };
}
