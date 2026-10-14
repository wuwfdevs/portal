import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Pagination } from "@/components/ui/pagination";
import { TextLink } from "@/components/ui/primary-link";
import { isPastLastPage, pageHref, pageInfo, parsePage } from "@/lib/pagination";
import { redirect } from "next/navigation";
import { KIND_LABEL } from "@/lib/sourcework/research";
import { listResearchQuestions } from "@/lib/sourcework/research-queries";
import {
  listProjectPoints,
  parsePointsFilter,
  type PointsFilter,
} from "@/lib/sourcework/points-browse";
import { projectPath, sourcePath } from "@/lib/transcription/links";

const FILTER_LABEL: Record<PointsFilter, string> = {
  accepted: "Accepted",
  rejected: "Rejected",
  all: "Both",
};

/**
 * The project's Data points section (`?view=points`): the findings already decided on, across its
 * sources, to browse and open in their source. Read-only; what is still waiting is on Review.
 */
export async function PointsTab({
  projectId,
  sources,
  filterParam,
  pageParam,
}: {
  projectId: string;
  sources: { id: string; title: string }[];
  filterParam: string | undefined;
  pageParam: string | undefined;
}) {
  const filter = parsePointsFilter(filterParam);
  const page = parsePage(pageParam);
  const base = projectPath(projectId, "points");
  const params = { filter: filter === "accepted" ? null : filter };
  const [{ rows, total }, questions] = await Promise.all([
    listProjectPoints(
      projectId,
      sources.map((source) => source.id),
      { filter, page },
    ),
    listResearchQuestions(projectId),
  ]);
  const info = pageInfo(page, total);
  if (isPastLastPage(info)) redirect(pageHref(base, params, info.pageCount));

  const titles = new Map(sources.map((source) => [source.id, source.title]));
  const labels = new Map(questions.map((question) => [question.id, question.label]));

  return (
    <>
      <FilterChips
        label="Show data points"
        className="mb-4"
        chips={(Object.keys(FILTER_LABEL) as PointsFilter[]).map((value) => ({
          label: FILTER_LABEL[value],
          href: pageHref(base, { filter: value === "accepted" ? null : value }, 1),
          active: filter === value,
        }))}
      />
      {rows.length === 0 ? (
        <EmptyState compact title="No data points here yet">
          Findings you accept on the{" "}
          <TextLink href={projectPath(projectId, "review")} className="px-0">
            Review tab
          </TextLink>{" "}
          appear here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded border border-line bg-white">
          {rows.map((row) => {
            const question =
              row.relevance === "story"
                ? "Story"
                : row.questionId
                  ? (labels.get(row.questionId) ?? null)
                  : null;
            return (
              <li key={row.id} className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  {KIND_LABEL[row.kind]}
                  {question ? ` · ${question}` : ""}
                  {row.status === "rejected" ? " · Rejected" : ""}
                </p>
                <p className="mt-1 text-sm text-ink-900">{row.claim}</p>
                {row.significance && (
                  <p className="mt-0.5 text-xs text-ink-500">{row.significance}</p>
                )}
                <Link
                  href={sourcePath(row.sourceId, { projectId })}
                  className="mt-1 inline-block text-xs font-semibold text-brand-link"
                >
                  {titles.get(row.sourceId) ?? "Open source"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination info={info} path={base} params={params} noun="data points" />
    </>
  );
}
