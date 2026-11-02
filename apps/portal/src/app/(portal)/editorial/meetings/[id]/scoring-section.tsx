"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PitchValues, fieldsWithValues } from "@/components/editorial/pitch-values";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ControlRow } from "@/components/ui/control-row";
import { EmptyState } from "@/components/ui/empty-state";
import { FloatingPanel, useDetailsMenu } from "@/components/ui/floating-panel";
import { Field, Select, Textarea } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/cn";
import {
  CONCERN_FLAG_LABEL,
  CONCERN_FLAGS,
  RECOMMENDATION_LABEL,
  RECOMMENDATIONS,
} from "@/lib/editorial/review";
import { fieldText, FORMAT_FIELD_KEY, URGENCY_FIELD_KEY } from "@/lib/editorial/backlog-filters";
import { PRIMARY_PILLAR_FIELD_KEY } from "@/lib/editorial/form";
import { neighbours, nextUnscoredEntryId } from "@/lib/editorial/slate-navigation";
import type {
  CriterionRow,
  FormFieldRow,
  MeetingPitchRow,
  PitchListEntry,
  PitchRow,
  PitchValueRow,
  ReviewWithScores,
  SettingsRow,
} from "@/lib/editorial/data";
import type { EpConcernFlag, EpFieldValue, EpRecommendation } from "@/lib/database.types";
import { addPitchToSlate, removePitchFromSlate, submitReview } from "../actions";

/**
 * The independent-review screen while a meeting is open. The slate is a rail
 * on the left (from lg) or a sticky previous / pick / next strip above (a
 * phone), and the chosen pitch — `?pitch=<entryId>` — stays open beside it
 * with its scoring form; "Save and go to next unscored" moves on. Every save
 * used to reload the page and collapse one accordion per pitch, so a reviewer
 * re-found their place after each one. Each reviewer still sees only their own
 * saved scores: colleagues' reviews are hidden by RLS until scoring closes.
 *
 * For an editor this is also the only place the slate is built: "+ Add pitch"
 * sits at the top of the rail and "Remove from slate" in the open pitch.
 */
