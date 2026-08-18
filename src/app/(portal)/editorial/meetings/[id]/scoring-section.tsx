"use client";

import { useState } from "react";
import { PitchValues, fieldsWithValues } from "@/components/editorial/pitch-values";
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
 *
 * A reviewer works one pitch at a time, so the expanded pitch leads with its
 * summary and keeps the rest of the submission behind a disclosure: the scoring
 * scale is what the screen is for, and it should not open below a screenful of
 * form fields.
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
  const showProgress = canReview && slate.length > 0;

  return (
    <section>
      <h3 className="mb-2.5 text-sm font-bold text-ink-900">Review the slate</h3>

      {showProgress && (
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span
              className={
                allScored
                  ? "text-[13px] font-semibold text-success-fg"
                  : "text-[13px] font-semibold text-ink-500"
              }
            >
              {allScored
                ? `All ${slate.length} scored`
                : `${scoredCount} of ${slate.length} scored`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={scoredCount}
            aria-valuemin={0}
            aria-valuemax={slate.length}
            aria-label="Pitches you have scored"
            className="h-1.5 overflow-hidden rounded-full bg-panel-100"
          >
            <div
              className="h-full rounded-full bg-brand-primary transition-[width]"
              style={{ width: `${Math.round((scoredCount / slate.length) * 100)}%` }}
            />
          </div>
        </div>
      )}

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
          const values = valuesByPitch.get(pitch.id) ?? [];
          const hasMoreFields = fieldsWithValues(fields, values).length > 1;
          return (
            <details key={entry.id} className="group rounded border border-line open:shadow-sm">
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded px-4 py-3.5 hover:bg-panel-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden="true"
                  className="text-ink-400 transition-transform group-open:rotate-90"
                >
                  ›
                </span>
                <span className="min-w-0 flex-1 text-[14.5px] font-semibold text-ink-900">
                  {pitch.title}
                </span>
                {canReview && (
                  <span
                    className={
                      own
                        ? "whitespace-nowrap text-xs font-bold text-success-fg"
                        : "whitespace-nowrap text-xs font-bold text-ink-400"
                    }
                  >
                    {own ? "✓ Scored" : "Not scored"}
                  </span>
                )}
              </summary>

              <div className="flex flex-col gap-4 border-t border-line p-4">
                <div>
                  <PitchValues fields={fields} values={values} slice="lead" />
                  {hasMoreFields && (
                    <details className="mt-2">
                      <summary className="w-fit cursor-pointer list-none text-xs font-bold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface [&::-webkit-details-marker]:hidden">
                        Show pitch details
                      </summary>
                      <div className="mt-2.5">
                        <PitchValues fields={fields} values={values} slice="rest" />
                      </div>
                    </details>
                  )}
                </div>

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
  const scoredModifier = modifierCriteria.some(
    (criterion) => ownScores.get(criterion.id) !== undefined,
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
    <form action={submitReview}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input type="hidden" name="entry_id" value={entryId} />

      <div className="flex flex-col gap-2.5 border-t border-line pt-3.5">
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
          // Collapsed by default: the modifier is optional and scored separately,
          // and an always-open box reads as a fourth criterion the reviewer owes
          // a number to.
          <details open={scoredModifier}>
            <summary className="w-fit cursor-pointer list-none py-1 text-xs font-bold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface [&::-webkit-details-marker]:hidden">
              + Institutional modifier <span className="font-normal text-ink-400">· optional</span>
            </summary>
            <div className="mt-2 flex flex-col gap-2.5">
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
          </details>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3.5">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-400">Wrap up</p>

        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
          <Select
            name="recommendation"
            required
            aria-label="Recommendation"
            value={recommendation}
            onChange={(event) => setRecommendation(event.target.value as EpRecommendation)}
            className="w-52 py-2"
          >
            <option value="" disabled>
              Recommendation…
            </option>
            {RECOMMENDATIONS.map((value) => (
              <option key={value} value={value}>
                {RECOMMENDATION_LABEL[value]}
              </option>
            ))}
          </Select>

          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="sr-only">Concerns (optional)</legend>
            {CONCERN_FLAGS.map((flag) => (
              <label key={flag} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="concern_flags"
                  value={flag}
                  checked={concernFlags.has(flag)}
                  onChange={() => toggleFlag(flag)}
                  className="peer sr-only"
                />
                <span className="inline-flex rounded-full border border-line px-2.5 py-1.5 text-[11.5px] text-ink-500 transition-colors hover:border-brand-primary peer-checked:border-danger peer-checked:bg-danger/[0.08] peer-checked:font-semibold peer-checked:text-danger peer-focus-visible:ring-2 peer-focus-visible:ring-brand-surface">
                  {CONCERN_FLAG_LABEL[flag]}
                </span>
              </label>
            ))}
          </fieldset>
        </div>

        <div>
          <Textarea
            id={`comment_${entryId}`}
            name="comment"
            rows={2}
            aria-label="Comment"
            placeholder="Comment — optional, visible to the room after scoring closes"
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

/**
 * One criterion on a single line — label left, scale right — so a reviewer
 * reads down a column of buttons rather than scrolling past a stack of
 * label-above-scale blocks.
 */
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
      <legend className="sr-only">
        {criterion.name} — {scaleMin} lowest, {scaleMax} highest
      </legend>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        <span
          aria-hidden="true"
          className="w-28 shrink-0 text-[13px] font-semibold text-ink-700"
          title={criterion.guidance ?? undefined}
        >
          {criterion.name}
          {criterion.criterion_type === "core" && criterion.weight !== 1 && (
            <span className="ml-1 font-normal text-ink-400">×{criterion.weight}</span>
          )}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {!required && (
            <label className="cursor-pointer" title="Leave unscored">
              <input
                type="radio"
                name={`score_${criterion.id}`}
                value=""
                defaultChecked={defaultValue === undefined}
                className="peer sr-only"
              />
              <span className="flex h-[30px] items-center justify-center rounded border border-dashed border-line px-2.5 text-[11px] font-semibold text-ink-400 transition-colors hover:border-brand-primary peer-checked:border-brand-primary peer-checked:bg-brand-surface peer-checked:text-brand-link peer-focus-visible:ring-2 peer-focus-visible:ring-brand-surface">
                N/A
              </span>
            </label>
          )}
          {scaleValues.map((value) => (
            <label
              key={value}
              className="cursor-pointer"
              title={anchors[String(value)] ?? `${criterion.name}: ${value}`}
            >
              <input
                type="radio"
                name={`score_${criterion.id}`}
                value={value}
                required={required}
                defaultChecked={defaultValue === value}
                className="peer sr-only"
              />
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded border border-line text-[12.5px] font-semibold text-ink-500 transition-colors hover:border-brand-primary peer-checked:border-brand-primary peer-checked:bg-brand-surface peer-checked:text-brand-link peer-focus-visible:ring-2 peer-focus-visible:ring-brand-surface">
                {value}
              </span>
            </label>
          ))}
        </div>
      </div>
      {criterion.guidance && (
        <p className="ml-[7.875rem] mt-1 text-[11px] leading-snug text-ink-400">
          {criterion.guidance}
        </p>
      )}
    </fieldset>
  );
}
