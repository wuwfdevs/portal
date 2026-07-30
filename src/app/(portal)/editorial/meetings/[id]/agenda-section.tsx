import Link from "next/link";
import { OutcomeBadge } from "@/components/editorial/outcome-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { formatScore } from "@/lib/editorial/format";
import { weightedReviewScore, type PitchAggregate } from "@/lib/editorial/scoring";
import { CONCERN_FLAG_LABEL, RECOMMENDATION_LABEL } from "@/lib/editorial/review";
import type {
  CriterionRow,
  Member,
  MeetingPitchRow,
  PitchRow,
  ReviewWithScores,
} from "@/lib/editorial/data";
import { recordDecision } from "../actions";

export interface AgendaItem {
  entry: MeetingPitchRow;
  pitch: PitchRow;
  reviews: ReviewWithScores[];
  aggregate: PitchAggregate;
  adjustedScore: number | null;
  modifierApplied: boolean;
}

/**
 * The ranked agenda a meeting runs off once scoring closes. Ranking organizes
 * the conversation; the decision buttons don't care about rank order —
 * editorial discretion is the point. Core score, the institutional modifier,
 * and the adjusted priority score are shown as three distinct numbers — the
 * modifier never edits the core score, only adds to a separate total, and
 * only once it clears the configured threshold (design §4A).
 */
