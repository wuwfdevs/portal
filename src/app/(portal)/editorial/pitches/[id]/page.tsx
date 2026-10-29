import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireEditorialAccess } from "@/lib/editorial/access";
import {
  getCurrentMeeting,
  getPitchValues,
  getProfileNames,
  getSettings,
  listCriteria,
  listFormFields,
  unwrapRead,
} from "@/lib/editorial/data";
import type { EpFieldValue } from "@/lib/database.types";
import { aggregateReviews, computeAdjustedScore } from "@/lib/editorial/scoring";
import { formatDate, formatScore } from "@/lib/editorial/format";
import {
  fieldText,
  FORMAT_FIELD_KEY,
  SUMMARY_FIELD_KEY,
  URGENCY_FIELD_KEY,
} from "@/lib/editorial/backlog-filters";
import { PRIMARY_PILLAR_FIELD_KEY } from "@/lib/editorial/form";
import { PitchValues } from "@/components/editorial/pitch-values";
import { ScoreStats } from "@/components/editorial/score-stats";
import {
  PitchStatusBadge,
  OutcomeBadge,
  MeetingStatusBadge,
} from "@/components/editorial/outcome-badge";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { DetailSummary, type DetailSummaryItem } from "@/components/ui/detail-summary";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SecondaryLink, TextLink } from "@/components/ui/primary-link";
import { pluralize } from "@/lib/format";
import { addPitchToSlate } from "../../meetings/actions";
import { archivePitch, unarchivePitch } from "../actions";
import {
  ADD_TO_SLATE_FORM_ID,
  ARCHIVE_PITCH_FORM_ID,
  PitchActionsMenu,
  RESTORE_PITCH_FORM_ID,
} from "./pitch-actions-menu";

const OUTCOME_PAST: Record<string, string> = {
  assigned: "Assigned",
  deferred: "Deferred",
  archived: "Archived",
};