export function ScoringSection({
  meetingId,
  slate,
  selectedEntryId,
  fields,
  valuesByPitch,
  criteria,
  settings,
  ownReviewByEntry,
  canReview,
  isEditor,
  candidates,
}: {
  meetingId: string;
  /** In display order (`slateOrder`). */
  slate: { entry: MeetingPitchRow; pitch: PitchRow }[];
  selectedEntryId: string | null;
  fields: FormFieldRow[];
  valuesByPitch: Map<string, PitchValueRow[]>;
  criteria: CriterionRow[];
  settings: SettingsRow;
  ownReviewByEntry: Map<string, ReviewWithScores>;
  canReview: boolean;
  isEditor: boolean;
  candidates: PitchListEntry[];
}) {
  const coreCriteria = criteria.filter((c) => c.criterion_type === "core");
  const modifierCriteria = criteria.filter((c) => c.criterion_type === "modifier");
  const order = slate.map(({ entry }) => entry.id);
  const scored = new Set(order.filter((id) => ownReviewByEntry.has(id)));
  const scoredCount = scored.size;
  const allScored = slate.length > 0 && scoredCount === slate.length;
  const selected = slate.find(({ entry }) => entry.id === selectedEntryId) ?? null;
  const position = selected ? order.indexOf(selected.entry.id) + 1 : 0;
  const { previous, next } = neighbours(order, selectedEntryId);
  const nextUnscored = nextUnscoredEntryId(order, scored, selectedEntryId);
  const leftAfterThis = order.filter((id) => id !== selectedEntryId && !scored.has(id)).length;
  const hrefFor = (entryId: string) => `/editorial/meetings/${meetingId}?pitch=${entryId}`;

  const progress =
    canReview && slate.length > 0 ? (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3 text-ui">
          <span className={cn("font-semibold", allScored ? "text-success-fg" : "text-ink-700")}>
            {allScored ? `All ${slate.length} scored` : `${scoredCount} of ${slate.length} scored`}
          </span>
          {!allScored && <span className="text-ink-500">{slate.length - scoredCount} left</span>}
        </div>
        <ProgressBar
          label="Pitches you have scored"
          done={scoredCount}
          total={slate.length}
          complete={allScored}
        />
      </div>
    ) : null;

  const add = isEditor ? <AddPitchControl meetingId={meetingId} candidates={candidates} /> : null;

  if (slate.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink-900">Review the slate</h3>
          {add}
        </div>
        <EmptyState className="leading-relaxed">
          No pitches on the slate yet.{" "}
          {isEditor ? "Add one from the backlog." : "An editor is still building it."}
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      {/* The rail: every pitch on the slate, scored or not, from lg up. */}
      <aside aria-label="Pitches on the slate" className="hidden lg:flex lg:flex-col lg:gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink-900">Review the slate</h3>
          {add}
        </div>
        {progress}
        <nav className="flex flex-col gap-0.5">
          {slate.map(({ entry, pitch }) => {
            const current = entry.id === selectedEntryId;
            const done = scored.has(entry.id);
            return (
              <Link
                key={entry.id}
                href={hrefFor(entry.id)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded px-2.5 py-1.5 text-sm text-ink-700 hover:bg-panel-50",
                  current &&
                    "bg-brand-tint font-semibold text-ink-900 shadow-[inset_3px_0_0_0] shadow-brand-primary",
                )}
              >
                {canReview && (
                  <span
                    aria-label={done ? "Scored" : "Not scored"}
                    role="img"
                    className={cn(
                      "size-2.5 shrink-0 rounded-full border-2",
                      done ? "border-success-fg bg-success-border" : "border-line-strong",
                    )}
                  />
                )}
                <span className="min-w-0 truncate">{pitch.title}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* The strip: the same slate as previous / pick / next, below lg. */}
      <div className="sticky top-0 z-10 -mx-1 mb-4 flex flex-col gap-2 border-b border-line bg-white px-1 py-2.5 lg:hidden">
        <div className="flex items-center gap-2">
          <StepLink href={previous ? hrefFor(previous) : null} label="Previous pitch">
            ‹
          </StepLink>
          <SlatePicker
            slate={slate}
            scored={scored}
            selectedEntryId={selectedEntryId}
            hrefFor={hrefFor}
          />
          <StepLink href={next ? hrefFor(next) : null} label="Next pitch">
            ›
          </StepLink>
        </div>
        {progress}
        {add && <div className="flex justify-end">{add}</div>}
      </div>

      {selected && (
        <article
          key={selected.entry.id}
          className="rounded border border-line bg-white"
          aria-labelledby="scoring-pitch-title"
        >
          <PitchPane
            meetingId={meetingId}
            entry={selected.entry}
            pitch={selected.pitch}
            position={position}
            total={slate.length}
            scored={scored.has(selected.entry.id)}
            canReview={canReview}
            isEditor={isEditor}
            fields={fields}
            values={valuesByPitch.get(selected.pitch.id) ?? []}
          />
          {canReview && coreCriteria.length === 0 && (
            <Alert variant="info" className="mx-5 mb-5">
              The rubric has no active core criteria, so there is nothing to score against yet. An
              editor can add criteria in Settings → Rubric.
            </Alert>
          )}
          {canReview && coreCriteria.length > 0 && (
            <ReviewForm
              meetingId={meetingId}
              entryId={selected.entry.id}
              coreCriteria={coreCriteria}
              modifierCriteria={modifierCriteria}
              settings={settings}
              own={ownReviewByEntry.get(selected.entry.id)}
              nextUnscored={nextUnscored}
              leftAfterThis={leftAfterThis}
            />
          )}
          {!canReview && (
            <p className="border-t border-line px-5 py-4 text-xs leading-relaxed text-ink-400">
              Reviewers are scoring independently; scores are revealed when the editor closes
              scoring.
            </p>
          )}
        </article>
      )}
    </section>
  );
}

function StepLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const classes =
    "flex size-11 shrink-0 items-center justify-center rounded border text-xl leading-none";
  if (!href) {
    return (
      <span aria-disabled="true" className={cn(classes, "border-line text-ink-400")}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(classes, "border-line-strong text-brand-link hover:border-brand-primary")}
    >
      {children}
    </Link>
  );
}

/** The phone strip's pick: a native select over the slate, navigating on change. */
function SlatePicker({
  slate,
  scored,
  selectedEntryId,
  hrefFor,
}: {
  slate: { entry: MeetingPitchRow; pitch: PitchRow }[];
  scored: Set<string>;
  selectedEntryId: string | null;
  hrefFor: (entryId: string) => string;
}) {
  const router = useRouter();
  return (
    <Select
      aria-label="Pitch"
      value={selectedEntryId ?? ""}
      onChange={(event) => router.push(hrefFor(event.target.value))}
      className="min-w-0 flex-1"
    >
      {slate.map(({ entry, pitch }, index) => (
        <option key={entry.id} value={entry.id}>
          {index + 1} · {pitch.title}
          {scored.has(entry.id) ? " ✓" : ""}
        </option>
      ))}
    </Select>
  );
}

function PitchPane({
  meetingId,
  entry,
  pitch,
  position,
  total,
  scored,
  canReview,
  isEditor,
  fields,
  values,
}: {
  meetingId: string;
  entry: MeetingPitchRow;
  pitch: PitchRow;
  position: number;
  total: number;
  scored: boolean;
  canReview: boolean;
  isEditor: boolean;
  fields: FormFieldRow[];
  values: PitchValueRow[];
}) {
  const byKey: Record<string, EpFieldValue | undefined> = {};
  const keyById = new Map(fields.map((field) => [field.id, field.key]));
  for (const row of values) {
    const key = keyById.get(row.field_id);
    if (key) byKey[key] = row.value;
  }
  const meta = [
    fieldText(byKey, PRIMARY_PILLAR_FIELD_KEY),
    fieldText(byKey, FORMAT_FIELD_KEY),
    fieldText(byKey, URGENCY_FIELD_KEY),
  ].filter(Boolean);
  const moreFields = Math.max(0, fieldsWithValues(fields, values).length - 1);

  return (
    <div className="flex flex-col gap-2.5 border-b border-line px-5 py-5">
      <div className="flex flex-wrap items-center gap-2.5 text-ui text-ink-500">
        <span>
          Pitch {position} of {total}
        </span>
        {canReview && (
          <Badge variant={scored ? "success" : "neutral"}>{scored ? "Scored" : "Not scored"}</Badge>
        )}
        {isEditor && (
          <form action={removePitchFromSlate} className="ml-auto">
            <input type="hidden" name="meeting_id" value={meetingId} />
            <input type="hidden" name="entry_id" value={entry.id} />
            <Button type="submit" variant="danger-link">
              Remove from slate
            </Button>
          </form>
        )}
      </div>
      <h2 id="scoring-pitch-title" className="font-serif text-title font-bold text-ink-900">
        <Link
          href={`/editorial/pitches/${pitch.id}`}
          className="hover:text-brand-link hover:underline"
        >
          {pitch.title}
        </Link>
      </h2>
      {meta.length > 0 && <p className="text-ui text-ink-500">{meta.join(" · ")}</p>}
      <PitchValues fields={fields} values={values} slice="lead" />
      {moreFields > 0 && (
        <details className="mt-1">
          <summary className="w-fit cursor-pointer list-none text-xs font-bold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface [&::-webkit-details-marker]:hidden">
            Show the full pitch ({moreFields} more {moreFields === 1 ? "field" : "fields"})
          </summary>
          <div className="mt-3">
            <PitchValues fields={fields} values={values} slice="rest" />
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * The slate's one add affordance: a small toggle that reveals a picker over
 * open backlog pitches. A <details> rather than component state so opening
 * it needs nothing more than the "use client" boundary this file already has.
 */
function AddPitchControl({
  meetingId,
  candidates,
}: {
  meetingId: string;
  candidates: PitchListEntry[];
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menu = useDetailsMenu(detailsRef, panelRef);

  if (candidates.length === 0) {
    return <p className="text-xs text-ink-400">No open pitches left to add.</p>;
  }

  return (
    <details ref={detailsRef} onToggle={menu.onToggle} className="relative">
      <summary className="inline-flex min-h-11 w-fit cursor-pointer list-none items-center rounded border border-brand-link px-3 py-1.5 text-xs font-bold text-brand-link hover:bg-brand-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface lg:min-h-0 [&::-webkit-details-marker]:hidden">
        + Add pitch
      </summary>
      <FloatingPanel
        anchorRef={detailsRef}
        open={menu.open}
        ref={panelRef}
        offset={8}
        className="w-72 rounded border border-line bg-white p-3 shadow-md"
      >
        <form action={addPitchToSlate} onSubmit={menu.close} className="flex flex-col gap-2.5">
          <input type="hidden" name="meeting_id" value={meetingId} />
          <Select name="pitch_id" required aria-label="Pitch to add to the slate" defaultValue="">
            <option value="" disabled>
              Choose a pitch…
            </option>
            {candidates.map((candidate) => (
              <option key={candidate.pitch.id} value={candidate.pitch.id}>
                {candidate.pitch.title}
                {candidate.stale ? " · Stale" : ""}
                {candidate.deferralCount > 0 ? ` · Deferred ${candidate.deferralCount}×` : ""}
              </option>
            ))}
          </Select>
          <ControlRow className="justify-end">
            <Button type="submit" variant="secondary" size="sm">
              Add to slate
            </Button>
          </ControlRow>
        </form>
      </FloatingPanel>
    </details>
  );
}

function ReviewForm({
  meetingId,
  entryId,
  coreCriteria,
  modifierCriteria,
  settings,
  own,
  nextUnscored,
  leftAfterThis,
}: {
  meetingId: string;
  entryId: string;
  coreCriteria: CriterionRow[];
  modifierCriteria: CriterionRow[];
  settings: SettingsRow;
  own?: ReviewWithScores;
  nextUnscored: string | null;
  leftAfterThis: number;
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
    <form action={submitReview} className="px-5 pb-5">
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input type="hidden" name="entry_id" value={entryId} />

      <div className="flex flex-wrap items-baseline justify-between gap-2 py-3.5">
        <h3 className="text-body font-bold text-ink-900">Core criteria</h3>
        <span className="text-xs text-ink-400">
          Scale {settings.scale_min}–{settings.scale_max} · hover a score for what it means
        </span>
      </div>
      <div className="flex flex-col">
        {coreCriteria.map((criterion) => (
          <ScoreField
            key={criterion.id}
            criterion={criterion}
            settings={settings}
            defaultValue={ownScores.get(criterion.id)}
            required
          />
        ))}
      </div>

      {modifierCriteria.length > 0 && (
        // Collapsed by default: the modifier is optional and scored separately,
        // and an always-open box reads as one more criterion the reviewer owes a
        // number to.
        <details open={scoredModifier} className="border-t border-line py-3.5">
          <summary className="w-fit cursor-pointer list-none text-sm font-bold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface [&::-webkit-details-marker]:hidden">
            + Institutional modifier{" "}
            <span className="font-normal text-ink-400">
              · optional, scored outside the core average
            </span>
          </summary>
          <div className="mt-2 flex flex-col">
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

      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <h3 className="text-body font-bold text-ink-900">Your recommendation</h3>

        <Field label="Recommendation" htmlFor={`recommendation_${entryId}`} className="sm:max-w-sm">
          <Select
            id={`recommendation_${entryId}`}
            name="recommendation"
            required
            value={recommendation}
            onChange={(event) => setRecommendation(event.target.value as EpRecommendation)}
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
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-ui font-semibold text-ink-700">
            Concerns{" "}
            <span className="font-normal text-ink-500">· optional, pick any that apply</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
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
                <span className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-ui text-ink-700 transition-colors hover:border-brand-primary peer-checked:border-warning-border peer-checked:bg-warning-bg peer-checked:font-semibold peer-checked:text-warning-fg peer-focus-visible:ring-2 peer-focus-visible:ring-brand-surface">
                  {CONCERN_FLAG_LABEL[flag]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field
          label={
            <>
              Comment{" "}
              <span className="font-normal text-ink-500">
                · optional, visible to the room after scoring closes
              </span>
            </>
          }
          htmlFor={`comment_${entryId}`}
          hint={
            concernFlags.size > 0
              ? "A concern is flagged, so a sentence on why helps the room."
              : undefined
          }
        >
          <Textarea
            id={`comment_${entryId}`}
            name="comment"
            rows={3}
            defaultValue={own?.review.comment ?? ""}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4 max-lg:sticky max-lg:bottom-0 max-lg:-mx-5 max-lg:-mb-5 max-lg:bg-white max-lg:px-5 max-lg:py-3">
          <span className="text-xs text-ink-500 max-sm:w-full">
            {leftAfterThis === 0
              ? own
                ? "Every other pitch is scored."
                : "This is the last unscored pitch."
              : `${leftAfterThis} ${leftAfterThis === 1 ? "pitch" : "pitches"} left after this one`}
          </span>
          <ControlRow className="ml-auto">
            <Button type="submit" variant={nextUnscored ? "secondary" : "primary"}>
              {own ? "Update review" : "Save review"}
            </Button>
            {nextUnscored && (
              <Button type="submit" name="next" value="1">
                Save and go to next unscored
              </Button>
            )}
          </ControlRow>
        </div>
      </div>
    </form>
  );
}

/**
 * One criterion: name and guidance on the left, the scale on the right. Each
 * score button carries its anchor as a tooltip for a pointer; on a touch
 * screen, where there is no hover, the chosen score's anchor shows under the
 * scale instead (`.touch-only`, globals.css).
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
  const [value, setValue] = useState<number | null>(defaultValue ?? null);
  const anchor = value === null ? null : anchors[String(value)];

  return (
    <fieldset className="grid gap-x-5 gap-y-2 border-t border-line py-3.5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <legend className="sr-only">
        {criterion.name} — {scaleMin} lowest, {scaleMax} highest
      </legend>
      <div aria-hidden="true">
        <span className="text-ui font-semibold text-ink-900">
          {criterion.name}
          {criterion.criterion_type === "core" && criterion.weight !== 1 && (
            <span className="ml-1 font-normal text-ink-400">×{criterion.weight}</span>
          )}
        </span>
        {criterion.guidance && (
          <p className="mt-0.5 text-xs leading-snug text-ink-500">{criterion.guidance}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {!required && (
            <label className="cursor-pointer" title="Leave unscored">
              <input
                type="radio"
                name={`score_${criterion.id}`}
                value=""
                defaultChecked={defaultValue === undefined}
                onChange={() => setValue(null)}
                className="peer sr-only"
              />
              <span className="flex h-11 items-center justify-center rounded border border-dashed border-line px-3 text-ui font-semibold text-ink-500 transition-colors hover:border-brand-primary peer-checked:border-brand-primary peer-checked:bg-brand-surface peer-checked:text-brand-link peer-focus-visible:ring-2 peer-focus-visible:ring-brand-surface">
                N/A
              </span>
            </label>
          )}
          {scaleValues.map((scaleValue) => (
            <label
              key={scaleValue}
              className="cursor-pointer"
              title={anchors[String(scaleValue)] ?? `${criterion.name}: ${scaleValue}`}
            >
              <input
                type="radio"
                name={`score_${criterion.id}`}
                value={scaleValue}
                required={required}
                defaultChecked={defaultValue === scaleValue}
                onChange={() => setValue(scaleValue)}
                className="peer sr-only"
              />
              <span className="flex size-11 items-center justify-center rounded border border-line-strong text-body font-semibold text-ink-700 transition-colors hover:border-brand-primary peer-checked:border-brand-primary peer-checked:bg-brand-surface peer-checked:text-brand-link peer-focus-visible:ring-2 peer-focus-visible:ring-brand-surface">
                {scaleValue}
              </span>
            </label>
          ))}
        </div>
        {anchor && (
          <p className="touch-only rounded bg-panel-50 px-3 py-2 text-ui text-ink-700">
            <span className="font-bold">{value}</span> — {anchor}
          </p>
        )}
      </div>
    </fieldset>
  );
}
