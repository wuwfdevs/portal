import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
        <Stat label="Submissions" value={String(submissions.length)} />
        <Stat label="Answers" value={String(uploaded.length)} />
        <Stat label="Unreviewed" value={unreviewed > 0 ? String(unreviewed) : "—"} />
        <Stat
          label="Sent to transcription"
          value={uploaded.length > 0 ? `${transcribed} / ${uploaded.length}` : "—"}
        />
      </div>

      <section>
        <h2 className="mb-3 font-serif text-[17px] font-bold text-ink-900">Question sequence</h2>
        {questions.length === 0 ? (
          <p className="max-w-md rounded border border-dashed border-line p-5 text-sm text-ink-500">
            No questions yet. Add at least one before opening this query.
          </p>
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
          <h2 className="mb-3 font-serif text-[17px] font-bold text-ink-900">Internal notes</h2>
          <p className="max-w-2xl whitespace-pre-wrap rounded border border-line bg-panel-50 p-4 text-sm leading-relaxed text-ink-700">
            {query.internal_notes}
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-1 font-serif text-[22px] font-bold text-ink-900">{value}</div>
    </Card>
  );
}