export default async function PitchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { profile, role } = await requireEditorialAccess();
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const pitch = unwrapRead(
    await supabase.from("ep_pitches").select("*").eq("id", id).maybeSingle(),
    "the pitch",
  );
  if (!pitch) notFound();

  const [fields, valuesByPitch, rounds, criteria, settings, currentMeeting] = await Promise.all([
    listFormFields(),
    getPitchValues([pitch.id]),
    supabase
      .from("ep_meeting_pitches")
      .select("*")
      .eq("pitch_id", pitch.id)
      .then((result) => unwrapRead(result, "the review history")),
    listCriteria(),
    getSettings(),
    role === "editor" ? getCurrentMeeting(profile.id) : Promise.resolve(null),
  ]);
  const criterionById = new Map(criteria.map((criterion) => [criterion.id, criterion]));

  const roundRows = rounds ?? [];
  const meetingIds = roundRows.map((round) => round.meeting_id);
  const meetings =
    meetingIds.length > 0
      ? unwrapRead(
          await supabase.from("ep_meetings").select("*").in("id", meetingIds),
          "the meetings",
        )
      : [];
  const meetingById = new Map((meetings ?? []).map((meeting) => [meeting.id, meeting]));

  // Reviews for this pitch's rounds — RLS returns only what the caller may see
  // (their own, plus everyone's once a meeting reaches the agenda).
  const roundIds = roundRows.map((round) => round.id);
  const reviewRows =
    roundIds.length > 0
      ? (unwrapRead(
          await supabase.from("ep_reviews").select("*").in("meeting_pitch_id", roundIds),
          "reviews",
        ) ?? [])
      : [];
  const scores =
    reviewRows.length > 0
      ? unwrapRead(
          await supabase
            .from("ep_review_scores")
            .select("*")
            .in(
              "review_id",
              reviewRows.map((review) => review.id),
            ),
          "review scores",
        )
      : [];
  const scoresByReview = new Map<
    string,
    { criterionId: string; score: number; weight: number; criterionType: "core" | "modifier" }[]
  >();
  for (const score of scores ?? []) {
    const list = scoresByReview.get(score.review_id) ?? [];
    list.push({
      criterionId: score.criterion_id,
      score: score.score,
      weight: score.weight_snapshot,
      criterionType: criterionById.get(score.criterion_id)?.criterion_type ?? "core",
    });
    scoresByReview.set(score.review_id, list);
  }

  const names = await getProfileNames([
    pitch.submitted_by,
    pitch.assigned_to,
    pitch.archived_by,
    ...reviewRows.map((review) => review.reviewer_id),
    ...roundRows.map((round) => round.assigned_to),
  ]);

  const sortedRounds = roundRows
    .map((round) => ({ round, meeting: meetingById.get(round.meeting_id) }))
    .filter((item) => item.meeting !== undefined)
    .sort((a, b) => (a.meeting!.meeting_date < b.meeting!.meeting_date ? 1 : -1));

  const activeRound = sortedRounds.find((item) => item.meeting!.status !== "concluded");
  const underReview = activeRound !== undefined;
  const canEdit =
    role === "editor" ||
    (pitch.submitted_by === profile.id && pitch.status === "open" && !underReview);

  // The pitch's answers by field key, for the meta line.
  const values: Record<string, EpFieldValue | undefined> = {};
  const keyByFieldId = new Map(fields.map((field) => [field.id, field.key]));
  const valueRows = valuesByPitch.get(pitch.id) ?? [];
  for (const row of valueRows) {
    const key = keyByFieldId.get(row.field_id);
    if (key) values[key] = row.value;
  }
  const meta = [
    fieldText(values, PRIMARY_PILLAR_FIELD_KEY),
    fieldText(values, FORMAT_FIELD_KEY),
    fieldText(values, URGENCY_FIELD_KEY),
  ].filter(Boolean);
  const submitter = names.get(pitch.submitted_by ?? "") ?? "a former member";
  // The first answered field, in form order, leads as plain copy when it is
  // the summary; any other first field keeps its label.
  const answered = new Set(valueRows.map((row) => row.field_id));
  const leadIsSummary = fields.find((field) => answered.has(field.id))?.key === SUMMARY_FIELD_KEY;

  // Editors can add an open pitch to the meeting now taking a slate.
  const openMeeting =
    role === "editor" &&
    pitch.status === "open" &&
    currentMeeting?.meeting.status === "open" &&
    !roundRows.some((round) => round.meeting_id === currentMeeting.meeting.id)
      ? currentMeeting.meeting
      : null;

  // Where it stands: the facts a reader asks about first, in one column.
  const concludedRounds = sortedRounds.filter((item) => item.meeting!.status === "concluded");
  const lastDecided = concludedRounds.find((item) => item.round.outcome !== null);
  const deferredCount = concludedRounds.filter((item) => item.round.outcome === "deferred").length;
  const standing: DetailSummaryItem[] = [
    { label: "Status", value: <PitchStatusBadge status={pitch.status} /> },
  ];
  if (pitch.status === "assigned") {
    standing.push({ label: "Assigned to", value: names.get(pitch.assigned_to ?? "") ?? "—" });
  }
  if (pitch.status === "archived") {
    standing.push({
      label: "Archived",
      value: [
        pitch.archived_at ? formatDate(pitch.archived_at) : null,
        names.get(pitch.archived_by ?? "") ? `by ${names.get(pitch.archived_by ?? "")}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    });
    if (pitch.archived_reason) standing.push({ label: "Reason", value: pitch.archived_reason });
  }
  if (activeRound) {
    standing.push({
      label: "On slate",
      value: (
        <TextLink href={`/editorial/meetings/${activeRound.meeting!.id}`} className="px-0">
          Meeting · {formatDate(activeRound.meeting!.meeting_date)}
        </TextLink>
      ),
    });
  }
  standing.push({
    label: "Reviewed",
    value:
      concludedRounds.length === 0
        ? "Not yet"
        : `${pluralize(concludedRounds.length, "meeting")}${
            deferredCount > 0
              ? ` · deferred ${deferredCount === 1 ? "once" : `${deferredCount} times`}`
              : ""
          }`,
  });
  if (lastDecided) {
    standing.push({
      label: "Last decision",
      value: `${OUTCOME_PAST[lastDecided.round.outcome!] ?? lastDecided.round.outcome} · ${formatDate(lastDecided.meeting!.meeting_date)}`,
    });
  }
  standing.push({
    label: "Edits",
    value:
      underReview && pitch.status === "open"
        ? "Locked while the pitch is on an active slate"
        : canEdit
          ? "Open"
          : "Editors only",
  });

  return (
    <div className="max-w-5xl">
      <PageHeader
        className="mb-5"
        back={{ href: "/editorial", label: "Backlog" }}
        title={pitch.title}
        badge={<PitchStatusBadge status={pitch.status} />}
        description={
          <>
            {meta.length > 0 && <>{meta.join(" · ")} · </>}
            Submitted by {submitter} on {formatDate(pitch.created_at)}
          </>
        }
        actions={
          <>
            {canEdit && (
              <SecondaryLink href={`/editorial/pitches/${pitch.id}/edit`}>Edit</SecondaryLink>
            )}
            <PitchActionsMenu
              pitchTitle={pitch.title}
              openMeetingLabel={openMeeting ? formatDate(openMeeting.meeting_date) : null}
              canArchive={role === "editor" && pitch.status === "open"}
              canRestore={role === "editor" && pitch.status === "archived"}
            />
          </>
        }
      />

      {/* The ⋮ menu's actions, declared once and submitted by id. */}
      {openMeeting && (
        <form id={ADD_TO_SLATE_FORM_ID} action={addPitchToSlate} hidden>
          <input type="hidden" name="meeting_id" value={openMeeting.id} />
          <input type="hidden" name="pitch_id" value={pitch.id} />
        </form>
      )}
      {role === "editor" && pitch.status === "open" && (
        <form id={ARCHIVE_PITCH_FORM_ID} action={archivePitch} hidden>
          <input type="hidden" name="pitch_id" value={pitch.id} />
        </form>
      )}
      {role === "editor" && pitch.status === "archived" && (
        <form id={RESTORE_PITCH_FORM_ID} action={unarchivePitch} hidden>
          <input type="hidden" name="pitch_id" value={pitch.id} />
        </form>
      )}

      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <div className="flex flex-col gap-5 p-5">
              {leadIsSummary ? (
                <>
                  <PitchValues fields={fields} values={valueRows} slice="lead" />
                  <div className="border-t border-line pt-5">
                    <PitchValues fields={fields} values={valueRows} slice="rest" columns />
                  </div>
                </>
              ) : (
                <PitchValues fields={fields} values={valueRows} columns />
              )}
            </div>
          </Card>

          <section aria-labelledby="review-history">
            <h2 id="review-history" className="mb-2.5 text-sm font-bold text-ink-900">
              Review history
            </h2>
            {sortedRounds.length === 0 ? (
              <EmptyState compact>
                This pitch hasn&apos;t been discussed in a meeting yet.
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-2.5">
                {sortedRounds.map(({ round, meeting }) => {
                  const roundReviews = reviewRows.filter(
                    (review) => review.meeting_pitch_id === round.id,
                  );
                  const aggregate = aggregateReviews(
                    roundReviews.map((review) => ({
                      reviewerId: review.reviewer_id,
                      scores: scoresByReview.get(review.id) ?? [],
                    })),
                  );
                  const { adjustedScore, modifierApplied } = computeAdjustedScore({
                    coreAverage: aggregate.average,
                    modifierAverage: aggregate.modifierAverage,
                    minCoreScoreForModifier: settings.modifier_min_core_score,
                  });
                  const scored = meeting!.status !== "open";
                  const comments = roundReviews.filter((review) => review.comment);
                  const hasDetails =
                    scored ||
                    round.rationale !== null ||
                    (round.outcome === "assigned" && round.assigned_to !== null) ||
                    comments.length > 0;
                  return (
                    <Card key={round.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <TextLink
                          href={`/editorial/meetings/${meeting!.id}`}
                          className="px-0 font-semibold"
                        >
                          Meeting · {formatDate(meeting!.meeting_date)}
                        </TextLink>
                        <MeetingStatusBadge status={meeting!.status} />
                        <OutcomeBadge outcome={round.outcome} />
                        <div className="flex-1" />
                        {scored && (
                          <span
                            className="text-ui text-ink-500"
                            title="Adjusted score: core average plus the institutional modifier"
                          >
                            Adjusted{" "}
                            <span className="font-serif text-section font-bold text-brand-link">
                              {formatScore(adjustedScore)}
                            </span>{" "}
                            · {pluralize(aggregate.reviewerCount, "review")}
                          </span>
                        )}
                      </div>
                      {hasDetails && (
                        <details className="mt-2">
                          <summary className="w-fit cursor-pointer list-none text-xs font-bold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface [&::-webkit-details-marker]:hidden">
                            Scores, decision and comments
                          </summary>
                          <div className="mt-3 flex flex-col gap-3">
                            {scored && (
                              <ScoreStats
                                core={aggregate.average}
                                modifier={aggregate.modifierAverage}
                                adjusted={adjustedScore}
                                spread={aggregate.spread}
                                reviewerCount={aggregate.reviewerCount}
                                modifierApplied={modifierApplied}
                              />
                            )}
                            {round.outcome === "assigned" && round.assigned_to && (
                              <p className="text-xs text-ink-500">
                                Assigned to {names.get(round.assigned_to) ?? "—"}
                              </p>
                            )}
                            {round.rationale && (
                              <p className="text-ui leading-relaxed text-ink-500">
                                {round.rationale}
                              </p>
                            )}
                            {comments.length > 0 && (
                              <ul className="flex flex-col gap-1 border-t border-line pt-2">
                                {comments.map((review) => (
                                  <li key={review.id} className="text-xs text-ink-500">
                                    <span className="font-semibold">
                                      {names.get(review.reviewer_id) ?? "Reviewer"}:
                                    </span>{" "}
                                    {review.comment}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </details>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <DetailSummary title="Where it stands" items={standing} />
        </aside>
      </div>
    </div>
  );
}
