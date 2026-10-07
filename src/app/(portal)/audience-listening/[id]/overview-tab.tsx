import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatTile } from "@/components/ui/stat-tile";
import { describeDuration } from "@/lib/audience-listening/media";
import type { AlAnswer, AlQuery, AlQuestion, AlSubmission } from "@/lib/audience-listening/queries";

/**
 * The "where does this query stand" screen: four counts, the question sequence
 * as a participant will meet it, and the internal notes. Nothing here is
 * editable — every number links to the tab where it can be acted on.
 */
export function OverviewTab({
  query,
  questions,
  submissions,
  answers,
}: {
  query: AlQuery;
  questions: AlQuestion[];
  submissions: AlSubmission[];
  answers: AlAnswer[];
}) {
  const uploaded = answers.filter((answer) => answer.status === "uploaded");
  const unreviewed = submissions.filter((submission) => submission.review_state === "new").length;
  const transcribed = uploaded.filter((answer) => answer.transcription_state === "sent").length;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Submissions" value={String(submissions.length)} />
        <StatTile label="Answers" value={String(uploaded.length)} />
        <StatTile label="Unreviewed" value={unreviewed > 0 ? String(unreviewed) : "—"} />
        <StatTile
          label="Sent to transcription"
          value={uploaded.length > 0 ? `${transcribed} / ${uploaded.length}` : "—"}
        />
      </div>

      <section>
        <SectionHeading className="mb-3">Question sequence</SectionHeading>
        {questions.length === 0 ? (
          <EmptyState compact className="max-w-md">
            No questions yet. Add at least one before opening this query.
          </EmptyState>
        ) : (
          <ol className="flex flex-col gap-2">
            {questions.map((question) => (
              <li
                key={question.id}
                className="flex gap-3 rounded border border-line bg-white px-4 py-3"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel-100 text-xs font-bold text-ink-500">
                  {question.position}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{question.prompt}</p>
                  {question.guidance && (
                    <p className="mt-1 text-xs leading-relaxed text-ink-500">{question.guidance}</p>
                  )}
                  <p className="mt-1.5 text-xs text-ink-400">
                    Up to {describeDuration(question.max_duration_seconds)}
                  </p>
                </div>
                <Badge variant={question.required ? "accent" : "muted"}>
                  {question.required ? "Required" : "Optional"}
                </Badge>
              </li>
            ))}
          </ol>
        )}
      </section>

      {query.internal_notes && (
        <section>
          <SectionHeading className="mb-3">Internal notes</SectionHeading>
          <p className="max-w-2xl whitespace-pre-wrap rounded border border-line bg-panel-50 p-4 text-sm leading-relaxed text-ink-700">
            {query.internal_notes}
          </p>
        </section>
      )}
    </div>
  );
}
