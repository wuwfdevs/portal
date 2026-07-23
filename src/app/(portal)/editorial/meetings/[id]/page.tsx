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
import { aggregateReviews, rankSlate } from "@/lib/editorial/scoring";
import { formatDate } from "@/lib/editorial/format";
import { MeetingStatusBadge } from "@/components/editorial/outcome-badge";
import { Button } from "@/components/ui/button";
import {
  addPitchToSlate,
  closeScoring,
  concludeMeeting,
  removePitchFromSlate,
  updateMeetingNotes,
} from "../actions";
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

  const [allCriteria, activeCriteria, settings, fields, members] = await Promise.all([
    listCriteria(),
    listCriteria({ activeOnly: true }),
    getSettings(),
    listFormFields(),
    listMembers(),
  ]);
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
      return {
        entry,
        pitch,
        reviews,
        aggregate: aggregateReviews(
          reviews.map(({ review, scores }) => ({
            reviewerId: review.reviewer_id,
            scores: scores.map((score) => ({
              criterionId: score.criterion_id,
              score: score.score,
              weight: score.weight_snapshot,
            })),
          })),
        ),
      };
    }),
  );

  const distinctReviewers = new Set(allReviews.map(({ review }) => review.reviewer_id)).size;
  const undecidedCount = slate.filter(({ entry }) => entry.outcome === null).length;

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <Link href="/editorial/meetings" className="text-xs font-semibold text-brand-link">
          ← Back to meetings
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-[19px] font-bold text-ink-900">
          Meeting · {formatDate(meeting.meeting_date)}
        </h2>
        <MeetingStatusBadge status={meeting.status} />
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

      {error && (
        <p className="mb-4 rounded border border-danger/30 bg-danger/[0.06] px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {meeting.status !== "open" && (
        <p className="mb-4 text-xs text-ink-400">
          {distinctReviewers} {distinctReviewers === 1 ? "reviewer" : "reviewers"} scored this slate
          {meeting.agenda_at ? ` · scoring closed ${formatDate(meeting.agenda_at)}` : ""}
          {meeting.concluded_at ? ` · concluded ${formatDate(meeting.concluded_at)}` : ""}
        </p>
      )}

      {meeting.status === "open" ? (
        <>
          {slate.length === 0 ? (
            <p className="mb-4 text-sm text-ink-500">
              No pitches on the slate yet.
              {isEditor ? " Add some from the backlog below." : " An editor is still building it."}
            </p>
          ) : (
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
            />
          )}
          {isEditor && <SlateBuilder meetingId={meeting.id} slate={slate} />}
        </>
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
        <h3 className="mb-2 text-sm font-bold text-ink-900">Meeting notes</h3>
        {isEditor && meeting.status !== "concluded" ? (
          <form action={updateMeetingNotes} className="flex flex-col items-end gap-2">
            <input type="hidden" name="meeting_id" value={meeting.id} />
            <textarea
              name="notes"
              rows={3}
              defaultValue={meeting.notes ?? ""}
              placeholder="Anything worth remembering about this meeting…"
              className="w-full rounded border border-line px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400"
            />
            <Button type="submit" variant="secondary">
              Save notes
            </Button>
          </form>
        ) : meeting.notes ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
            {meeting.notes}
          </p>
        ) : (
          <p className="text-sm text-ink-400">No notes.</p>
        )}
      </section>
    </div>
  );
}

/** Editor-only: pick open pitches onto the slate while the meeting is open. */
async function SlateBuilder({
  meetingId,
  slate,
}: {
  meetingId: string;
  slate: { entry: { id: string }; pitch: { id: string; title: string } }[];
}) {
  const onSlate = new Set(slate.map(({ pitch }) => pitch.id));
  const candidates = (await listPitchesWithActivity(["open"])).filter(
    (candidate) => !onSlate.has(candidate.pitch.id),
  );

  return (
    <section className="mt-8">
      <h3 className="mb-2.5 text-sm font-bold text-ink-900">Build the slate</h3>
      {slate.length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5">
          {slate.map(({ entry, pitch }) => (
            <form
              key={entry.id}
              action={removePitchFromSlate}
              className="flex items-center gap-3 text-sm"
            >
              <input type="hidden" name="meeting_id" value={meetingId} />
              <input type="hidden" name="entry_id" value={entry.id} />
              <span className="text-ink-700">{pitch.title}</span>
              <button type="submit" className="text-xs font-semibold text-danger hover:underline">
                Remove
              </button>
            </form>
          ))}
        </div>
      )}
      {candidates.length === 0 ? (
        <p className="text-sm text-ink-400">Every open pitch is already on the slate.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line bg-panel-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2.5">Open pitch</th>
                <th className="px-4 py-2.5">Submitted by</th>
                <th className="px-4 py-2.5">Deferred</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr key={candidate.pitch.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/editorial/pitches/${candidate.pitch.id}`}
                      className="font-semibold text-ink-900 hover:text-brand-link"
                    >
                      {candidate.pitch.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-ink-500">{candidate.submitterName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-500">
                    {candidate.deferralCount > 0 ? `${candidate.deferralCount}×` : "—"}
                    {candidate.stale && <span title="Stale"> ⚠</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <form action={addPitchToSlate}>
                      <input type="hidden" name="meeting_id" value={meetingId} />
                      <input type="hidden" name="pitch_id" value={candidate.pitch.id} />
                      <button type="submit" className="text-xs font-semibold text-brand-link">
                        + Add
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
