import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { SecondaryLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { pluralize } from "@/lib/format";
import type { ProjectSourceSummary } from "@/lib/transcription/projects";
import { projectPath, sourcePath, themePath } from "@/lib/transcription/links";
import { listResearchQuestions } from "@/lib/sourcework/research-queries";
import {
  getWaitingNumbers,
  listPendingMerges,
  listThemeRows,
} from "@/lib/sourcework/theme-queries";
import {
  THEME_DEFINITION_MAX,
  THEME_TITLE_MAX,
  filterThemeRows,
  isSingleSource,
  parseStatusFilter,
  questionLine,
  readsLikeTopic,
  sourcesLabel,
  waitingSummary,
  type ThemeStatusFilter,
} from "@/lib/sourcework/themes";
import { createThemeFromForm } from "../theme-actions";
import {
  ReviewThemesButton,
  ReviewThemesLink,
  ReviewThemesProvider,
  ReviewThemesStatus,
} from "./review-themes";
import { MergeDecisionButtons, ThemeDecisionButtons } from "./theme-decision-buttons";

function themesHref(
  projectId: string,
  params: { status?: ThemeStatusFilter; question?: string | null },
): string {
  const query = new URLSearchParams({ view: "themes" });
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.question) query.set("question", params.question);
  return `/sourcework/${projectId}?${query.toString()}`;
}

/**
 * The Themes tab (docs/sourcework-analysis-design.md §5.4, §7.1): what is
 * waiting for a decision, then every theme with how broadly it is backed.
 * Suggestions sit among the accepted themes with their own Accept / Edit /
 * Reject; a merge suggestion is a row of its own.
 */
