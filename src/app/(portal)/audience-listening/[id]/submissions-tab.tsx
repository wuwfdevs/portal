import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TextLink } from "@/components/ui/primary-link";
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
        <Alert
          variant="note"
          action={
            <form action={sendQueuedAnswersAction}>
              <input type="hidden" name="query_id" value={query.id} />
              <Button type="submit">Send queued answers</Button>
            </form>
          }
        >
          <span className="font-semibold">
            {queuedCount} answer{queuedCount === 1 ? "" : "s"} queued for transcription.
          </span>{" "}
          This query is set to transcribe automatically — sending needs one press, because there is
          no background job runner in this portal.
        </Alert>
      )}

      {submissions.length === 0 ? (
        <EmptyState className="leading-relaxed">
          {query.status === "draft"
            ? "Nothing yet — this query hasn't been opened."
            : "No submissions yet. Responses appear here as they arrive."}
        </EmptyState>
      ) : (
        <TableFrame>
          <Table stack className="md:min-w-[760px]">
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
                    <Cell stack="title">
                      <TextLink
                        href={`/audience-listening/${query.id}/submissions/${submission.id}`}
                        className="px-0 font-semibold"
                      >
                        {internalParticipantLabel(submission)}
                      </TextLink>
                      {submission.participant_city && (
                        <p className="mt-0.5 text-xs text-ink-400">{submission.participant_city}</p>
                      )}
                    </Cell>
                    <Cell label="Submitted" className="whitespace-nowrap text-ink-500">
                      {formatSubmittedAt(submission.submitted_at)}
                    </Cell>
                    <Cell label="Answers" className="text-right text-ink-500">
                      {uploaded.length}
                    </Cell>
                    <Cell stack="aside">
                      <Badge variant={review.variant}>{review.label}</Badge>
                    </Cell>
                    <Cell label="Transcription">
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
          {linkedProjects.size} answer{linkedProjects.size === 1 ? " has" : "s have"} a Sourcework
          project. Transcript editing, speaker naming, and excerpting all happen there — this screen
          only tracks the handoff.
        </Alert>
      )}
    </div>
  );
}
