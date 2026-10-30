import { EmptyState } from "@/components/ui/empty-state";
import { TextLink } from "@/components/ui/primary-link";
import { getProjectReview, type ReviewSource } from "@/lib/sourcework/review-queries";
import { projectPath } from "@/lib/transcription/links";
import { ReviewList } from "./review-list";

/**
 * The project's Review tab (`?view=review`, docs/sourcework-analysis-design.md §25): every finding and
 * clip Analyze left waiting, across all sources, on one screen. Deciding on one source at a time is
 * still possible from the source's own screen; this is the default place to go through the lot.
 */
export async function ReviewTab({
  projectId,
  sources,
}: {
  projectId: string;
  sources: ReviewSource[];
}) {
  const review = await getProjectReview(projectId, sources);

  if (review.groups.length === 0) {
    return (
      <EmptyState compact title="Nothing waiting for review">
        Findings and clips that Analyze suggests appear here, from every source at once. Analyze
        your sources on the{" "}
        <TextLink href={projectPath(projectId)} className="px-0">
          Sources tab
        </TextLink>{" "}
        to fill it.
      </EmptyState>
    );
  }

  return (
    <ReviewList
      projectId={projectId}
      groups={review.groups}
      labels={review.labels}
      questionTexts={review.questionTexts}
      background={review.background}
      pagesConsulted={review.pagesConsulted}
      pointCount={review.pointCount}
      clipCount={review.clipCount}
    />
  );
}
