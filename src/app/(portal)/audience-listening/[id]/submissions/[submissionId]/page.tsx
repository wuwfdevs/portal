import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import {
  getLinkedProjects,
  getQueryById,
  getSubmissionById,
  listAnswersForSubmission,
  listQuestions,
} from "@/lib/audience-listening/queries";
import { getSignedAnswerUrl } from "@/lib/audience-listening/storage";
import { answerDownloadFilename } from "@/lib/audience-listening/media";
import { formatBytes, formatClockMs } from "@/lib/format";
import {
  ANSWER_OUTCOME_LABEL,
  deriveAnswerOutcome,
  internalParticipantLabel,
  summarizeConsent,
} from "@/lib/audience-listening/participation";
import {
  REVIEW_ACTION_LABEL,
  REVIEW_STATE_BADGE,
  TRANSCRIPTION_BADGE,
  reviewActionsFor,
  transcriptionActionFor,
} from "@/lib/audience-listening/review";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/description-list";
import { Field, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { TextLink } from "@/components/ui/primary-link";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  saveAnswerNote,
  saveSubmissionNotes,
  sendAnswerToTranscriptionAction,
  setAnswerReview,
  setSubmissionReview,
} from "../../../actions";

export default async function SubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; submissionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireToolAccess("audience-listening");
  const { id, submissionId } = await params;
  const { error } = await searchParams;

  const [query, submission] = await Promise.all([
    getQueryById(id),
    getSubmissionById(submissionId),
  ]);
  if (!query || !submission || submission.query_id !== query.id) notFound();

  const [questions, answers] = await Promise.all([
    listQuestions(query.id),
    listAnswersForSubmission(submission.id),
  ]);

  const answerByQuestionId = new Map(
    answers.filter((answer) => answer.question_id).map((answer) => [answer.question_id!, answer]),
  );

  const linkedProjects = await getLinkedProjects([
    ...new Set(answers.map((answer) => answer.transcription_project_id).filter(Boolean)),
  ] as string[]);

  const participantLabel = internalParticipantLabel(submission);
  const consent = summarizeConsent(submission);
  const reviewBadge = REVIEW_STATE_BADGE[submission.review_state];

  // Signed playback and download URLs are minted per request and expire; the
  // bucket is private and there is no public URL for participant audio.
  const mediaUrls = new Map<string, { play: string | null; download: string | null }>();
  for (const answer of answers) {
    if (answer.status !== "uploaded") continue;
    const filename = answerDownloadFilename({
      questionPosition: answer.question_position,
      participantLabel: submission.participant_name,
      contentType: answer.content_type,
    });
    mediaUrls.set(answer.id, {
      play: await getSignedAnswerUrl(answer.storage_path),
      download: await getSignedAnswerUrl(answer.storage_path, filename),
    });
  }

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        className="mb-6"
        back={{
          href: `/audience-listening/${query.id}?tab=submissions`,
          label: "Back to submissions",
        }}
        title={participantLabel}
        badge={<Badge variant={reviewBadge.variant}>{reviewBadge.label}</Badge>}
        description={
          <>
            {query.internal_title}
            {submission.submitted_at &&
              ` · Submitted ${new Date(submission.submitted_at).toLocaleString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}`}
          </>
        }
        actions={reviewActionsFor(submission.review_state).map((state) => (
          <form key={state} action={setSubmissionReview}>
            <input type="hidden" name="query_id" value={query.id} />
            <input type="hidden" name="submission_id" value={submission.id} />
            <input type="hidden" name="review_state" value={state} />
            <Button
              type="submit"
              variant={state === "reviewed" ? "primary" : "secondary"}
              className={state === "rejected" ? "border-danger text-danger" : undefined}
            >
              {REVIEW_ACTION_LABEL[state]}
            </Button>
          </form>
        ))}
      />

      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <SectionHeading className="mb-3">Participant</SectionHeading>
            <DescriptionList
              columns={2}
              className="sm:grid-cols-1"
              items={[
                { label: "Name", value: given(submission.participant_name) },
                { label: "City or community", value: given(submission.participant_city) },
                { label: "Email", value: given(submission.participant_email) },
                { label: "Phone", value: given(submission.participant_phone) },
              ]}
            />
            {submission.participant_note && (
              <div className="mt-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">
                  Their note
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                  {submission.participant_note}
                </p>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionHeading className="mb-1">Consent and attribution</SectionHeading>
            <p className="mb-3 text-xs leading-relaxed text-ink-400">
              Three separate answers. Read all three before using anything here.
            </p>
            <ul className="flex flex-col gap-2 text-sm leading-relaxed text-ink-700">
              <li>{consent.contact}</li>
              <li>{consent.attribution}</li>
              <li>{consent.anonymity}</li>
            </ul>
            {submission.consent_agreed_at && (
              <p className="mt-3 border-t border-line pt-3 text-xs text-ink-400">
                Accepted the terms on{" "}
                {new Date(submission.consent_agreed_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                .
              </p>
            )}
          </Card>

          <Card className="p-5">
            <form action={saveSubmissionNotes}>
              <input type="hidden" name="query_id" value={query.id} />
              <input type="hidden" name="submission_id" value={submission.id} />
              <Field label="Internal note" htmlFor="internal_notes">
                <Textarea
                  id="internal_notes"
                  name="internal_notes"
                  rows={4}
                  defaultValue={submission.internal_notes ?? ""}
                  placeholder="What's usable here, who followed up, what to check"
                />
              </Field>
              <div className="mt-3">
                <Button type="submit" variant="secondary">
                  Save note
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <SectionHeading>Answers</SectionHeading>
          {questions.map((question) => {
            const answer = answerByQuestionId.get(question.id);
            const outcome = deriveAnswerOutcome({
              answerStatus: answer?.status ?? null,
              questionCreatedAt: question.created_at,
              submittedAt: submission.submitted_at,
            });
            const urls = answer ? mediaUrls.get(answer.id) : undefined;
            const action = answer ? transcriptionActionFor(answer) : ("unavailable" as const);
            const project = answer?.transcription_project_id
              ? linkedProjects.get(answer.transcription_project_id)
              : undefined;
            const transcriptionBadge = answer
              ? TRANSCRIPTION_BADGE[answer.transcription_state]
              : null;

            return (
              <Card
                key={question.id}
                id={answer ? `answer-${answer.id}` : undefined}
                className="p-5"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">
                      Question {answer?.question_position ?? question.position}
                    </p>
                    {/* The wording as this participant was asked it, not as it reads now. */}
                    <p className="mt-1 text-sm font-semibold leading-relaxed text-ink-900">
                      {answer?.question_prompt ?? question.prompt}
                    </p>
                  </div>
                  <Badge
                    variant={
                      outcome === "answered"
                        ? "success"
                        : outcome === "incomplete"
                          ? "warning"
                          : "muted"
                    }
                  >
                    {ANSWER_OUTCOME_LABEL[outcome]}
                  </Badge>
                </div>

                {answer?.question_prompt && answer.question_prompt !== question.prompt && (
                  <Alert variant="note" className="mb-3">
                    The question has been reworded since this answer. Shown above is what this
                    participant was actually asked; it now reads: &ldquo;{question.prompt}&rdquo;
                  </Alert>
                )}

                {outcome === "answered" && answer && (
                  <>
                    {urls?.play ? (
                      <audio controls preload="none" src={urls.play} className="w-full">
                        <track kind="captions" />
                      </audio>
                    ) : (
                      <Alert>
                        The audio for this answer couldn&apos;t be reached. The file may have been
                        removed from storage.
                      </Alert>
                    )}
                    <p className="mt-2 text-xs text-ink-400">
                      {answer.duration_ms ? formatClockMs(answer.duration_ms) : "Length unknown"}
                      {answer.size_bytes ? ` · ${formatBytes(answer.size_bytes)}` : ""}
                      {urls?.download && (
                        <>
                          {" · "}
                          <a href={urls.download} className="font-semibold text-brand-link">
                            Download original
                          </a>
                        </>
                      )}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                      {transcriptionBadge && (
                        <Badge variant={transcriptionBadge.variant}>
                          {transcriptionBadge.label}
                        </Badge>
                      )}
                      {(action === "send" || action === "retry") && (
                        <form action={sendAnswerToTranscriptionAction}>
                          <input type="hidden" name="query_id" value={query.id} />
                          <input type="hidden" name="submission_id" value={submission.id} />
                          <input type="hidden" name="answer_id" value={answer.id} />
                          <Button type="submit" variant="secondary">
                            {action === "retry" ? "Retry transcription" : "Send to transcription"}
                          </Button>
                        </form>
                      )}
                      {action === "open" && answer.transcription_project_id && (
                        <TextLink
                          href={`/sourcework/${answer.transcription_project_id}`}
                          className="text-xs font-semibold"
                        >
                          Open in Sourcework
                          {project ? ` (${project.status})` : ""}
                        </TextLink>
                      )}
                      <span className="flex-1" />
                      {reviewActionsFor(answer.review_state)
                        .filter((state) => state !== "new")
                        .map((state) => (
                          <form key={state} action={setAnswerReview}>
                            <input type="hidden" name="query_id" value={query.id} />
                            <input type="hidden" name="submission_id" value={submission.id} />
                            <input type="hidden" name="answer_id" value={answer.id} />
                            <input type="hidden" name="review_state" value={state} />
                            <Button type="submit" variant="ghost">
                              {REVIEW_ACTION_LABEL[state]}
                            </Button>
                          </form>
                        ))}
                    </div>

                    {answer.transcription_error && (
                      <Alert className="mt-3">{answer.transcription_error}</Alert>
                    )}

                    <form action={saveAnswerNote} className="mt-4">
                      <input type="hidden" name="query_id" value={query.id} />
                      <input type="hidden" name="submission_id" value={submission.id} />
                      <input type="hidden" name="answer_id" value={answer.id} />
                      <Field label="Note on this answer" htmlFor={`note-${answer.id}`}>
                        <Textarea
                          id={`note-${answer.id}`}
                          name="internal_note"
                          rows={2}
                          defaultValue={answer.internal_note ?? ""}
                          placeholder="The usable line, a timestamp, a caution"
                        />
                      </Field>
                      <div className="mt-2">
                        <Button type="submit" variant="ghost">
                          Save note
                        </Button>
                      </div>
                    </form>
                  </>
                )}

                {outcome === "incomplete" && (
                  <Alert variant="note">
                    This answer was started but its upload never finished, so there may be no usable
                    audio. Nothing was lost from the rest of the submission.
                  </Alert>
                )}
                {outcome === "not_asked" && (
                  <p className="text-sm text-ink-400">
                    Added after this response arrived — this participant was never shown it.
                  </p>
                )}
                {outcome === "skipped" && (
                  <p className="text-sm text-ink-400">
                    {question.required
                      ? "No answer recorded."
                      : "Optional, and skipped by this participant."}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A participant detail left blank reads "Not given" rather than a dash. */
function given(value: string | null): string {
  return value?.trim() || "Not given";
}
