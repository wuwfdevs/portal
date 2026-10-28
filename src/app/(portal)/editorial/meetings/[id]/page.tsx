import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEditorialAccess } from "@/lib/editorial/access";
import {
  getMeetingBundle,
  getPitchValues,
  getProfileNames,
  listCriteria,
  listFormFields,
  listMembers,
  listPitchesWithActivity,
  getSettings,
} from "@/lib/editorial/data";
import { aggregateReviews, computeAdjustedScore, rankSlate } from "@/lib/editorial/scoring";
import { fieldText, FORMAT_FIELD_KEY } from "@/lib/editorial/backlog-filters";
import { PRIMARY_PILLAR_FIELD_KEY } from "@/lib/editorial/form";
import { formatDate } from "@/lib/editorial/format";
import { selectedEntryId, slateOrder } from "@/lib/editorial/slate-navigation";
import { pluralize } from "@/lib/format";
import { MeetingStatusBadge } from "@/components/editorial/outcome-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormActions } from "@/components/ui/form-actions";
import { Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PrimaryLink } from "@/components/ui/primary-link";
import { StatTile } from "@/components/ui/stat-tile";
import { closeScoring, concludeMeeting, updateMeetingNotes } from "../actions";
import { ScoringSection } from "./scoring-section";
import { AgendaSection, SPLIT_SPREAD, type AgendaItem } from "./agenda-section";
import type { EpFieldValue } from "@/lib/database.types";

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; pitch?: string; conclude?: string }>;
}) {
  const { profile, role } = await requireEditorialAccess();
  const { id } = await params;
  const { error, pitch: pitchParam, conclude } = await searchParams;

  const bundle = await getMeetingBundle(id);
  if (!bundle) notFound();
  const { meeting, reviewsByEntry } = bundle;
  const slate = slateOrder(bundle.slate);
  const isEditor = role === "editor";

  // Open pitches not yet on the slate — the scoring screen's own "+ Add
  // pitch" control, so there is one list of pitches for an editor to manage.
  const candidates =
    isEditor && meeting.status === "open"
      ? (await listPitchesWithActivity(["open"])).filter(
          (candidate) => !slate.some(({ pitch }) => pitch.id === candidate.pitch.id),
        )
      : [];

  const [allCriteria, activeCriteria, settings, fields, members] = await Promise.all([
    listCriteria(),
    listCriteria({ activeOnly: true }),
    getSettings(),
    listFormFields(),
    listMembers(),
  ]);
  const criterionById = new Map(allCriteria.map((criterion) => [criterion.id, criterion]));
  const valuesByPitch = await getPitchValues(slate.map(({ pitch }) => pitch.id));
  const keyByFieldId = new Map(fields.map((field) => [field.id, field.key]));

  const allReviews = Array.from(reviewsByEntry.values()).flat();
  const names = await getProfileNames([
    meeting.created_by,
    ...slate.flatMap(({ entry, pitch }) => [entry.assigned_to, pitch.submitted_by]),
    ...allReviews.map(({ review }) => review.reviewer_id),
  ]);

  const metaFor = (pitchId: string, submittedBy: string | null): string => {
    const values: Record<string, EpFieldValue | undefined> = {};
    for (const row of valuesByPitch.get(pitchId) ?? []) {
      const key = keyByFieldId.get(row.field_id);
      if (key) values[key] = row.value;
    }
    return [
      fieldText(values, PRIMARY_PILLAR_FIELD_KEY),
      fieldText(values, FORMAT_FIELD_KEY),
      submittedBy ? names.get(submittedBy) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  };

  const rankedItems: AgendaItem[] = rankSlate(
    slate.map(({ entry, pitch }) => {
      const reviews = reviewsByEntry.get(entry.id) ?? [];
      const aggregate = aggregateReviews(
        reviews.map(({ review, scores }) => ({
          reviewerId: review.reviewer_id,
          scores: scores.map((score) => ({
            criterionId: score.criterion_id,
            score: score.score,
            weight: score.weight_snapshot,
            criterionType: criterionById.get(score.criterion_id)?.criterion_type ?? "core",
          })),
        })),
      );
      const { adjustedScore, modifierApplied } = computeAdjustedScore({
        coreAverage: aggregate.average,
        modifierAverage: aggregate.modifierAverage,
        minCoreScoreForModifier: settings.modifier_min_core_score,
      });
      return {
        entry,
        pitch,
        reviews,
        aggregate,
        adjustedScore,
        modifierApplied,
        meta: metaFor(pitch.id, pitch.submitted_by),
      };
    }),
  );

  const distinctReviewers = new Set(allReviews.map(({ review }) => review.reviewer_id)).size;
  const undecided = slate.filter(({ entry }) => entry.outcome === null);
  const splitCount = rankedItems.filter(
    ({ aggregate }) => aggregate.spread !== null && aggregate.spread >= SPLIT_SPREAD,
  ).length;
  const meetingPath = `/editorial/meetings/${meeting.id}`;
  const concluding = conclude === "1" && isEditor && meeting.status === "agenda";

  const statusLine =
    meeting.status === "open"
      ? "Scoring is open. Reviewers score independently — nobody sees anyone else's scores until scoring closes."
      : meeting.status === "agenda"
        ? "Scoring is closed and the slate is ranked by adjusted score. The order organizes the conversation; the room decides."
        : "This meeting is concluded and is now a permanent record.";

  const notes = (
    <section aria-labelledby="meeting-notes">
      <h3 id="meeting-notes" className="mb-2.5 text-sm font-bold text-ink-900">
        Meeting notes
      </h3>
      {isEditor && meeting.status !== "concluded" ? (
        <form action={updateMeetingNotes} className="flex flex-col items-end gap-2.5">
          <input type="hidden" name="meeting_id" value={meeting.id} />
          <Textarea
            name="notes"
            aria-label="Meeting notes"
            rows={meeting.status === "agenda" ? 7 : 3}
            defaultValue={meeting.notes ?? ""}
            placeholder="Anything worth remembering about this meeting…"
          />
          <Button type="submit" variant="secondary">
            Save notes
          </Button>
        </form>
      ) : meeting.notes ? (
        <Card className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-ink-700">
          {meeting.notes}
        </Card>
      ) : (
        <p className="text-sm text-ink-400">No notes.</p>
      )}
    </section>
  );

  return (
    <div className="max-w-5xl">
      <PageHeader
        className="mb-4"
        back={{ href: "/editorial/meetings", label: "Back to meetings" }}
        title={`Planning meeting · ${formatDate(meeting.meeting_date)}`}
        badge={<MeetingStatusBadge status={meeting.status} />}
        actions={
          <>
            {isEditor && meeting.status === "open" && slate.length > 0 && (
              <form action={closeScoring}>
                <input type="hidden" name="meeting_id" value={meeting.id} />
                <Button type="submit">Close scoring &amp; build agenda</Button>
              </form>
            )}
            {isEditor && meeting.status === "agenda" && !concluding && (
              <PrimaryLink href={`${meetingPath}?conclude=1`}>Conclude meeting</PrimaryLink>
            )}
          </>
        }
      />

      {error && <Alert className="mb-4">{error}</Alert>}

      {concluding && (
        <section
          aria-label="Confirm conclude"
          className="mb-5 flex flex-wrap items-start gap-4 rounded border border-brand-primary bg-brand-tint px-5 py-4"
        >
          <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1.5">
            <p className="text-sm font-bold text-ink-900">
              Conclude this meeting?
              {undecided.length > 0 &&
                ` ${pluralize(undecided.length, "pitch has", "pitches have")} no decision and will be recorded as deferred.`}
            </p>
            {undecided.length > 0 && (
              <p className="text-ui text-ink-700">
                {undecided.map(({ pitch }) => pitch.title).join(" · ")}
              </p>
            )}
            <p className="text-xs text-ink-500">
              Deferred pitches stay in the backlog. The meeting becomes a permanent record.
            </p>
          </div>
          <form action={concludeMeeting}>
            <input type="hidden" name="meeting_id" value={meeting.id} />
            <FormActions cancelHref={meetingPath}>
              <Button type="submit">
                {undecided.length > 0
                  ? `Conclude and defer ${undecided.length}`
                  : "Conclude meeting"}
              </Button>
            </FormActions>
          </form>
        </section>
      )}

      <p className="mb-5 text-xs leading-relaxed text-ink-400">
        {statusLine}
        {meeting.status !== "open" && (
          <>
            {" "}
            {meeting.agenda_at ? `Scoring closed ${formatDate(meeting.agenda_at)}` : ""}
            {meeting.concluded_at ? ` · concluded ${formatDate(meeting.concluded_at)}` : ""}.
          </>
        )}
      </p>

      {meeting.status === "open" ? (
        <>
          <ScoringSection
            meetingId={meeting.id}
            slate={slate}
            selectedEntryId={selectedEntryId(
              slate.map(({ entry }) => entry.id),
              new Set(
                slate
                  .filter(({ entry }) =>
                    (reviewsByEntry.get(entry.id) ?? []).some(
                      ({ review }) => review.reviewer_id === profile.id,
                    ),
                  )
                  .map(({ entry }) => entry.id),
              ),
              pitchParam,
            )}
            fields={fields}
            valuesByPitch={valuesByPitch}
            criteria={activeCriteria}
            settings={settings}
            ownReviewByEntry={
              new Map(
                slate
                  .map(({ entry }) => {
                    const own = (reviewsByEntry.get(entry.id) ?? []).find(
                      ({ review }) => review.reviewer_id === profile.id,
                    );
                    return own ? ([entry.id, own] as const) : null;
                  })
                  .filter((item): item is [string, (typeof allReviews)[number]] => item !== null),
              )
            }
            canReview={role !== "contributor"}
            isEditor={isEditor}
            candidates={candidates}
          />
          <div className="mt-8 max-w-3xl">{notes}</div>
        </>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="On the slate" value={slate.length} />
            <StatTile label="Reviewers" value={distinctReviewers} />
            <StatTile
              label="Decided"
              value={
                <>
                  {slate.length - undecided.length}
                  <span className="ml-1 font-sans text-sm font-normal text-ink-500">
                    of {slate.length}
                  </span>
                </>
              }
            />
            <StatTile
              label="Split"
              value={splitCount}
              tone={splitCount > 0 ? "warning" : "neutral"}
              hint={`Core scores ${SPLIT_SPREAD} or more apart`}
            />
          </div>
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-6">
            <AgendaSection
              meetingId={meeting.id}
              items={rankedItems}
              criteria={allCriteria}
              names={names}
              members={members}
              canDecide={isEditor && meeting.status === "agenda"}
              modifierMinCoreScore={settings.modifier_min_core_score}
            />
            <aside className="mt-8 flex flex-col gap-6 lg:mt-0">
              {notes}
              <section className="rounded border border-line bg-white px-4 py-3.5 text-ui text-ink-700">
                <h3 className="mb-2 text-sm font-bold text-ink-900">Reading the scores</h3>
                <p>
                  <strong>Adjusted</strong> orders the agenda: the core average plus the
                  institutional modifier, added only once the core reaches{" "}
                  {settings.modifier_min_core_score}.
                </p>
                <p className="mt-2">
                  <strong>Spread</strong> is the gap between the highest and lowest core score. At{" "}
                  {SPLIT_SPREAD} or more the pitch is marked Split.
                </p>
                {isEditor && meeting.status === "agenda" && undecided.length > 0 && (
                  <p className="mt-2">
                    <Link href="#current" className="font-bold text-brand-link hover:underline">
                      Next undecided pitch
                    </Link>
                  </p>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