export async function ThemesTab({
  projectId,
  sources,
  statusParam,
  questionParam,
  search,
  showNew,
  error,
}: {
  projectId: string;
  sources: ProjectSourceSummary[];
  statusParam: string | undefined;
  questionParam: string | undefined;
  search: string;
  showNew: boolean;
  error: string | undefined;
}) {
  const status = parseStatusFilter(statusParam);
  const [rows, merges, waiting, questions] = await Promise.all([
    listThemeRows(projectId),
    listPendingMerges(projectId),
    getWaitingNumbers(projectId),
    listResearchQuestions(projectId),
  ]);

  const labels = new Map(questions.map((question) => [question.id, question.label]));
  const activeQuestions = questions.filter((question) => question.archivedAt === null);
  const questionId = activeQuestions.find((question) => question.id === questionParam)?.id ?? null;
  const sourceTitles = new Map(sources.map((entry) => [entry.sourceId, entry.source.title]));
  const projectSources = sources.length;

  const counts = {
    accepted: rows.filter((row) => row.status === "accepted").length,
    suggested: rows.filter((row) => row.status === "suggested").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
  };
  const summary = waitingSummary({
    toReviewBySource: waiting.toReviewBySource
      .filter((entry) => sourceTitles.has(entry.sourceId))
      .map((entry) => ({
        sourceId: entry.sourceId,
        title: sourceTitles.get(entry.sourceId) ?? "Source",
        count: entry.count,
      })),
    unthemed: waiting.unthemed,
    suggestedThemes: counts.suggested,
    suggestedMerges: merges.length,
  });

  const shown = filterThemeRows(rows, { status, questionId, search });
  const showMerges =
    (status === "all" || status === "suggested") && !questionId && search.trim() === "";
  const empty = rows.length === 0 && merges.length === 0;

  return (
    <ReviewThemesProvider projectId={projectId}>
      <section
        aria-label="Waiting for you"
        className="mb-5 rounded border border-line bg-panel-50 px-4 py-3.5 sm:flex sm:gap-10 sm:px-5"
      >
        <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400 sm:mb-0 sm:w-[120px] sm:shrink-0 sm:pt-0.5 sm:text-xs">
          Waiting for you
        </h2>
        <div className="flex flex-col gap-1.5 text-sm text-ink-900">
          {summary.clear && <p className="text-ink-500">Nothing is waiting for you.</p>}
          {summary.toReview && (
            <p>
              <strong>{pluralize(summary.toReview.total, "data point")}</strong> to review in{" "}
              {pluralize(summary.toReview.sources.length, "source")}
              <span className="hidden sm:inline">
                :{" "}
                {summary.toReview.sources.map((entry, index) => (
                  <span key={entry.sourceId}>
                    {index > 0 && ", "}
                    <Link
                      href={sourcePath(entry.sourceId, { projectId })}
                      className="font-bold text-brand-link hover:underline"
                    >
                      {entry.title}
                    </Link>{" "}
                    ({entry.count})
                  </span>
                ))}
              </span>
              {summary.toReview.sources.length === 1 && (
                <span className="sm:hidden">
                  {" "}
                  —{" "}
                  <Link
                    href={sourcePath(summary.toReview.sources[0]!.sourceId, { projectId })}
                    className="font-bold text-brand-link hover:underline"
                  >
                    open it
                  </Link>
                </span>
              )}
            </p>
          )}
          {summary.unthemed > 0 && (
            <p>
              <strong>{pluralize(summary.unthemed, "accepted data point")}</strong>{" "}
              {summary.unthemed === 1 ? "is" : "are"} not in a theme yet.{" "}
              <span className="hidden sm:inline">
                <ReviewThemesLink /> proposes where they go.
              </span>
            </p>
          )}
          {summary.suggestions > 0 && (
            <p>
              <strong>{pluralize(summary.suggestions, "suggestion")}</strong> below{" "}
              {summary.suggestions === 1 ? "is" : "are"} waiting for a decision.
            </p>
          )}
        </div>
      </section>

      <ReviewThemesStatus />

      {showNew && (
        <InlineCreateCard
          className="mb-5 max-w-2xl"
          title="New theme"
          action={createThemeFromForm}
          submitLabel="Add theme"
          cancelHref={projectPath(projectId, "themes")}
        >
          <input type="hidden" name="project_id" value={projectId} />
          <div className="flex flex-col gap-3">
            {error && <Alert>{error}</Alert>}
            <div>
              <Label htmlFor="theme-title">Theme</Label>
              <Input
                id="theme-title"
                name="title"
                required
                maxLength={THEME_TITLE_MAX}
                placeholder="Locals treated the fort's tunnels as a private playground"
              />
              <p className="mt-1 text-xs text-ink-500">
                A statement the sources can bear out or push against, not a topic.
              </p>
            </div>
            <div>
              <Label htmlFor="theme-definition">What it claims</Label>
              <Textarea
                id="theme-definition"
                name="definition"
                required
                rows={3}
                maxLength={THEME_DEFINITION_MAX}
                placeholder="Children explored the tunnels as an ordinary part of growing up, out of sight of adults."
              />
              <p className="mt-1 text-xs text-ink-500">
                Accepted data points are filed into it as they are accepted, and you can add them
                yourself from its page.
              </p>
            </div>
          </div>
        </InlineCreateCard>
      )}

      {empty ? (
        <EmptyState
          title="No themes yet"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <ReviewThemesButton className="max-sm:min-h-11" />
              <SecondaryLink
                href={`${projectPath(projectId, "themes")}&new=1`}
                className="max-sm:min-h-11"
              >
                + New theme
              </SecondaryLink>
            </div>
          }
        >
          {waiting.unthemed > 0
            ? `Review themes looks across your ${pluralize(waiting.unthemed, "accepted data point")} for claims several of them bear on. You can also write a theme yourself.`
            : "Themes form from accepted data points. Extract and review data points in your sources first, or write a theme yourself."}
        </EmptyState>
      ) : (
        <>
          <ListToolbar
            className="mb-4"
            search={{
              placeholder: "Search themes",
              label: "Search themes",
              defaultValue: search,
              hidden: {
                view: "themes",
                ...(status !== "all" ? { status } : {}),
                ...(questionId ? { question: questionId } : {}),
              },
            }}
            filters={[
              {
                label: "Status",
                chips: [
                  {
                    label: "All",
                    href: themesHref(projectId, { question: questionId }),
                    active: status === "all",
                    count: counts.accepted + counts.suggested,
                  },
                  {
                    label: "Accepted",
                    href: themesHref(projectId, { status: "accepted", question: questionId }),
                    active: status === "accepted",
                    count: counts.accepted,
                  },
                  {
                    label: "Suggested",
                    href: themesHref(projectId, { status: "suggested", question: questionId }),
                    active: status === "suggested",
                    count: counts.suggested,
                  },
                  ...(counts.rejected > 0
                    ? [
                        {
                          label: "Rejected",
                          href: themesHref(projectId, { status: "rejected", question: questionId }),
                          active: status === "rejected",
                          count: counts.rejected,
                        },
                      ]
                    : []),
                ],
              },
              ...(activeQuestions.length > 0
                ? [
                    {
                      label: "Question",
                      chips: [
                        {
                          label: "Any question",
                          href: themesHref(projectId, { status }),
                          active: questionId === null,
                        },
                        ...activeQuestions.map((question) => ({
                          label: question.label,
                          href: themesHref(projectId, { status, question: question.id }),
                          active: questionId === question.id,
                        })),
                      ],
                    },
                  ]
                : []),
            ]}
          >
            <SecondaryLink
              href={`${projectPath(projectId, "themes")}&new=1`}
              className="max-sm:min-h-11"
            >
              + New theme
            </SecondaryLink>
            <ReviewThemesButton className="max-sm:min-h-11" />
          </ListToolbar>

          {shown.length === 0 && !(showMerges && merges.length > 0) ? (
            <EmptyState compact>
              {search
                ? `No theme matches “${search}”.`
                : status === "rejected"
                  ? "No rejected themes."
                  : "No themes in this view."}
            </EmptyState>
          ) : (
            <TableFrame>
              <Table stack className="md:min-w-[760px]">
                <thead>
                  <HeaderRow>
                    <Th>Theme</Th>
                    <Th className="md:w-24">Sources</Th>
                    <Th className="md:w-24">Speakers</Th>
                    <Th className="md:w-44">Evidence</Th>
                    <Th className="md:w-52">Status</Th>
                  </HeaderRow>
                </thead>
                <tbody>
                  {shown.map((theme) => {
                    const href = themePath(projectId, theme.id);
                    const single = isSingleSource(theme.breadth, projectSources);
                    const line = questionLine(theme.questionIds, labels);
                    const suggested = theme.status === "suggested";
                    return (
                      <Row key={theme.id} className={suggested ? "bg-panel-50/60" : undefined}>
                        <Cell stack="title">
                          <Link
                            href={href}
                            className="font-semibold text-ink-900 hover:text-brand-link hover:underline"
                          >
                            {theme.title}
                          </Link>
                          <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-500">
                            {line && <span className="font-semibold text-ink-700">{line} · </span>}
                            {theme.definition}
                          </p>
                          {suggested && readsLikeTopic(theme.title) && (
                            <Badge
                              variant="warning"
                              className="mt-1.5"
                              title="A theme says something the sources can bear out. This reads like a subject heading; edit it into a statement."
                            >
                              Reads like a topic
                            </Badge>
                          )}
                        </Cell>
                        <Cell label="Sources">
                          {sourcesLabel(theme.breadth, projectSources)}
                          {single && (
                            <Badge variant="warning" className="ml-2 md:ml-0 md:mt-1 md:block">
                              Single source
                            </Badge>
                          )}
                        </Cell>
                        <Cell label="Speakers">{theme.breadth.speakerCount}</Cell>
                        <Cell label="Evidence">
                          <span className="md:block">{theme.breadth.supporting} supporting</span>
                          <span className="text-ink-500 md:block">
                            <span className="md:hidden"> · </span>
                            {theme.breadth.complicating} complicating
                          </span>
                        </Cell>
                        {suggested || theme.status === "rejected" ? (
                          <Cell stack="full">
                            {theme.status === "rejected" && (
                              <span className="mb-1 block text-[13px] text-ink-500">Rejected</span>
                            )}
                            <ThemeDecisionButtons
                              themeId={theme.id}
                              editHref={`${href}?edit=1`}
                              status={theme.status}
                            />
                          </Cell>
                        ) : (
                          <Cell stack="aside" className="text-[13px] text-ink-500">
                            Accepted
                          </Cell>
                        )}
                      </Row>
                    );
                  })}
                  {showMerges &&
                    merges.map((merge) => (
                      <Row key={merge.id} className="bg-panel-50/60">
                        <Cell stack="title" colSpan={4}>
                          <p className="font-semibold text-ink-900">
                            Merge “{merge.fromTitle}” into “{merge.intoTitle}”
                          </p>
                          <p className="mt-0.5 text-[13px] text-ink-500">
                            {merge.reason} Accepting moves its data points and records why in the
                            theme&apos;s memo.
                          </p>
                        </Cell>
                        <Cell stack="full">
                          <MergeDecisionButtons suggestionId={merge.id} />
                        </Cell>
                      </Row>
                    ))}
                </tbody>
              </Table>
            </TableFrame>
          )}

          <p className="mt-4 max-w-xl text-[13px] text-ink-500">
            Rejected suggestions are hidden, not deleted, and are not proposed again. Accepted
            themes are never changed by a later run.
          </p>
        </>
      )}
    </ReviewThemesProvider>
  );
}