export function AgendaSection({
  meetingId,
  items,
  criteria,
  names,
  members,
  canDecide,
}: {
  meetingId: string;
  items: AgendaItem[];
  criteria: CriterionRow[];
  names: Map<string, string>;
  members: Member[];
  canDecide: boolean;
}) {
  const criterionById = new Map(criteria.map((criterion) => [criterion.id, criterion]));

  return (
    <section className="flex flex-col gap-2.5">
      {items.map(({ entry, pitch, reviews, aggregate, adjustedScore, modifierApplied }, index) => {
        const contested = aggregate.spread !== null && aggregate.spread >= 1.5;
        return (
          <div key={entry.id} className="rounded border border-line">
            <div className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel-100 font-serif text-sm font-bold text-ink-500">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/editorial/pitches/${pitch.id}`}
                  className="text-sm font-semibold text-ink-900 hover:text-brand-link hover:underline"
                >
                  {pitch.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-400">
                  <span>
                    Core{" "}
                    <span className="font-semibold tabular-nums text-ink-700">
                      {formatScore(aggregate.average)}
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Modifier{" "}
                    <span className="font-semibold tabular-nums text-ink-700">
                      {aggregate.modifierAverage === null
                        ? "n/a"
                        : formatScore(aggregate.modifierAverage)}
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Adjusted{" "}
                    <span className="font-semibold tabular-nums text-ink-700">
                      {formatScore(adjustedScore)}
                    </span>
                    {modifierApplied && (
                      <span className="ml-1 text-brand-link" title="Modifier applied">
                        ↑
                      </span>
                    )}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    spread <span className="tabular-nums">{formatScore(aggregate.spread)}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {aggregate.reviewerCount} {aggregate.reviewerCount === 1 ? "review" : "reviews"}
                  </span>
                  {contested && (
                    <span title="Reviewers disagree — worth discussing">
                      <Badge variant="danger">Split</Badge>
                    </span>
                  )}
                </div>
                {reviews.some((r) => r.review.concern_flags.length > 0) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {Array.from(new Set(reviews.flatMap((r) => r.review.concern_flags))).map(
                      (flag) => (
                        <Badge key={flag} variant="danger">
                          {CONCERN_FLAG_LABEL[flag]}
                        </Badge>
                      ),
                    )}
                  </div>
                )}
              </div>
              <OutcomeBadge outcome={entry.outcome} />
            </div>

            <details className="border-t border-line">
              <summary className="cursor-pointer list-none px-4 py-2 text-xs font-semibold text-brand-link hover:bg-panel-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface [&::-webkit-details-marker]:hidden">
                Scores, recommendations &amp; comments
              </summary>
              <div className="border-t border-line px-4 py-3">
                {reviews.length === 0 ? (
                  <p className="text-xs text-ink-400">No reviews were submitted.</p>
                ) : (
                  <>
                    <ul className="flex flex-col gap-1">
                      {Array.from(aggregate.criterionMeans.entries()).map(([criterionId, mean]) => {
                        const criterion = criterionById.get(criterionId);
                        return (
                          <li key={criterionId} className="text-xs text-ink-500">
                            {criterion?.name ?? "Retired criterion"}
                            {criterion?.criterion_type === "modifier" && (
                              <span className="ml-1 text-ink-400">(modifier)</span>
                            )}
                            {": "}
                            <span className="font-semibold text-ink-700">{formatScore(mean)}</span>
                          </li>
                        );
                      })}
                    </ul>
                    <ul className="mt-2.5 flex flex-col gap-1 border-t border-line pt-2.5">
                      {reviews.map(({ review, scores }) => (
                        <li key={review.id} className="text-xs text-ink-500">
                          <span className="font-semibold text-ink-700">
                            {names.get(review.reviewer_id) ?? "Reviewer"}
                          </span>{" "}
                          —{" "}
                          {formatScore(
                            weightedReviewScore(
                              scores.map((score) => ({
                                criterionId: score.criterion_id,
                                score: score.score,
                                weight: score.weight_snapshot,
                                criterionType:
                                  criterionById.get(score.criterion_id)?.criterion_type ?? "core",
                              })),
                            ),
                          )}
                          {review.recommendation && (
                            <span className="ml-1.5">
                              <Badge variant="neutral">
                                {RECOMMENDATION_LABEL[review.recommendation]}
                              </Badge>
                            </span>
                          )}
                          {review.concern_flags.length > 0 && (
                            <span className="ml-1.5 text-ink-400">
                              {review.concern_flags
                                .map((flag) => CONCERN_FLAG_LABEL[flag])
                                .join(", ")}
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

            {entry.outcome !== null && (
              <div className="border-t border-line bg-panel-50 px-4 py-2.5 text-xs text-ink-500">
                {entry.outcome === "assigned" && (
                  <>
                    Assigned to{" "}
                    <span className="font-semibold text-ink-700">
                      {names.get(entry.assigned_to ?? "") ?? "—"}
                    </span>
                  </>
                )}
                {entry.outcome === "deferred" && "Deferred — stays in the backlog"}
                {entry.outcome === "archived" && "Archived"}
                {entry.rationale && ` · ${entry.rationale}`}
              </div>
            )}

            {canDecide && (
              <form action={recordDecision} className="border-t border-line px-4 py-3">
                <input type="hidden" name="meeting_id" value={meetingId} />
                <input type="hidden" name="entry_id" value={entry.id} />
                <div className="flex flex-wrap items-center gap-2.5">
                  <Select
                    name="assigned_to"
                    defaultValue={entry.assigned_to ?? ""}
                    aria-label={`Assign ${pitch.title} to`}
                    className="w-auto min-w-44 py-2 text-xs"
                  >
                    <option value="">Assign to…</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </Select>
                  <Input
                    name="rationale"
                    defaultValue={entry.rationale ?? ""}
                    placeholder="Rationale (optional)"
                    aria-label={`Rationale for ${pitch.title}`}
                    maxLength={300}
                    className="min-w-40 flex-1 py-2 text-xs"
                  />
                  <div className="flex gap-1.5">
                    <Button type="submit" name="outcome" value="assigned" className="px-3 py-2">
                      Assign
                    </Button>
                    <Button
                      type="submit"
                      name="outcome"
                      value="deferred"
                      variant="secondary"
                      className="px-3 py-2"
                    >
                      Defer
                    </Button>
                    <Button
                      type="submit"
                      name="outcome"
                      value="archived"
                      variant="secondary"
                      className="px-3 py-2"
                    >
                      Archive
                    </Button>
                  </div>
                </div>
                {entry.outcome !== null && (
                  <p className="mt-2 text-[11px] text-ink-400">
                    Already decided — saving again replaces the recorded decision.
                  </p>
                )}
              </form>
            )}
          </div>
        );
      })}
    </section>
  );
}
