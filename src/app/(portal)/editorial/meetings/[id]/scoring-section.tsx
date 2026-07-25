import { PitchValues } from "@/components/editorial/pitch-values";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
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
  const allScored = scoredCount === slate.length;

  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-ink-900">Review the slate</h3>
        {canReview && slate.length > 0 && (
          <span
            className={allScored ? "text-xs font-semibold text-success-fg" : "text-xs text-ink-500"}
          >
            {allScored ? "All scored" : `Scored ${scoredCount} of ${slate.length}`}
          </span>
        )}
      </div>

      {canReview && criteria.length === 0 && (
        <Alert variant="info" className="mb-3">
          The rubric has no active criteria, so there is nothing to score against yet. An editor can
          add criteria in Settings → Rubric.
        </Alert>
      )}

      {!canReview && slate.length > 0 && (
        <p className="mb-3 text-xs leading-relaxed text-ink-400">
          Reviewers are scoring independently; scores are revealed when the editor closes scoring.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {slate.map(({ entry, pitch }) => {
          const own = ownReviewByEntry.get(entry.id);
          const ownScores = new Map(own?.scores.map((score) => [score.criterion_id, score.score]));
          return (
            <details key={entry.id} className="group rounded border border-line open:shadow-sm">
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded px-4 py-3 hover:bg-panel-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden="true"
                  className="text-ink-400 transition-transform group-open:rotate-90"
                >
                  ›
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-ink-900">
                  {pitch.title}
                </span>
                {canReview && (
                  <span
                    className={
                      own
                        ? "whitespace-nowrap text-xs font-semibold text-success-fg"
                        : "whitespace-nowrap text-xs font-semibold text-ink-400"
                    }
                  >
                    {own ? "✓ Scored" : "Not scored"}
                  </span>
                )}
              </summary>

              <div className="border-t border-line p-4">
                <PitchValues fields={fields} values={valuesByPitch.get(pitch.id) ?? []} />

                {canReview && criteria.length > 0 && (
                  <form action={submitReview} className="mt-5 border-t border-line pt-4">
                    <input type="hidden" name="meeting_id" value={meetingId} />
                    <input type="hidden" name="entry_id" value={entry.id} />

                    <div className="flex flex-col gap-4">
                      {criteria.map((criterion) => (
                        <fieldset key={criterion.id}>
                          <legend className="text-xs font-semibold text-ink-700">
                            {criterion.name}
                            {criterion.weight !== 1 && (
                              <span className="ml-1.5 font-normal text-ink-400">
                                ×{criterion.weight}
                              </span>
                            )}
                          </legend>
                          {criterion.guidance && (
                            <p className="mt-0.5 text-[11px] leading-snug text-ink-400">
                              {criterion.guidance}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {scaleValues.map((value) => (
                              <label
                                key={value}
                                className="relative cursor-pointer text-sm"
                                title={
                                  value === settings.scale_min
                                    ? "Lowest"
                                    : value === settings.scale_max
                                      ? "Highest"
                                      : undefined
                                }
                              >
                                <input
                                  type="radio"
                                  name={`score_${criterion.id}`}
                                  value={value}
                                  required
                                  defaultChecked={ownScores.get(criterion.id) === value}
                                  className="peer sr-only"
                                />
                                <span className="flex h-9 w-9 items-center justify-center rounded border border-line font-semibold text-ink-500 transition-colors hover:border-brand-primary peer-checked:border-brand-primary peer-checked:bg-brand-surface peer-checked:text-brand-link peer-focus-visible:ring-2 peer-focus-visible:ring-brand-surface">
                                  {value}
                                </span>
                              </label>
                            ))}
                            <span className="ml-1 text-[11px] text-ink-400">
                              {settings.scale_min} lowest · {settings.scale_max} highest
                            </span>
                          </div>
                        </fieldset>
                      ))}

                      <div>
                        <label
                          htmlFor={`comment_${entry.id}`}
                          className="mb-1.5 block text-xs font-semibold text-ink-700"
                        >
                          Comment
                          <span className="ml-1.5 font-normal text-ink-400">
                            optional · visible to the room after scoring closes
                          </span>
                        </label>
                        <Textarea
                          id={`comment_${entry.id}`}
                          name="comment"
                          rows={2}
                          defaultValue={own?.review.comment ?? ""}
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
