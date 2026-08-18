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
  listRubricProfiles,
  getSettings,
} from "@/lib/editorial/data";
import { aggregateReviews, computeAdjustedScore, rankSlate } from "@/lib/editorial/scoring";
import { formatDate } from "@/lib/editorial/format";
import { MeetingStatusBadge } from "@/components/editorial/outcome-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { closeScoring, concludeMeeting, updateMeetingNotes } from "../actions";
import { ScoringSection } from "./scoring-section";
import { AgendaSection, type AgendaItem } from "./agenda-section";

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { profile, role } = await requireEditorialAccess();
  const { id } = await params;
  const { error } = await searchParams;

  const bundle = await getMeetingBundle(id);
  if (!bundle) notFound();
  const { meeting, slate, reviewsByEntry } = bundle;
  const isEditor = role === "editor";

  // Open pitches not yet on the slate — the scoring screen's own "+ Add
  // pitch" control, so there is one list of pitches for an editor to manage
  // rather than a second "build the slate" section duplicating this one.
  const candidates =
    isEditor && meeting.status === "open"
      ? (await listPitchesWithActivity(["open"])).filter(
          (candidate) => !slate.some(({ pitch }) => pitch.id === candidate.pitch.id),
        )
      : [];

  const [allCriteria, activeCriteria, settings, fields, members, profiles] = await Promise.all([
    listCriteria(),
    listCriteria({ activeOnly: true, profileId: meeting.rubric_profile_id }),
    getSettings(),
    listFormFields(),
    listMembers(),
    listRubricProfiles(),
  ]);
  const criterionById = new Map(allCriteria.map((criterion) => [criterion.id, criterion]));
  const rubricProfile = profiles.find((p) => p.id === meeting.rubric_profile_id);
  const valuesByPitch = await getPitchValues(slate.map(({ pitch }) => pitch.id));

  const allReviews = Array.from(reviewsByEntry.values()).flat();
  const names = await getProfileNames([
    meeting.created_by,
    ...slate.flatMap(({ entry, pitch }) => [entry.assigned_to, pitch.submitted_by]),
    ...allReviews.map(({ review }) => review.reviewer_id),
  ]);

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
      return { entry, pitch, reviews, aggregate, adjustedScore, modifierApplied };
    }),
  );

  const distinctReviewers = new Set(allReviews.map(({ review }) => review.reviewer_id)).size;
  const undecidedCount = slate.filter(({ entry }) => entry.outcome === null).length;

  const statusLine =
    meeting.status === "open"
      ? "Scoring is open. Reviewers score independently — nobody sees anyone else's scores until scoring closes."
      : meeting.status === "agenda"
        ? "Scoring is closed and the slate is ranked. Record a decision for each pitch, then conclude."
        : "This meeting is concluded and is now a permanent record.";

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <Link
          href="/editorial/meetings"
          className="text-xs font-semibold text-brand-link hover:underline"
        >
          ← Back to meetings
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-serif text-[19px] font-bold text-ink-900">
          {formatDate(meeting.meeting_date)}
        </h2>
        <MeetingStatusBadge status={meeting.status} />
        {rubricProfile && <Badge variant="neutral">{rubricProfile.name}</Badge>}
        <div className="flex-1" />
        {isEditor && meeting.status === "open" && slate.length > 0 && (
          <form action={closeScoring}>
            <input type="hidden" name="meeting_id" value={meeting.id} />
            <Button type="submit">Close scoring &amp; build agenda</Button>
          </form>
        )}
        {isEditor && meeting.status === "agenda" && (
          <form action={concludeMeeting}>
            <input type="hidden" name="meeting_id" value={meeting.id} />
            <Button type="submit">
              Conclude meeting{undecidedCount > 0 ? ` (defers ${undecidedCount} undecided)` : ""}
            </Button>
          </form>
        )}
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}

      <p className="mb-5 text-xs leading-relaxed text-ink-400">
        {statusLine}
        {meeting.status !== "open" && (
          <>
            {" "}
            {distinctReviewers} {distinctReviewers === 1 ? "reviewer" : "reviewers"} scored this
            slate
            {meeting.agenda_at ? ` · scoring closed ${formatDate(meeting.agenda_at)}` : ""}
            {meeting.concluded_at ? ` · concluded ${formatDate(meeting.concluded_at)}` : ""}.
          </>
        )}
      </p>

      {meeting.status === "open" ? (
        <ScoringSection
          meetingId={meeting.id}
          slate={slate}
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
      ) : (
        <AgendaSection
          meetingId={meeting.id}
          items={rankedItems}
          criteria={allCriteria}
          names={names}
          members={members}
          canDecide={isEditor && meeting.status === "agenda"}
        />
      )}

      <section className="mt-8">
        <h3 className="mb-2.5 text-sm font-bold text-ink-900">Meeting notes</h3>
        {isEditor && meeting.status !== "concluded" ? (
          <form action={updateMeetingNotes} className="flex flex-col items-end gap-2.5">
            <input type="hidden" name="meeting_id" value={meeting.id} />
            <Textarea
              name="notes"
              aria-label="Meeting notes"
              rows={3}
              defaultValue={meeting.notes ?? ""}
              placeholder="Anything worth remembering about this meeting…"
            />
            <Button type="submit" variant="secondary">
              Save notes
            </Button>
          </form>
        ) : meeting.notes ? (
          <p className="whitespace-pre-wrap rounded border border-line px-4 py-3 text-sm leading-relaxed text-ink-700">
            {meeting.notes}
          </p>
        ) : (
          <p className="text-sm text-ink-400">No notes.</p>
        )}
      </section>
    </div>
  );
}
