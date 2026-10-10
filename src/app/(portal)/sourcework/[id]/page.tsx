import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { getProjectById } from "@/lib/transcription/projects";
import { listLibraryClips } from "@/lib/transcription/clips";
import { countPieces, listPiecesForProject } from "@/lib/sourcework/piece-queries";
import { sourcePath, projectPath } from "@/lib/transcription/links";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { TabNav } from "@/components/ui/tab-nav";
import { TextLink } from "@/components/ui/primary-link";
import { SourceCard, formatSourceMeta } from "@/components/transcription/source-card";
import { DeleteProjectPanel } from "../delete-project-panel";
import { describeProjectDeletion } from "@/lib/transcription/project-deletion";
import { loadDeletionSources } from "@/lib/transcription/project-deletion-plan";
import { createClient } from "@/lib/supabase/server";
import { AddSourceButton } from "./add-source-button";
import { ExportExcerptsButton } from "./export-excerpts-button";
import { ProjectDetails } from "./project-details";
import { ProjectExcerptsView } from "./project-excerpts-view";
import { PiecesTab } from "./pieces-tab";
import { SetupTab } from "./setup-tab";
import { ThemesTab } from "./themes-tab";
import { ExtractionControls } from "./extraction-controls";
import { getSourceResearch, listResearchQuestions } from "@/lib/sourcework/research-queries";
import { extractionLine } from "@/lib/sourcework/run-state";
import { sourcesToExtract } from "@/lib/sourcework/setup-view";
import { getThemeDecisionCounts, hasResearchSignal } from "@/lib/sourcework/theme-queries";
import { decisionsWaiting } from "@/lib/sourcework/themes";

/**
 * One project: its sources, and the excerpts made from them. The working
 * surface for a recording or a document is its own screen
 * (`/sourcework/sources/[id]`), reached from a source card here and left with
 * its back link — this screen has no player, no transcript and no view state
 * beyond which of the tabs is showing (`?view=themes`, `?view=excerpts`,
 * `?view=pieces`, `?view=setup`). Setup sits at the right edge and is reachable
 * before any source exists: the research questions come first. Themes shows
 * once the project has a research question or a data point.
 */
export default async function TranscriptionProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    view?: string;
    q?: string;
    status?: string;
    question?: string;
    new?: string;
    error?: string;
  }>;
}) {
  const { profile } = await requireToolAccess("transcription");
  const { id } = await params;
  const { view, q, status, question, new: showNew, error } = await searchParams;
  const themesView = view === "themes";
  const excerptsView = view === "excerpts";
  const piecesView = view === "pieces";
  const setupView = view === "setup";
  const sourcesView = !themesView && !excerptsView && !piecesView && !setupView;
  const pieceSearch = (q ?? "").trim();

  const project = await getProjectById(id);
  if (!project) notFound();

  const canDelete = project.createdBy === profile.id;
  const [pieceCount, pieces, showThemesTab] = await Promise.all([
    countPieces(project.id),
    piecesView ? listPiecesForProject(project.id, pieceSearch) : Promise.resolve([]),
    themesView ? Promise.resolve(true) : hasResearchSignal(project.id),
  ]);
  const themeDecisions = showThemesTab
    ? decisionsWaiting(await getThemeDecisionCounts(project.id))
    : 0;

  // Research state is read only where the Sources tab shows it. A project with
  // no active question reads nothing and looks as it always did.
  const questions =
    sourcesView && project.sources.length > 0 ? await listResearchQuestions(project.id) : [];
  const hasQuestions = questions.some((question) => question.archivedAt === null);
  const research = hasQuestions
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

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-5">
        <TextLink href="/sourcework">← Back to projects</TextLink>
      </div>

      <div className="mb-6">
        <PageHeader title={project.title} />
        <div className="mt-1.5">
          {project.description ? (
            <p className="mb-1.5 max-w-xl text-sm text-ink-500">{project.description}</p>
          ) : (
            <p className="mb-1.5 max-w-xl text-sm italic text-ink-400">
              No background yet — a note here is what tells someone finding a quote from this
              project in two years what it was about.
            </p>
          )}
          <ProjectDetails
            projectId={project.id}
            title={project.title}
            description={project.description}
          />
        </div>
      </div>

      <TabNav
        tabs={[
          {
            href: projectPath(project.id),
            label: "Sources",
            active: sourcesView,
            badge: project.sources.length,
          },
          ...(showThemesTab
            ? [
                {
                  href: projectPath(project.id, "themes"),
                  label: "Themes",
                  active: themesView,
                  badge: themeDecisions,
                },
              ]
            : []),
          {
            href: projectPath(project.id, "excerpts"),
            label: "Excerpts",
            active: excerptsView,
          },
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

      {setupView ? (
        <SetupTab projectId={project.id} sources={project.sources} />
      ) : themesView ? (
        <ThemesTab
          projectId={project.id}
          sources={project.sources}
          statusParam={status}
          questionParam={question}
          search={pieceSearch}
          showNew={showNew === "1"}
          error={error}
        />
      ) : piecesView ? (
        <PiecesTab
          projectId={project.id}
          pieces={pieces}
          search={pieceSearch}
          totalCount={pieceCount}
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
      ) : project.sources.length === 0 ? (
        <EmptyState
          title="No sources yet"
          action={<AddSourceButton projectId={project.id} hasSources={false} primary />}
        >
          Upload interviews or PDFs, or reference ones already in the library.
        </EmptyState>
      ) : (
        <section>
          {research ? (
            <ExtractionControls
              projectId={project.id}
              targets={extractTargets.map((target) => ({ id: target.id, title: target.title }))}
              anyRunning={anyExtracting}
            >
              <AddSourceButton projectId={project.id} hasSources />
            </ExtractionControls>
          ) : (
            <SectionHeading
              level="eyebrow"
              className="mb-3 items-center"
              action={<AddSourceButton projectId={project.id} hasSources />}
            >
              Sources
            </SectionHeading>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {project.sources.map((entry) => (
              <SourceCard
                key={entry.sourceId}
                href={sourcePath(entry.sourceId, { projectId: project.id })}
                kind={entry.source.kind}
                status={entry.status}
                title={entry.source.title}
                meta={formatSourceMeta({
                  kind: entry.source.kind,
                  date: entry.source.interview_date ?? entry.source.created_at,
                  durationMs: entry.source.original_duration_ms,
                  pageCount: entry.source.page_count,
                })}
                extraction={
                  research
                    ? (() => {
                        const state = research.get(entry.sourceId)?.state;
                        return state ? extractionLine(state, entry.source.kind) : null;
                      })()
                    : null
                }
                footnote={
                  entry.status === "failed"
                    ? (entry.source.error_message ??
                      entry.transcript?.error_message ??
                      "This source needs attention. Open it for details.")
                    : undefined
                }
              />
            ))}
          </div>
          {!hasQuestions && (
            <p className="mt-4 max-w-2xl text-xs text-ink-400">
              A project without research questions works as it does today. Add them in{" "}
              <TextLink href={projectPath(project.id, "setup")} className="px-0 text-xs">
                Setup
              </TextLink>{" "}
              to get data points and themes; sources already in the project can be extracted
              afterward.
            </p>
          )}
        </section>
      )}

      {deletionPlan && (
        <DeleteProjectPanel
          projectId={project.id}
          projectTitle={project.title}
          plan={deletionPlan}
        />
      )}
    </div>
  );
}
