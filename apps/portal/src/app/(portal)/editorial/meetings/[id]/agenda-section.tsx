import Link from "next/link";
import { OutcomeBadge } from "@/components/editorial/outcome-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatScore } from "@/lib/editorial/format";
import { weightedReviewScore, type PitchAggregate } from "@/lib/editorial/scoring";
import { CONCERN_FLAG_LABEL, RECOMMENDATION_LABEL } from "@/lib/editorial/review";
import { pluralize } from "@/lib/format";
import type {
  CriterionRow,
  Member,
  MeetingPitchRow,
  PitchRow,
  ReviewWithScores,
} from "@/lib/editorial/data";
import { DecisionForm } from "./decision-form";

export interface AgendaItem {
  entry: MeetingPitchRow;
  pitch: PitchRow;
  reviews: ReviewWithScores[];
  aggregate: PitchAggregate;
  adjustedScore: number | null;
  modifierApplied: boolean;
  /** "Pillar · Format · Submitter", from the pitch's answers. */
  meta: string;
}

/** Reviewers' core scores this far apart, or more, mark a pitch Split — worth discussing. */
export const SPLIT_SPREAD = 1.5;

/**
 * The ranked agenda a meeting runs off once scoring closes. Ranking organizes
 * the conversation; the decision doesn't care about rank order — editorial
 * discretion is the point. One number leads each row, the adjusted score the
 * agenda is ranked by, with the core average and the institutional modifier
 * as its breakdown underneath: the modifier never edits the core score, only
 * adds to a separate total, and only once the core clears the configured
 * threshold (design §4A). A decided item collapses to its outcome plus a
 * "Change" disclosure: the room works down the undecided ones.
 */
