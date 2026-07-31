import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { internalParticipantLabel } from "@/lib/audience-listening/participation";
import {
  REVIEW_STATE_BADGE,
  summarizeSubmissionTranscription,
} from "@/lib/audience-listening/review";
import type { AlAnswer, AlQuery, AlSubmission } from "@/lib/audience-listening/queries";
import { sendQueuedAnswersAction } from "../actions";

function formatSubmittedAt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SubmissionsTab({
  query,
  submissions,
  answers,
  linkedProjects,
}: {
  query: AlQuery;
  submissions: AlSubmission[];
  answers: AlAnswer[];
  linkedProjects: Map<string, { id: string; title: string; status: string }>;
}) {
  const answersBySubmission = new Map<string, AlAnswer[]>();
  for (const answer of answers) {
    const existing = answersBySubmission.get(answer.submission_id);
    if (existing) existing.push(answer);
    else answersBySubmission.set(answer.submission_id, [answer]);
  }

  const queuedCount = answers.filter(
    (answer) => answer.status === "uploaded" && answer.transcription_state === "queued",
  ).length;

  return (
    <div className="flex flex-col gap-5">
      {queuedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-panel-50 px-4 py-3">
          <p className="text-sm leading-relaxed text-ink-700">
            <span className="font-semibold">
              {queuedCount} answer{queuedCount === 1 ? "" : "s"} queued for transcription.
            </span>{" "}
            This query is set to transcribe automatically — sending needs one press, because there
            is no background job runner in this portal.
          </p>
          <form action={sendQueuedAnswersAction}>
            <input type="hidden" name="query_id" value={query.id} />
            <Button type="submit">Send queued answers</Button>
          </form>
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm leading-relaxed text-ink-500">
          {query.status === "draft"
            ? "Nothing yet — this query hasn't been opened."
            : "No submissions yet. Responses appear here as they arrive."}
        </div>
      ) : (
        <TableFrame>
          <Table className="min-w-[760px]">
            <thead>
              <HeaderRow>
                <Th>Participant</Th>
                <Th>Submitted</Th>
                <Th className="text-right">Answers</Th>
                <Th>Review</Th>
                <Th>Transcription</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {submissions.map((submission) => {
                const own = answersBySubmission.get(submission.id) ?? [];
                const uploaded = own.filter((answer) => answer.status === "uploaded");
                const review = REVIEW_STATE_BADGE[submission.review_state];
                const transcription = summarizeSubmissionTranscription(own);

                return (
                  <Row key={submission.id}>
                    <Cell>
                      <Link
                        href={`/audience-listening/${query.id}/submissions/${submission.id}`}
                        className="font-semibold text-brand-link"
                      >
                        {internalParticipantLabel(submission)}
                      </Link>
                      {submission.participant_city && (
                        <p className="mt-0.5 text-xs text-ink-400">{submission.participant_city}</p>
                      )}
                    </Cell>
                    <Cell className="whitespace-nowrap text-ink-500">
                      {formatSubmittedAt(submission.submitted_at)}
                    </Cell>
                    <Cell className="text-right text-ink-500">{uploaded.length}</Cell>
                    <Cell>
                      <Badge variant={review.variant}>{review.label}</Badge>
                    </Cell>
                    <Cell>
                      <Badge variant={transcription.variant}>{transcription.label}</Badge>
                    </Cell>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}

      {linkedProjects.size > 0 && (
        <Alert variant="note">
          {linkedProjects.size} answer{linkedProjects.size === 1 ? " has" : "s have"} a
          Sourcework project. Transcript editing, speaker naming, and excerpting all
          happen there — this screen only tracks the handoff.
        </Alert>
      )}
    </div>
  );
}
