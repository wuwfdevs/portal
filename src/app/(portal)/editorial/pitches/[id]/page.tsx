import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireEditorialAccess } from "@/lib/editorial/access";
import { getPitchValues, getProfileNames, listFormFields } from "@/lib/editorial/data";
import { aggregateReviews } from "@/lib/editorial/scoring";
import { formatDate, formatScore } from "@/lib/editorial/format";
import { PitchValues } from "@/components/editorial/pitch-values";
import {
  PitchStatusBadge,
  OutcomeBadge,
  MeetingStatusBadge,
} from "@/components/editorial/outcome-badge";
import { Button } from "@/components/ui/button";
import { archivePitch, unarchivePitch } from "../actions";

export default async function PitchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile, role } = await requireEditorialAccess();
  const { id } = await params;
  const supabase = await createClient();

  const { data: pitch } = await supabase.from("ep_pitches").select("*").eq("id", id).maybeSingle();
  if (!pitch) notFound();

  const [fields, valuesByPitch, { data: rounds }] = await Promise.all([
    listFormFields(),
    getPitchValues([pitch.id]),
    supabase.from("ep_meeting_pitches").select("*").eq("pitch_id", pitch.id),
  ]);

  const roundRows = rounds ?? [];
  const meetingIds = roundRows.map((round) => round.meeting_id);
  const { data: meetings } =
    meetingIds.length > 0
      ? await supabase.from("ep_meetings").select("*").in("id", meetingIds)
      : { data: [] };
  const meetingById = new Map((meetings ?? []).map((meeting) => [meeting.id, meeting]));

  // Reviews for this pitch's rounds — RLS returns only what the caller may see
  // (their own, plus everyone's once a meeting reaches the agenda).
  const roundIds = roundRows.map((round) => round.id);
  const { data: reviews } =
    roundIds.length > 0
      ? await supabase.from("ep_reviews").select("*").in("meeting_pitch_id", roundIds)
      : { data: [] };
  const reviewRows = reviews ?? [];
  const { data: scores } =
    reviewRows.length > 0
      ? await supabase
          .from("ep_review_scores")
          .select("*")
          .in(
            "review_id",
            reviewRows.map((review) => review.id),
          )
      : { data: [] };
  const scoresByReview = new Map<
    string,
    { criterionId: string; score: number; weight: number }[]
  >();
  for (const score of scores ?? []) {
    const list = scoresByReview.get(score.review_id) ?? [];
    list.push({
      criterionId: score.criterion_id,
      score: score.score,
      weight: score.weight_snapshot,
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

  const underReview = sortedRounds.some((item) => item.meeting!.status !== "concluded");
  const canEdit =
    role === "editor" ||
    (pitch.submitted_by === profile.id && pitch.status === "open" && !underReview);

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <Link href="/editorial" className="text-xs font-semibold text-brand-link">
          ← Back to backlog
        </Link>
      </div>

      <div className="rounded border border-line">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-serif text-[19px] font-bold text-ink-900">{pitch.title}</h2>
            <p className="mt-1 text-xs text-ink-400">
              Submitted by {names.get(pitch.submitted_by ?? "") ?? "a former member"} on{" "}
              {formatDate(pitch.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <PitchStatusBadge status={pitch.status} />
            {canEdit && (
              <Link
                href={`/editorial/pitches/${pitch.id}/edit`}
                className="text-xs font-semibold text-brand-link"
              >
                Edit
              </Link>
            )}
          </div>
        </div>
        <div className="p-5">
          <PitchValues fields={fields} values={valuesByPitch.get(pitch.id) ?? []} />
        </div>

        {pitch.status === "assigned" && (
          <div className="border-t border-line bg-panel-50 px-5 py-3 text-sm text-ink-700">
            Assigned to <strong>{names.get(pitch.assigned_to ?? "") ?? "—"}</strong>
          </div>
        )}
        {pitch.status === "archived" && (
          <div className="border-t border-line bg-panel-50 px-5 py-3 text-sm text-ink-700">
            Archived{pitch.archived_at ? ` ${formatDate(pitch.archived_at)}` : ""}
            {names.get(pitch.archived_by ?? "") ? ` by ${names.get(pitch.archived_by ?? "")}` : ""}
            {pitch.archived_reason ? ` — ${pitch.archived_reason}` : ""}
          </div>
        )}
        {underReview && pitch.status === "open" && (
          <div className="border-t border-line bg-brand-surface/40 px-5 py-3 text-sm text-ink-700">
            This pitch is on an active meeting&apos;s slate, so edits are locked until the round
            ends.
          </div>
        )}
      </div>

      {role === "editor" && pitch.status === "open" && (
        <form action={archivePitch} className="mt-4 flex items-center justify-end gap-2.5">
          <input type="hidden" name="pitch_id" value={pitch.id} />
          <input
            name="reason"
            placeholder="Reason (optional)"
            className="w-64 rounded border border-line px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400"
          />
          <Button type="submit" variant="secondary">
            Archive pitch
          </Button>
        </form>
      )}
      {role === "editor" && pitch.status === "archived" && (
        <form action={unarchivePitch} className="mt-4 flex justify-end">
          <input type="hidden" name="pitch_id" value={pitch.id} />
          <Button type="submit" variant="secondary">
            Restore to backlog
          </Button>
        </form>
      )}

      <h3 className="mb-2.5 mt-8 text-sm font-bold text-ink-900">Review history</h3>
      {sortedRounds.length === 0 ? (
        <p className="text-sm text-ink-400">
          This pitch hasn&apos;t been discussed in a meeting yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
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
            return (
              <div key={round.id} className="rounded border border-line px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/editorial/meetings/${meeting!.id}`}
                    className="text-sm font-semibold text-brand-link"
                  >
                    Meeting · {formatDate(meeting!.meeting_date)}
                  </Link>
                  <MeetingStatusBadge status={meeting!.status} />
                  <div className="flex-1" />
                  {meeting!.status !== "open" && (
                    <span className="text-sm text-ink-500">
                      Score {formatScore(aggregate.average)}
                    </span>
                  )}
                  <OutcomeBadge outcome={round.outcome} />
                </div>
                {round.outcome === "assigned" && round.assigned_to && (
                  <p className="mt-1.5 text-xs text-ink-500">
                    Assigned to {names.get(round.assigned_to) ?? "—"}
                  </p>
                )}
                {round.rationale && (
                  <p className="mt-1.5 text-xs text-ink-500">{round.rationale}</p>
                )}
                {roundReviews.some((review) => review.comment) && (
                  <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
                    {roundReviews
                      .filter((review) => review.comment)
                      .map((review) => (
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
            );
          })}
        </div>
      )}
    </div>
  );
}