export function AgendaSection({
  meetingId,
  items,
  criteria,
  names,
  members,
  canDecide,
  modifierMinCoreScore,
}: {
  meetingId: string;
  items: AgendaItem[];
  criteria: CriterionRow[];
  names: Map<string, string>;
  members: Member[];
  canDecide: boolean;
  modifierMinCoreScore: number;
}) {
  const criterionById = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const firstUndecided = items.find(({ entry }) => entry.outcome === null)?.entry.id ?? null;
  const adjustedTitle = `Adjusted = core average + institutional modifier, added once the core clears ${formatScore(modifierMinCoreScore)}`;

  return (
    <section className="flex flex-col gap-3" aria-label="Ranked agenda">
      {items.map(
        ({ entry, pitch, reviews, aggregate, adjustedScore, modifierApplied, meta }, index) => {
          const contested = aggregate.spread !== null && aggregate.spread >= SPLIT_SPREAD;
          const decided = entry.outcome !== null;
          const current = canDecide && entry.id === firstUndecided;
          const flags = Array.from(new Set(reviews.flatMap((r) => r.review.concern_flags)));
          const decisionForm = canDecide ? (
            <DecisionForm
              meetingId={meetingId}
              entry={entry}
              pitchTitle={pitch.title}
              members={members}
            />
          ) : null;

          return (
            <Card
              key={entry.id}
              id={current ? "current" : undefined}
              className={cn(current && "border-brand-primary ring-1 ring-brand-primary")}
            >
              <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3.5 gap-y-3 px-4 py-4 sm:grid-cols-[2rem_minmax(0,1fr)_auto]">
                <span className="flex size-8 items-center justify-center rounded-full bg-panel-100 font-serif text-sm font-bold text-ink-700">
                  {index + 1}
                </span>
                <div className="min-w-0 flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/editorial/pitches/${pitch.id}`}
                      className="text-body font-semibold text-ink-900 hover:text-brand-link hover:underline"
                    >
                      {pitch.title}
                    </Link>
                    {contested && (
                      <Badge
                        variant="warning"
                        title={`Reviewers' core scores are ${SPLIT_SPREAD} or more apart — worth discussing`}
                      >
                        Split
                      </Badge>
                    )}
                  </div>
                  {meta && <p className="text-ui text-ink-500">{meta}</p>}
                  {flags.length > 0 && (
                    <p className="text-ui text-ink-500">
                      {pluralize(flags.length, "concern")}:{" "}
                      {flags.map((flag) => CONCERN_FLAG_LABEL[flag]).join(" · ")}
                    </p>
                  )}

                  <details className="mt-1">
                    <summary className="w-fit cursor-pointer list-none text-xs font-bold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface [&::-webkit-details-marker]:hidden">
                      Scores, recommendations and comments
                    </summary>
                    <div className="mt-2.5 flex flex-col gap-2.5 rounded bg-panel-50 px-3.5 py-3 text-ui">
                      {reviews.length === 0 ? (
                        <p className="text-ink-400">No reviews were submitted.</p>
                      ) : (
                        <>
                          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-ink-700">
                            {Array.from(aggregate.criterionMeans.entries()).map(
                              ([criterionId, mean]) => {
                                const criterion = criterionById.get(criterionId);
                                return (
                                  <li key={criterionId}>
                                    {criterion?.name ?? "Retired criterion"}
                                    {criterion?.criterion_type === "modifier" && (
                                      <span className="ml-1 text-ink-400">(modifier)</span>
                                    )}{" "}
                                    <span className="font-semibold">{formatScore(mean)}</span>
                                  </li>
                                );
                              },
                            )}
                          </ul>
                          <ul className="flex flex-col gap-1.5 border-t border-line pt-2.5 text-ink-700">
                            {reviews.map(({ review, scores }) => (
                              <li key={review.id} className="leading-relaxed">
                                <span className="font-semibold">
                                  {names.get(review.reviewer_id) ?? "Reviewer"}
                                </span>{" "}
                                {formatScore(
                                  weightedReviewScore(
                                    scores.map((score) => ({
                                      criterionId: score.criterion_id,
                                      score: score.score,
                                      weight: score.weight_snapshot,
                                      criterionType:
                                        criterionById.get(score.criterion_id)?.criterion_type ??
                                        "core",
                                    })),
                                  ),
                                )}
                                {review.recommendation && (
                                  <span className="mx-1.5">
                                    <Badge variant="neutral">
                                      {RECOMMENDATION_LABEL[review.recommendation]}
                                    </Badge>
                                  </span>
                                )}
                                {review.concern_flags.length > 0 && (
                                  <span className="text-warning-fg">
                                    {review.concern_flags
                                      .map((flag) => CONCERN_FLAG_LABEL[flag])
                                      .join(" · ")}
                                  </span>
                                )}
                                {review.comment && (
                                  <span className="text-ink-500"> · {review.comment}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </details>
                </div>

                <div className="col-start-2 flex flex-col gap-0.5 sm:col-start-3 sm:items-end sm:text-right">
                  <span
                    className="font-serif text-display font-bold leading-none text-brand-link"
                    title={adjustedTitle}
                  >
                    {formatScore(adjustedScore)}
                  </span>
                  <span className="text-ui text-ink-500">
                    {aggregate.modifierAverage === null
                      ? `Core ${formatScore(aggregate.average)} · no modifier`
                      : modifierApplied
                        ? `Core ${formatScore(aggregate.average)} + Modifier ${formatScore(aggregate.modifierAverage)}`
                        : `Core ${formatScore(aggregate.average)} · modifier ${formatScore(aggregate.modifierAverage)} not applied`}
                  </span>
                  <span
                    className={cn(
                      "text-ui",
                      contested ? "font-semibold text-warning-fg" : "text-ink-500",
                    )}
                    title="Spread is the gap between the highest and lowest core score"
                  >
                    {aggregate.spread !== null && `Spread ${formatScore(aggregate.spread)} · `}
                    {pluralize(aggregate.reviewerCount, "review")}
                  </span>
                </div>
              </div>

              {decided ? (
                decisionForm ? (
                  <details className="border-t border-line">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2.5 bg-panel-50 px-4 py-3 hover:bg-panel-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface [&::-webkit-details-marker]:hidden">
                      <OutcomeLine entry={entry} names={names} />
                      <span className="shrink-0 text-xs font-bold text-brand-link">Change</span>
                    </summary>
                    <div className="border-t border-line">{decisionForm}</div>
                  </details>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-line bg-panel-50 px-4 py-3">
                    <OutcomeLine entry={entry} names={names} />
                  </div>
                )
              ) : (
                ((decisionForm && (
                  <div className="border-t border-line bg-panel-50">{decisionForm}</div>
                )) ?? (
                  <div className="border-t border-line bg-panel-50 px-4 py-3">
                    <OutcomeBadge outcome={null} />
                  </div>
                ))
              )}
            </Card>
          );
        },
      )}
    </section>
  );
}

/** The recorded decision, read as one line: badge, who/what, then rationale. */
function OutcomeLine({ entry, names }: { entry: MeetingPitchRow; names: Map<string, string> }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2 text-ui text-ink-500">
      <OutcomeBadge outcome={entry.outcome} />
      <span>
        {entry.outcome === "assigned" && (
          <>
            to{" "}
            <span className="font-semibold text-ink-700">
              {names.get(entry.assigned_to ?? "") ?? "—"}
            </span>
          </>
        )}
        {entry.outcome === "deferred" && "Stays in the backlog"}
        {entry.outcome === "archived" && "Parked, kept on the record"}
        {entry.rationale && ` · ${entry.rationale}`}
      </span>
    </span>
  );
}
