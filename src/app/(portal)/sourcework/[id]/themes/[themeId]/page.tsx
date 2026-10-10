import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DetailSummary } from "@/components/ui/detail-summary";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedLinks } from "@/components/ui/segmented";
import { SectionHeading } from "@/components/ui/section-heading";
import { TextLink } from "@/components/ui/primary-link";
import { cn } from "@/lib/cn";
import { formatShortDate, pluralize } from "@/lib/format";
import { formatDuration } from "@/lib/transcription/media";
import { getProjectById } from "@/lib/transcription/projects";
import { projectPath, sourcePath, themePath } from "@/lib/transcription/links";
import { listResearchQuestions } from "@/lib/sourcework/research-queries";
import { getThemeDetail, listPointsNotInTheme } from "@/lib/sourcework/theme-queries";
import {
  STANCE_LABEL,
  filterEvidence,
  formatHistoryEntry,
  groupEvidenceBySource,
  groupSummary,
  isSingleSource,
  parseEvidenceShow,
  questionLine,
  sourcesLabel,
  type EvidenceShow,
} from "@/lib/sourcework/themes";
import { pointQuestionLabel, questionTitle, type DataPointSpan } from "@/lib/sourcework/research";
import { QuestionChip } from "../../question-chip";
import { ThemeDecisionButtons } from "../../theme-decision-buttons";
import { PlayIcon } from "../../transport-icons";
import {
  AddPointsPanel,
  EvidenceMenu,
  ThemeEditForm,
  ThemeMemo,
  ThemeMenu,
} from "./theme-controls";

/** Evidence shown per source before "Show N more". */
const SHOWN_PER_SOURCE = 3;

/**
 * One theme (docs/sourcework-analysis-design.md §5.4): the claim, how broadly
 * it is backed, the evidence by source — supporting and complicating side by
 * side — and the reporter's memo. Excerpts for the theme arrive with Phase C.
 */
