import Link from "next/link";
import { OutcomeBadge } from "@/components/editorial/outcome-badge";
import { Button } from "@/components/ui/button";
import { formatScore } from "@/lib/editorial/format";
import { weightedReviewScore, type PitchAggregate } from "@/lib/editorial/scoring";
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
}

/**
 * The ranked agenda a meeting runs off once scoring closes. Ranking organizes
 * the conversation; the decision buttons don't care about rank order —
 * editorial discretion is the point.
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
    <section className="flex flex-col gap-3">
      {items.map(({ entry, pitch, reviews, aggregate }, index) => (
        <div key={entry.id} className="rounded border border-line">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="w-6 text-center font-serif text-[17px] font-bold text-ink-400">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/editorial/pitches/${pitch.id}`}
                className="text-sm font-semibold text-ink-900 hover:text-brand-link"
              >
                {pitch.title}
              </Link>
              <div className="text-xs text-ink-400">
                Score{" "}
                <span className="font-semibold text-ink-700">{formatScore(aggregate.average)}</span>
                {" · "}spread {formatScore(aggregate.spread)}
                {aggregate.spread !== null && aggregate.spread >= 1.5 && (
                  <span title="Reviewers disagree — worth discussing"> ⚠</span>
                )}
                {" · "}
                {aggregate.reviewerCount} {aggregate.reviewerCount === 1 ? "review" : "reviews"}
              </div>
            </div>
            <OutcomeBadge outcome={entry.outcome} />
          </div>

          <details className="border-t border-line">
            <summary className="cursor-pointer list-none px-4 py-2 text-xs font-semibold text-brand-link [&::-webkit-details-marker]:hidden">
              Scores &amp; comments
            </summary>
            <div className="border-t border-line px-4 py-3">
              {reviews.length === 0 ? (
                <p className="text-xs text-ink-400">No reviews were submitted.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1">
                    {Array.from(aggregate.criterionMeans.entries()).map(([criterionId, mean]) => (
                      <li key={criterionId} className="text-xs text-ink-500">
                        {criterionById.get(criterionId)?.name ?? "Retired criterion"}:{" "}
                        <span className="font-semibold text-ink-700">{formatScore(mean)}</span>
                      </li>
                    ))}
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
                            })),
                          ),
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
            <form
              action={recordDecision}
              className="flex flex-wrap items-center gap-2.5 border-t border-line px-4 py-3"
            >
              <input type="hidden" name="meeting_id" value={meetingId} />
              <input type="hidden" name="entry_id" value={entry.id} />
              <select
                name="assigned_to"
                defaultValue={entry.assigned_to ?? ""}
                aria-label="Assign to"
                className="rounded border border-line px-2.5 py-1.5 text-xs text-ink-900"
              >
                <option value="">Assign to…</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </select>
              <input
                name="rationale"
                defaultValue={entry.rationale ?? ""}
                placeholder="Rationale (optional)"
                className="min-w-40 flex-1 rounded border border-line px-2.5 py-1.5 text-xs text-ink-900 placeholder:text-ink-400"
              />
              <div className="flex gap-1.5">
                <Button type="submit" name="outcome" value="assigned">
                  Assign
                </Button>
                <Button type="submit" name="outcome" value="deferred" variant="secondary">
                  Defer
                </Button>
                <Button type="submit" name="outcome" value="archived" variant="secondary">
                  Archive
                </Button>
              </div>
            </form>
          )}
        </div>
      ))}
    </section>
  );
}
