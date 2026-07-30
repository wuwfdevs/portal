"use client";

import { useState } from "react";
import { PitchValues } from "@/components/editorial/pitch-values";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import {
  CONCERN_FLAG_LABEL,
  CONCERN_FLAGS,
  RECOMMENDATION_LABEL,
  RECOMMENDATIONS,
} from "@/lib/editorial/review";
import type {
  CriterionRow,
  FormFieldRow,
  MeetingPitchRow,
  PitchRow,
  PitchValueRow,
  ReviewWithScores,
  SettingsRow,
} from "@/lib/editorial/data";
import type { EpConcernFlag, EpRecommendation } from "@/lib/database.types";
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
  const coreCriteria = criteria.filter((c) => c.criterion_type === "core");
  const modifierCriteria = criteria.filter((c) => c.criterion_type === "modifier");
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

      {canReview && coreCriteria.length === 0 && (
        <Alert variant="info" className="mb-3">
          This profile&apos;s rubric has no active core criteria, so there is nothing to score
          against yet. An editor can add criteria in Settings → Rubric.
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

                {canReview && coreCriteria.length > 0 && (
                  <ReviewForm
                    meetingId={meetingId}
                    entryId={entry.id}
                    coreCriteria={coreCriteria}
                    modifierCriteria={modifierCriteria}
                    settings={settings}
                    own={own}
                  />
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function ReviewForm({
  meetingId,
  entryId,
  coreCriteria,
  modifierCriteria,
  settings,
  own,
}: {
  meetingId: string;
  entryId: string;
  coreCriteria: CriterionRow[];
  modifierCriteria: CriterionRow[];
  settings: SettingsRow;
  own?: ReviewWithScores;
}) {
  const ownScores = new Map(own?.scores.map((score) => [score.criterion_id, score.score]));
  const [recommendation, setRecommendation] = useState<EpRecommendation | "">(
    own?.review.recommendation ?? "",
  );
  const [concernFlags, setConcernFlags] = useState<Set<EpConcernFlag>>(
    new Set(own?.review.concern_flags ?? []),
  );

  const toggleFlag = (flag: EpConcernFlag) => {
    setConcernFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  };

  return (
    <form action={submitReview} className="mt-5 border-t border-line pt-4">
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input type="hidden" name="entry_id" value={entryId} />

      <div className="flex flex-col gap-4">
        {coreCriteria.map((criterion) => (
          <ScoreField
            key={criterion.id}
            criterion={criterion}
            settings={settings}
            defaultValue={ownScores.get(criterion.id)}
            required
          />
        ))}

        {modifierCriteria.length > 0 && (
          <div className="rounded border border-dashed border-line px-3 py-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-500">
              Institutional modifier — optional, scored separately from the criteria above
            </p>
            {modifierCriteria.map((criterion) => (
              <ScoreField
                key={criterion.id}
                criterion={criterion}
                settings={settings}
                defaultValue={ownScores.get(criterion.id)}
                required={false}
              />
            ))}
          </div>
        )}

        <fieldset>
          <legend className="text-xs font-semibold text-ink-700">Recommendation</legend>
          <Select
            name="recommendation"
            required
            value={recommendation}
            onChange={(event) => setRecommendation(event.target.value as EpRecommendation)}
            className="mt-1.5"
          >
            <option value="" disabled>
              Choose…
            </option>
            {RECOMMENDATIONS.map((value) => (
              <option key={value} value={value}>
                {RECOMMENDATION_LABEL[value]}
              </option>
            ))}
          </Select>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-semibold text-ink-700">
            Concerns <span className="font-normal text-ink-400">optional</span>
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {CONCERN_FLAGS.map((flag) => (
              <label key={flag} className="flex items-center gap-1.5 text-xs text-ink-700">
                <input
                  type="checkbox"
                  name="concern_flags"
                  value={flag}
                  checked={concernFlags.has(flag)}
                  onChange={() => toggleFlag(flag)}
                  className="h-3.5 w-3.5"
                />
                {CONCERN_FLAG_LABEL[flag]}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor={`comment_${entryId}`}
            className="mb-1.5 block text-xs font-semibold text-ink-700"
          >
            Comment
            <span className="ml-1.5 font-normal text-ink-400">
              optional · visible to the room after scoring closes
            </span>
          </label>
          <Textarea
            id={`comment_${entryId}`}
            name="comment"
            rows={2}
            defaultValue={own?.review.comment ?? ""}
          />
          {concernFlags.size > 0 && (
            <p className="mt-1 text-[11px] text-ink-400">
              A concern is flagged — a sentence on why helps the room.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="secondary">
            {own ? "Update review" : "Save review"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ScoreField({
  criterion,
  settings,
  defaultValue,
  required,
}: {
  criterion: CriterionRow;
  settings: SettingsRow;
  defaultValue?: number;
  required: boolean;
}) {
  const scaleMin = criterion.scale_min ?? settings.scale_min;
  const scaleMax = criterion.scale_max ?? settings.scale_max;
  const scaleValues: number[] = [];
  for (let value = scaleMin; value <= scaleMax; value += 1) scaleValues.push(value);
  const anchors = criterion.anchors ?? {};

  return (
    <fieldset>
      <legend className="text-xs font-semibold text-ink-700">
        {criterion.name}
        {criterion.criterion_type === "core" && criterion.weight !== 1 && (
          <span className="ml-1.5 font-normal text-ink-400">×{criterion.weight}</span>
        )}
      </legend>
      {criterion.guidance && (
        <p className="mt-0.5 text-[11px] leading-snug text-ink-400">{criterion.guidance}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {!required && (
          <label className="relative cursor-pointer text-sm" title="Leave unscored">
            <input
              type="radio"
              name={`score_${criterion.id}`}
              value=""
              defaultChecked={defaultValue === undefined}
              className="peer sr-only"
            />
            <span className="flex h-9 w-9 items-center justify-center rounded border border-dashed border-line text-[11px] font-semibold text-ink-400 transition-colors hover:border-brand-primary peer-checked:border-brand-primary peer-checked:bg-brand-surface peer-checked:text-brand-link peer-focus-visible:ring-2 peer-focus-visible:ring-brand-surface">
              N/A
            </span>
          </label>
        )}
        {scaleValues.map((value) => (
          <label
            key={value}
            className="relative cursor-pointer text-sm"
            title={anchors[String(value)] ?? undefined}
          >
            <input
              type="radio"
              name={`score_${criterion.id}`}
              value={value}
              required={required}
              defaultChecked={defaultValue === value}
              className="peer sr-only"
            />
            <span className="flex h-9 w-9 items-center justify-center rounded border border-line font-semibold text-ink-500 transition-colors hover:border-brand-primary peer-checked:border-brand-primary peer-checked:bg-brand-surface peer-checked:text-brand-link peer-focus-visible:ring-2 peer-focus-visible:ring-brand-surface">
              {value}
            </span>
          </label>
        ))}
        <span className="ml-1 text-[11px] text-ink-400">
          {scaleMin} lowest · {scaleMax} highest
        </span>
      </div>
      {anchors[String(defaultValue)] && (
        <p className="mt-1 text-[11px] italic text-ink-400">{anchors[String(defaultValue)]}</p>
      )}
    </fieldset>
  );
}