export default async function ThemePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; themeId: string }>;
  searchParams: Promise<{ show?: string; edit?: string }>;
}) {
  await requireToolAccess("transcription");
  const { id, themeId } = await params;
  const { show: showParam, edit } = await searchParams;
  const show = parseEvidenceShow(showParam);

  const project = await getProjectById(id);
  if (!project) notFound();
  const sourceTitles = new Map(
    project.sources.map((entry) => [entry.sourceId, entry.source.title]),
  );

  const detail = await getThemeDetail(id, themeId, sourceTitles);
  if (!detail) notFound();
  // A theme folded into another is no longer a page of its own.
  if (detail.mergedIntoId) redirect(themePath(id, detail.mergedIntoId));

  const { theme, breadth } = detail;
  const [questions, candidates] = await Promise.all([
    listResearchQuestions(id),
    theme.status === "rejected"
      ? Promise.resolve([])
      : listPointsNotInTheme(id, themeId, sourceTitles),
  ]);
  const labels = new Map(questions.map((question) => [question.id, question.label]));
  const texts = new Map(questions.map((question) => [question.id, question.question]));
  const answers = questionLine(detail.questionIds, labels);
  const candidatesWithQuestion = candidates.map((candidate) => ({
    ...candidate,
    questionLabel: pointQuestionLabel(candidate, labels),
    questionHint: questionTitle(candidate, labels, texts),
  }));

  const here = themePath(id, themeId);
  const backHref = projectPath(id, "themes");
  const editing = edit === "1";
  const suggested = theme.status === "suggested";
  const single = isSingleSource(breadth, project.sources.length);

  const groups = groupEvidenceBySource(
    filterEvidence(
      detail.evidence.map((entry) => entry.item),
      show,
    ),
  );
  const byPoint = new Map(detail.evidence.map((entry) => [entry.item.dataPointId, entry]));

  const showHref = (value: EvidenceShow) => (value === "all" ? here : `${here}?show=${value}`);

  return (
    <div className="px-4 py-8 sm:px-10 sm:py-10">
      <div className="mb-4">
        <TextLink href={backHref}>← {project.title} · Themes</TextLink>
      </div>

      <div className="flex items-start gap-4">
        <div className="min-w-0 max-w-[820px] flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400 sm:text-xs">
            Theme
            {suggested && (
              <span className="ml-2 normal-case tracking-normal text-ink-500">· suggestion</span>
            )}
            {theme.status === "rejected" && (
              <span className="ml-2 normal-case tracking-normal text-ink-500">· rejected</span>
            )}
          </p>
          {editing ? (
            <div className="mt-2">
              <ThemeEditForm
                themeId={theme.id}
                status={theme.status}
                title={theme.title}
                definition={theme.definition}
                doneHref={here}
              />
            </div>
          ) : (
            <>
              <h1 className="mb-1.5 mt-1 font-serif text-xl font-bold leading-tight text-ink-900 sm:text-2xl">
                {theme.title}
              </h1>
              <p className="text-sm text-ink-500">
                {theme.definition}{" "}
                <Link
                  href={`${here}?edit=1`}
                  className="font-bold text-brand-link hover:underline max-lg:inline-block max-lg:py-2.5"
                >
                  Edit
                </Link>
              </p>
              {answers && <p className="mt-1.5 text-xs text-ink-500">Answers {answers}</p>}
            </>
          )}
        </div>
        {!editing && (
          <ThemeMenuSlot>
            <ThemeMenu
              themeId={theme.id}
              status={theme.status}
              editHref={`${here}?edit=1`}
              backHref={backHref}
            />
          </ThemeMenuSlot>
        )}
      </div>

      {(suggested || theme.status === "rejected") && !editing && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded border border-dashed border-ink-400 bg-panel-50/60 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-ink-700">
            {suggested
              ? theme.origin === "model"
                ? "Review themes suggested this. Read the evidence, then accept, edit or reject it."
                : "This theme is waiting for a decision."
              : "This theme is rejected and hidden from the list. Its data points are back in the unfiled pool."}
          </p>
          <ThemeDecisionButtons
            themeId={theme.id}
            editHref={`${here}?edit=1`}
            status={theme.status}
            size="md"
          />
        </div>
      )}

      {/* The numbers, as a strip on a phone and in the side column beside the evidence. */}
      <dl className="mt-4 flex rounded border border-line text-xs lg:hidden">
        {[
          ["Sources", sourcesLabel(breadth, project.sources.length)],
          ["Speakers", String(breadth.speakerCount)],
          ["For", String(breadth.supporting)],
          ["Against", String(breadth.complicating)],
        ].map(([label, value]) => (
          <div key={label} className="flex-1 border-r border-line px-2.5 py-2 last:border-r-0">
            <dt className="text-ink-500">{label}</dt>
            <dd className="text-base font-bold text-ink-900">{value}</dd>
          </div>
        ))}
      </dl>
      {single && (
        <p className="mt-2 lg:hidden">
          <Badge variant="warning">Single source</Badge>
        </p>
      )}

      <div className="mt-6 flex flex-col gap-8 lg:mt-7 lg:flex-row lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <SectionHeading level="eyebrow" className="flex-1">
              Evidence by source
            </SectionHeading>
            <SegmentedLinks
              label="Show"
              options={[
                {
                  label: `All · ${detail.evidence.length}`,
                  href: showHref("all"),
                  active: show === "all",
                },
                {
                  label: `Supporting · ${breadth.supporting}`,
                  href: showHref("supporting"),
                  active: show === "supporting",
                },
                {
                  label: `Complicating · ${breadth.complicating}`,
                  href: showHref("complicating"),
                  active: show === "complicating",
                },
              ]}
              className="max-sm:w-full [&>a]:max-sm:h-11 [&>a]:max-sm:flex-1 [&>a]:max-sm:justify-center"
            />
          </div>

          {groups.length === 0 ? (
            <EmptyState compact>
              {detail.evidence.length === 0
                ? "No accepted data points are in this theme yet. Add some below, or accept more in the sources."
                : "Nothing in this view."}
            </EmptyState>
          ) : (
            groups.map((group) => {
              const head = group.items.slice(0, SHOWN_PER_SOURCE);
              const rest = group.items.slice(SHOWN_PER_SOURCE);
              const row = (item: (typeof group.items)[number]) => {
                const entry = byPoint.get(item.dataPointId)!;
                return (
                  <EvidenceRow
                    key={item.dataPointId}
                    projectId={id}
                    themeId={theme.id}
                    sourceId={item.sourceId}
                    dataPointId={item.dataPointId}
                    stance={item.stance}
                    claim={item.claim}
                    questionLabel={pointQuestionLabel(item, labels)}
                    questionHint={questionTitle(item, labels, texts)}
                    spans={entry.spans}
                  />
                );
              };
              return (
                <section key={group.sourceId} className="rounded border border-line bg-white">
                  <h3 className="border-b border-line px-5 py-3 text-sm font-bold text-ink-900">
                    <Link
                      href={sourcePath(group.sourceId, { projectId: id })}
                      className="hover:text-brand-link hover:underline"
                    >
                      {group.sourceTitle}
                    </Link>{" "}
                    <span className="font-normal text-ink-500">· {groupSummary(group)}</span>
                  </h3>
                  <ul>{head.map(row)}</ul>
                  {rest.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer list-none border-t border-line px-5 py-2.5 text-[13px] font-bold text-brand-link group-open:hidden max-lg:min-h-11 max-lg:py-3.5">
                        Show {rest.length} more
                      </summary>
                      <ul>{rest.map(row)}</ul>
                    </details>
                  )}
                </section>
              );
            })
          )}

          {theme.status !== "rejected" && candidates.length > 0 && (
            <AddPointsPanel themeId={theme.id} candidates={candidatesWithQuestion} />
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[360px]">
          <DetailSummary
            title="Breadth"
            className="max-lg:hidden"
            items={[
              { label: "Sources", value: sourcesLabel(breadth, project.sources.length) },
              { label: "Speakers", value: breadth.speakerCount },
              { label: "Supporting", value: pluralize(breadth.supporting, "data point") },
              { label: "Complicating", value: pluralize(breadth.complicating, "data point") },
              {
                label: "Accepted",
                value: theme.acceptedAt
                  ? `${detail.acceptedByName ?? "Someone"} · ${formatShortDate(theme.acceptedAt)}`
                  : "Not yet",
              },
            ]}
          />
          {single && (
            <Alert variant="warning" className="max-lg:hidden">
              Only one source backs this theme. That is a flag, not a verdict: look for a second
              before leaning on it.
            </Alert>
          )}

          <ThemeMemo themeId={theme.id} memo={theme.memo} />

          {detail.history.length > 0 && (
            <div className="text-[13px] text-ink-500">
              <strong className="text-ink-900">History</strong>
              <ul className="mt-1 flex flex-col gap-0.5">
                {detail.history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`}>{formatHistoryEntry(entry)}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ThemeMenuSlot({ children }: { children: React.ReactNode }) {
  return <div className="shrink-0 max-lg:-mr-2 max-lg:-mt-1.5">{children}</div>;
}

/** One data point in the evidence list: its stance, its wording, where it is in the source, and its menu. */
function EvidenceRow({
  projectId,
  themeId,
  sourceId,
  dataPointId,
  stance,
  claim,
  questionLabel,
  questionHint,
  spans,
}: {
  projectId: string;
  themeId: string;
  sourceId: string;
  dataPointId: string;
  stance: "supports" | "complicates";
  claim: string;
  questionLabel: string | null;
  questionHint: string | undefined;
  spans: DataPointSpan[];
}) {
  const first = spans[0];
  const complicates = stance === "complicates";
  return (
    <li
      className={cn(
        "flex items-start gap-3 border-b border-line px-5 py-3 last:border-b-0 max-sm:flex-wrap sm:gap-3.5",
        complicates && "bg-panel-50",
      )}
    >
      <Badge variant={complicates ? "warning" : "accent"} className="mt-0.5 shrink-0">
        {STANCE_LABEL[stance]}
      </Badge>
      <p className="min-w-0 flex-1 text-sm text-ink-900 max-sm:basis-full max-sm:order-last">
        {claim}
      </p>
      <span className="mt-0.5 shrink-0 max-sm:order-first">
        <QuestionChip label={questionLabel} title={questionHint} />
      </span>
      {first?.kind === "temporal" && (
        <Link
          href={sourcePath(sourceId, { projectId, t: first.startMs })}
          aria-label={`Play this passage in the source, at ${formatDuration(first.startMs)}`}
          title={`Open at ${formatDuration(first.startMs)}`}
          className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand-link text-brand-link hover:bg-brand-surface sm:ml-0 lg:h-7 lg:w-7"
        >
          <PlayIcon className="ml-0.5 h-2.5 w-2.5" />
        </Link>
      )}
      {first?.kind === "document" && (
        <Link
          href={sourcePath(sourceId, { projectId, page: first.pageNumber })}
          className="ml-auto shrink-0 pt-1.5 font-mono text-[11px] text-brand-link hover:underline max-sm:min-h-11 sm:ml-0"
        >
          p. {first.pageNumber}
        </Link>
      )}
      <EvidenceMenu themeId={themeId} dataPointId={dataPointId} stance={stance} />
    </li>
  );
}
