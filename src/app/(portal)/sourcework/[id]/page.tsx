import { notFound, redirect } from "next/navigation";
import { Pagination } from "@/components/ui/pagination";
import { isPastLastPage, pageHref, pageInfo, pageRange, parsePage } from "@/lib/pagination";
import { requireToolAccess } from "@/lib/auth/authz";
import { getProjectById } from "@/lib/transcription/projects";
import { listLibraryClips } from "@/lib/transcription/clips";
import { countPieces, listPiecesForProject } from "@/lib/sourcework/piece-queries";
import { sourcePath, projectPath } from "@/lib/transcription/links";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TabNav } from "@/components/ui/tab-nav";
import { TextLink } from "@/components/ui/primary-link";
import { describeProjectDeletion } from "@/lib/transcription/project-deletion";
import { loadDeletionSources } from "@/lib/transcription/project-deletion-plan";
import { createClient } from "@/lib/supabase/server";
import { AddSourceButton } from "./add-source-button";
import { ExportExcerptsButton } from "./export-excerpts-button";
import { ProjectDetails } from "./project-details";
import { ProjectExcerptsView } from "./project-excerpts-view";
import { PiecesTab } from "./pieces-tab";
import { SetupTab } from "./setup-tab";
import { SynthesisTab } from "./synthesis-tab";
import { ReviewTab } from "./review-tab";
import { HandoverButton } from "./handover";
import { ProjectActionsMenu } from "./project-actions-menu";
import { ProjectOverview, offersHandover } from "./project-overview";
import { PointsTab } from "./points-tab";
import { SourceTable } from "./source-table";
import { DismissibleHint } from "@/components/ui/dismissible-hint";
import { SubNav } from "@/components/ui/sub-nav";
import { ControlRow } from "@/components/ui/control-row";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { withQuery } from "@/lib/paths";
import { projectStage } from "@/lib/sourcework/project-stage";
import {
  SOURCE_SHOW_LABEL,
  SOURCE_SORT_LABEL,
  countByShow,
  filterSources,
  sourceProgress,
  parseSourceShow,
  parseSourceSort,
  type SourceListRow,
  type SourceListShow,
  type SourceListSort,
} from "@/lib/sourcework/source-list";
import { formatShortDate } from "@/lib/format";
import { listLiveFormats } from "@/lib/sourcework/piece-format-queries";
import { AnalyzeButton, AnalyzeProgress, ExtractionProvider } from "./extraction-controls";
import { getSourceResearch, listResearchQuestions } from "@/lib/sourcework/research-queries";
import { extractionLine } from "@/lib/sourcework/run-state";
import { formatDuration } from "@/lib/transcription/media";
import { pluralize } from "@/lib/format";
import { sourcesToExtract } from "@/lib/sourcework/setup-view";
import { countWaitingReview } from "@/lib/sourcework/review-queries";
import { getSynthesisStanding } from "@/lib/sourcework/synthesis-queries";

/**
 * One project: its sources, and the excerpts made from them. The working
 * surface for a recording or a document is its own screen
 * (`/sourcework/sources/[id]`), reached from a source card here and left with
 * its back link — this screen has no player, no transcript and no view state
 * beyond which of the tabs is showing (`?view=synthesis`, `?view=excerpts`,
 * `?view=pieces`, `?view=setup`). Setup sits at the right edge and is reachable
 * before any source exists: the research questions come first. Synthesis shows
 * once the project has an accepted finding.
 */
