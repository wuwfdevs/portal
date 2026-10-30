import { PrimaryLink, SecondaryLink } from "@/components/ui/primary-link";
import { ProgressBar } from "@/components/ui/progress-bar";
import { MeetingStatusBadge } from "@/components/editorial/outcome-badge";
import type { CurrentMeetingSummary } from "@/lib/editorial/data";
import type { EditorialRole } from "@/lib/editorial/roles";
import { formatDate } from "@/lib/editorial/format";
import { pluralize } from "@/lib/format";

/**
 * The backlog's "This week" band: the meeting in progress, where the reader
 * stands in it, and the one action that matters today. It replaces the static
 * role blurb the tool header used to carry — the home page never said whether
 * a meeting was open, so a reviewer with four pitches to score landed on the
 * backlog with no pointer to them. Renders nothing between meetings.
 */
export function ThisWeekBand({
  summary,
  role,
}: {
  summary: CurrentMeetingSummary | null;
  role: EditorialRole;
}) {
  if (!summary) return null;
  const { meeting, slateCount, scoredByMe, decidedCount } = summary;
  const href = `/editorial/meetings/${meeting.id}`;
  const canScore = role !== "contributor";
  const isEditor = role === "editor";

  let line: string;
  let progress: { done: number; total: number; label: string } | null = null;
  let action: { label: string; href: string; primary: boolean };

  if (meeting.status === "open") {
    if (slateCount === 0) {
      line = isEditor
        ? "The slate is empty. Add pitches from the backlog to open scoring."
        : "The slate is still being built.";
      action = {
        label: isEditor ? "Build the slate" : "Open the meeting",
        href,
        primary: isEditor,
      };
    } else if (canScore) {
      const allScored = scoredByMe >= slateCount;
      line = allScored
        ? `You have scored all ${pluralize(slateCount, "pitch", "pitches")} on the slate. Scoring closes when the editor builds the agenda.`
        : `You have scored ${scoredByMe} of ${pluralize(slateCount, "pitch", "pitches")} on the slate.`;
      progress = { done: scoredByMe, total: slateCount, label: "Pitches you have scored" };
      action = allScored
        ? isEditor
          ? { label: "Close scoring", href, primary: true }
          : { label: "Open the meeting", href, primary: false }
        : { label: scoredByMe > 0 ? "Continue scoring" : "Start scoring", href, primary: true };
    } else {
      line = `${pluralize(slateCount, "pitch", "pitches")} are being scored. Scores are revealed when the editor closes scoring.`;
      action = { label: "Follow the meeting", href, primary: false };
    }
  } else {
    const left = slateCount - decidedCount;
    line =
      left === 0
        ? `Scoring is closed and every pitch has a decision. ${isEditor ? "Conclude the meeting to make it the record." : ""}`.trim()
        : `Scoring is closed and the agenda is ranked. ${decidedCount} of ${slateCount} decided, ${left} to go.`;
    progress =
      slateCount > 0 ? { done: decidedCount, total: slateCount, label: "Pitches decided" } : null;
    action = isEditor
      ? { label: left === 0 ? "Conclude the meeting" : "Run the agenda", href, primary: true }
      : { label: "See the agenda", href, primary: false };
  }

  return (
    <section
      aria-label="This week"
      className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded border border-brand-surface bg-brand-tint px-5 py-4"
    >
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-label font-bold uppercase tracking-wide text-ink-500">
            This week
          </span>
          <span className="font-serif text-section font-bold text-ink-900">
            Planning meeting · {formatDate(meeting.meeting_date)}
          </span>
          <MeetingStatusBadge status={meeting.status} />
        </div>
        <p className="text-sm text-ink-700">{line}</p>
        {progress && (
          <ProgressBar
            label={progress.label}
            done={progress.done}
            total={progress.total}
            complete={progress.done >= progress.total}
            className="max-w-xs"
          />
        )}
      </div>
      {action.primary ? (
        <PrimaryLink href={action.href}>{action.label}</PrimaryLink>
      ) : (
        <SecondaryLink href={action.href}>{action.label}</SecondaryLink>
      )}
    </section>
  );
}
