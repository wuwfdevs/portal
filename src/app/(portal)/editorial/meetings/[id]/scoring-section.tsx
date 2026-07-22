import { PitchValues } from "@/components/editorial/pitch-values";
import { Button } from "@/components/ui/button";
import type {
  CriterionRow,
  FormFieldRow,
  MeetingPitchRow,
  PitchRow,
  PitchValueRow,
  ReviewWithScores,
  SettingsRow,
} from "@/lib/editorial/data";
import { submitReview } from "../actions";

/**
 * The independent-review UI while a meeting is open. Each reviewer sees the
 * slate with their own saved scores only — colleagues' reviews are hidden by
 * RLS until scoring closes, so nothing here needs to filter them.
 */
export function ScoringSection({
  meetingId,
  slate,
  fields,
  valuesByPitch,
  criteria,
  settings,
  ownReviewByEntry,
  canReview,
}: {
  meetingId: string;
  slate: { entry: MeetingPitchRow; pitch: PitchRow }[];
  fields: FormFieldRow[];
  valuesByPitch: Map<string, PitchValueRow[]>;
  criteria: CriterionRow[];
  settings: SettingsRow;
  ownReviewByEntry: Map<string, ReviewWithScores>;
  canReview: boolean;
}) {
  const scaleValues: number[] = [];
  for (let value = settings.scale_min; value <= settings.scale_max; value += 1) {
    scaleValues.push(value);
  }
  const scoredCount = slate.filter(({ entry }) => ownReviewByEntry.has(entry.id)).length;

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-ink-900">Review the slate</h3>
        {canReview && slate.length > 0 && (
          <span className="text-xs text-ink-500">
            Your progress: {scoredCount} / {slate.length}
          </span>
        )}
      </div>
      {!canReview && slate.length > 0 && (
        <p className="mb-3 text-xs text-ink-400">
          Reviewers are scoring independently; scores are revealed when the editor closes scoring.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {slate.map(({ entry, pitch }) => {
          const own = ownReviewByEntry.get(entry.id);
          const ownScores = new Map(own?.scores.map((score) => [score.criterion_id, score.score]));
          return (
            <details key={entry.id} className="rounded border border-line">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold text-ink-900">{pitch.title}</span>
                <span className="flex-1" />
                {canReview && (
                  <span className="text-xs font-semibold text-ink-400">
                    {own ? "✓ scored" : "not scored"}
                  </span>
                )}
              </summary>
              <div className="border-t border-line p-4">
                <PitchValues fields={fields} values={valuesByPitch.get(pitch.id) ?? []} />
                {canReview && (
                  <form action={submitReview} className="mt-4 border-t border-line pt-4">
                    <input type="hidden" name="meeting_id" value={meetingId} />
                    <input type="hidden" name="entry_id" value={entry.id} />
                    <div className="flex flex-col gap-3">
                      {criteria.map((criterion) => (
                        <div key={criterion.id} className="flex flex-wrap items-center gap-3">
                          <div className="w-56">
                            <div className="text-xs font-semibold text-ink-700">
                              {criterion.name}
                            </div>
                            {criterion.guidance && (
                              <div className="text-[11px] leading-snug text-ink-400">
                                {criterion.guidance}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {scaleValues.map((value) => (
                              <label
                                key={value}
                                className="flex cursor-pointer items-center gap-1 text-sm text-ink-700"
                              >
                                <input
                                  type="radio"
                                  name={`score_${criterion.id}`}
                                  value={value}
                                  required
                                  defaultChecked={ownScores.get(criterion.id) === value}
                                />
                                {value}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div>
                        <label
                          htmlFor={`comment_${entry.id}`}
                          className="mb-1.5 block text-xs font-semibold text-ink-700"
                        >
                          Comment (optional, visible to the room after scoring closes)
                        </label>
                        <textarea
                          id={`comment_${entry.id}`}
                          name="comment"
                          rows={2}
                          defaultValue={own?.review.comment ?? ""}
                          className="w-full rounded border border-line px-3 py-2 text-sm text-ink-900"
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button type="submit" variant="secondary">
                          {own ? "Update review" : "Save review"}
                        </Button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