export default async function TranscriptionProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    view?: string;
    q?: string;
    version?: string;
    cert?: string;
    show?: string;
    sort?: string;
    edit?: string;
    page?: string;
    filter?: string;
  }>;
}) {
  const { profile } = await requireToolAccess("transcription");
  const { id } = await params;
  const {
    view,
    q,
    version,
    cert,
    show: showParam,
    sort: sortParam,
    edit,
    page: pageParam,
    filter: filterParam,
  } = await searchParams;
  const reviewView = view === "review";
  const synthesisView = view === "synthesis";
  const excerptsView = view === "excerpts";
  const pointsView = view === "points";
  const piecesView = view === "pieces";
  const setupView = view === "setup";
  const sourcesView =
    !reviewView && !pointsView && !synthesisView && !excerptsView && !piecesView && !setupView;
  const pieceSearch = (q ?? "").trim();

  const project = await getProjectById(id);
  if (!project) notFound();

  const canDelete = project.createdBy === profile.id;
  const sourceIds = project.sources.map((entry) => entry.sourceId);
  const [pieceCount, pieces, synthesis, waitingReview] = await Promise.all([
    countPieces(project.id),
    piecesView ? listPiecesForProject(project.id, pieceSearch) : Promise.resolve([]),
    getSynthesisStanding(project.id),
    countWaitingReview(project.id, sourceIds),
  ]);
  const showSynthesisTab =
    synthesisView || synthesis.acceptedFindings > 0 || synthesis.hasSynthesis;

  // Research state is read only where the Sources tab shows it. Analyze needs no research
  // question, so it is offered with or without one; a question only sharpens it.
  const questions =
    sourcesView && project.sources.length > 0 ? await listResearchQuestions(project.id) : [];
  const hasQuestions = questions.some((question) => question.archivedAt === null);
  const research =
    sourcesView && project.sources.length > 0
      ? await getSourceResearch(
          project.id,
          project.sources.map((entry) => ({
            sourceId: entry.sourceId,
            status: entry.status,
            kind: entry.source.kind,
          })),
        )
      : null;
  const extractTargets = research
    ? sourcesToExtract(
        project.sources.map((entry) => ({
          id: entry.sourceId,
          title: entry.source.title,
          state: research.get(entry.sourceId)?.state ?? { kind: "idle" as const },
        })),
      )
    : [];
  const anyExtracting = research
    ? [...research.values()].some(
        (item) => item.state.kind === "running" || item.state.kind === "waiting",
      )
    : false;

  const formats = sourcesView && project.sources.length > 0 ? await listLiveFormats() : [];
  const projectExcerpts = excerptsView ? await listLibraryClips(project.id) : [];

  // Only the person who started the project can delete it, so only they pay
  // for the lookup that lets the warning name what goes and what stays.
  const deletionPlan = canDelete
    ? describeProjectDeletion(
        await loadDeletionSources(
          await createClient(),
          project.id,
          project.sources.map((entry) => ({
            id: entry.sourceId,
            title: entry.source.title,
            kind: entry.source.kind,
          })),
        ),
      )
    : null;

  // Review is a step you act on, so it keeps a top-level tab (and the badge) matching the step strip.
  // Notebook holds the material to browse: sources, decided data points and excerpts. Each keeps its
  // own URL (`?view=`), so links and search hits still land where they did.
  const notebookView = sourcesView || pointsView || excerptsView;
  const tabNav = (
    <>
      <TabNav
        tabs={[
          {
            href: projectPath(project.id),
            label: "Notebook",
            active: notebookView,
          },
          {
            href: projectPath(project.id, "review"),
            label: "Review",
            active: reviewView,
            badge: waitingReview,
          },
          ...(showSynthesisTab
            ? [
                {
                  href: projectPath(project.id, "synthesis"),
                  label: "Synthesis",
                  active: synthesisView,
                  badge: synthesis.changedSince,
                },
              ]
            : []),
          {
            href: projectPath(project.id, "pieces"),
            label: "Pieces",
            active: piecesView,
          },
          {
            href: projectPath(project.id, "setup"),
            label: "Setup",
            active: setupView,
            end: true,
          },
        ]}
      />
      {notebookView && (
        <SubNav
          label="Notebook sections"
          className="mt-3"
          items={[
            {
              href: projectPath(project.id),
              label: "Sources",
              active: sourcesView,
              count: project.sources.length,
            },
            {
              href: projectPath(project.id, "points"),
              label: "Data points",
              active: pointsView,
            },
            {
              href: projectPath(project.id, "excerpts"),
              label: "Excerpts",
              active: excerptsView,
            },
          ]}
        />
      )}
    </>
  );

  // The Sources tab, with its step strip and "next" band above the tabs. Every control that starts
  // or reports an Analyze batch shares one provider, so the band's button, the toolbar's and the
  // progress panel are the same run.
  const showSources = sourcesView && project.sources.length > 0 && research !== null;
  const show: SourceListShow = parseSourceShow(showParam);
  const sort: SourceListSort = parseSourceSort(sortParam);
  const sourceQuery = (q ?? "").trim();
  const listRows: SourceListRow[] = project.sources.map((entry) => ({
    id: entry.sourceId,
    title: entry.source.title,
    date: entry.source.interview_date ?? entry.source.created_at,
    status: entry.status,
    analysis: research?.get(entry.sourceId)?.state ?? null,
  }));
  const readyCount = project.sources.filter((entry) => entry.status === "ready").length;
  const analyzedCount = listRows.filter((row) => row.analysis?.kind === "done").length;
  // Findings (not clips) decided so far, from the same counts the source cards show.
  let findingsTotal = 0;
  let findingsToReview = 0;
  for (const row of listRows) {
    if (row.analysis?.kind === "done") {
      findingsTotal += row.analysis.total;
      findingsToReview += row.analysis.toReview;
    }
  }
  const stage = projectStage({
    sourceCount: project.sources.length,
    readyCount,
    analyzedCount,
    waitingReview,
    acceptedFindings: synthesis.acceptedFindings,
    hasSynthesis: synthesis.hasSynthesis,
    pieceCount,
  });
  const counts = countByShow(listRows);
  const visibleRows = filterSources(listRows, { query: sourceQuery, show, sort });
  const entryById = new Map(project.sources.map((entry) => [entry.sourceId, entry]));
  const sourcePage = pageInfo(parsePage(pageParam), visibleRows.length);
  if (sourcesView && isPastLastPage(sourcePage)) {
    redirect(
      pageHref(
        projectPath(project.id),
        {
          q: sourceQuery || null,
          show: show === "all" ? null : show,
          sort: sort === "date" ? null : sort,
        },
        sourcePage.pageCount,
      ),
    );
  }
  const { from: pageFrom, to: pageTo } = pageRange(sourcePage.page, sourcePage.pageSize);
  const tableRows = visibleRows.slice(pageFrom, pageTo + 1).flatMap((row) => {
    const entry = entryById.get(row.id);
    if (!entry) return [];
    const line = research?.get(entry.sourceId)?.state
      ? extractionLine(research.get(entry.sourceId)!.state, entry.source.kind)
      : null;
    const durationMs = entry.source.original_duration_ms;
    return [
      {
        id: entry.sourceId,
        href: sourcePath(entry.sourceId, { projectId: project.id }),
        title: entry.source.title,
        kind: entry.source.kind,
        status: entry.status,
        date: formatShortDate(entry.source.interview_date ?? entry.source.created_at, {
          year: true,
        }),
        length:
          entry.source.kind === "document"
            ? entry.source.page_count
              ? pluralize(entry.source.page_count, "page")
              : ""
            : durationMs
              ? formatDuration(durationMs)
              : "",
        analysis: line,
        progress: sourceProgress(entry.status, research?.get(entry.sourceId)?.state ?? null),
        footnote:
          entry.status === "failed"
            ? (entry.source.error_message ??
              entry.transcript?.error_message ??
              "This source needs attention. Open it for details.")
            : undefined,
      },
    ];
  });
  const listQuery = (over: { show?: SourceListShow; sort?: SourceListSort }) =>
    withQuery(projectPath(project.id), {
      q: sourceQuery || null,
      show: (over.show ?? show) === "all" ? null : (over.show ?? show),
      sort: (over.sort ?? sort) === "date" ? null : (over.sort ?? sort),
    });
  const emptyMessage =
    show === "attention"
      ? "Nothing needs attention: every source processed and analyzed cleanly."
      : show === "not_analyzed"
        ? "Every ready source has been analyzed."
        : sourceQuery
          ? `No source matches “${sourceQuery}”.`
          : "No sources yet.";

  const header = (
    <>
      <div className="mb-5">
        <TextLink href="/sourcework">← Back to projects</TextLink>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        {/* flex-1 so the ⋮ shares the title's line on a phone instead of taking a row (control-row.tsx). */}
        <div className="min-w-0 max-w-3xl flex-1">
          <PageHeader title={project.title} />
          <div className="mt-1.5">
            {project.description ? (
              <p className="mb-1.5 text-sm leading-relaxed text-ink-500">{project.description}</p>
            ) : (
              // On a phone the "Add background" link alone says it; the form's own hint explains why.
              <p className="mb-1.5 hidden text-sm italic text-ink-400 sm:block">
                No background yet. A note here tells someone finding a quote from this project in
                two years what it was about.
              </p>
            )}
            <ProjectDetails
              key={edit === "1" ? "editing" : "reading"}
              projectId={project.id}
              title={project.title}
              description={project.description}
              startOpen={edit === "1"}
              showTrigger={!project.description}
            />
          </div>
        </div>
        <ControlRow className="shrink-0">
          <ProjectActionsMenu
            projectId={project.id}
            projectTitle={project.title}
            editHref={`${projectPath(project.id)}?edit=1`}
            plan={deletionPlan}
          />
        </ControlRow>
      </div>
    </>
  );

  if (showSources) {
    return (
      <div className="px-6 py-10 sm:px-10 sm:py-12">
        {header}
        <ExtractionProvider
          projectId={project.id}
          targets={extractTargets.map((target) => ({ id: target.id, title: target.title }))}
          anyRunning={anyExtracting}
        >
          <ProjectOverview
            projectId={project.id}
            stage={stage}
            reviewProgress={
              findingsTotal > 0
                ? { done: findingsTotal - findingsToReview, total: findingsTotal }
                : null
            }
            handover={
              offersHandover(stage.next) ? (
                <HandoverButton
                  projectId={project.id}
                  formats={formats.map((format) => ({ id: format.id, name: format.name }))}
                  toAnalyze={extractTargets.length}
                />
              ) : null
            }
          />
          {tabNav}
          <AnalyzeProgress />
          <ListToolbar
            className="mb-4"
            search={{
              placeholder: "Filter sources",
              label: "Filter this project's sources",
              defaultValue: sourceQuery,
              hidden: {
                ...(show !== "all" ? { show } : {}),
                ...(sort !== "date" ? { sort } : {}),
              },
            }}
            filters={[
              {
                label: "Show",
                chips: (Object.keys(SOURCE_SHOW_LABEL) as SourceListShow[]).map((value) => ({
                  label: SOURCE_SHOW_LABEL[value],
                  count: counts[value],
                  href: listQuery({ show: value }),
                  active: show === value,
                })),
              },
              {
                label: "Sort",
                chips: (Object.keys(SOURCE_SORT_LABEL) as SourceListSort[]).map((value) => ({
                  label: SOURCE_SORT_LABEL[value],
                  href: listQuery({ sort: value }),
                  active: sort === value,
                })),
              },
            ]}
          >
            {/* Not when it is the band's primary action: one Analyze button on screen at a time. */}
            {stage.next.kind !== "analyze" && <AnalyzeButton />}
            <AddSourceButton projectId={project.id} hasSources />
          </ListToolbar>
          <SourceTable projectId={project.id} rows={tableRows} emptyMessage={emptyMessage} />
          <Pagination
            info={sourcePage}
            path={projectPath(project.id)}
            params={{
              q: sourceQuery || null,
              show: show === "all" ? null : show,
              sort: sort === "date" ? null : sort,
            }}
            noun="sources"
          />
          {!hasQuestions && (
            <DismissibleHint id="project-analyze-no-question" className="mt-4 max-w-2xl text-xs">
              Analyze works without a research question. Add one in{" "}
              <TextLink href={projectPath(project.id, "setup")} className="px-0 text-xs">
                Setup
              </TextLink>{" "}
              to focus it on what you are trying to learn.
            </DismissibleHint>
          )}
        </ExtractionProvider>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      {header}
      {tabNav}

      {reviewView ? (
        <ReviewTab
          projectId={project.id}
          sources={project.sources.map((entry) => ({
            id: entry.sourceId,
            title: entry.source.title,
            kind: entry.source.kind,
          }))}
        />
      ) : setupView ? (
        <SetupTab projectId={project.id} />
      ) : synthesisView ? (
        <SynthesisTab projectId={project.id} versionParam={version} certParam={cert} />
      ) : piecesView ? (
        <PiecesTab
          projectId={project.id}
          pieces={pieces}
          search={pieceSearch}
          totalCount={pieceCount}
        />
      ) : pointsView ? (
        <PointsTab
          projectId={project.id}
          sources={project.sources.map((entry) => ({
            id: entry.sourceId,
            title: entry.source.title,
          }))}
          filterParam={filterParam}
          pageParam={pageParam}
        />
      ) : excerptsView ? (
        <>
          {projectExcerpts.length > 0 && (
            <div className="mb-4 flex justify-end">
              <ExportExcerptsButton
                projectId={project.id}
                projectTitle={project.title}
                exportDate={project.sources[0]?.source.interview_date ?? project.createdAt}
              />
            </div>
          )}
          <ProjectExcerptsView projectId={project.id} clips={projectExcerpts} />
        </>
      ) : (
        <EmptyState
          title="No sources yet"
          action={<AddSourceButton projectId={project.id} hasSources={false} primary />}
        >
          Upload interviews or PDFs, or reference ones already in the library.
        </EmptyState>
      )}
    </div>
  );
}
