"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import {
  AUDIENCE_LISTENING_MEDIA_BUCKET,
  MAX_ANSWER_BYTES,
  RECORDING_MIME_CANDIDATES,
  describeDuration,
  formatClock,
  normalizeContentType,
} from "@/lib/audience-listening/media";
import {
  deriveSubmitReadiness,
  missingRequiredFields,
  participantFields,
  submitBlockedReason,
  type ParticipantFieldKey,
  type ParticipantValues,
  type QuestionProgress,
} from "@/lib/audience-listening/participation";
import {
  deriveMicrophoneGuidance,
  readMicrophonePolicy,
  shouldSkipStraightToNewTab,
  type MicrophoneGuidance,
} from "@/lib/audience-listening/microphone";
import type { PublicQueryPayload } from "@/lib/database.types";
import { ListenShell } from "./listen-shell";
import {
  beginParticipation,
  confirmAnswerUpload,
  loadProgress,
  reserveAnswerSlot,
  saveDetails,
  submitResponse,
} from "./actions";

/**
 * The whole public participation flow, standalone and embedded alike.
 *
 * Three decisions run through all of it:
 *
 *   1. **An answer is uploaded the moment the participant moves past it**, not
 *      held to the end. That is what makes "Saved" true when the screen says
 *      it, and it is why one failed upload can never cost someone the answers
 *      they already gave.
 *
 *   2. **Local state mirrors what the server actually holds.** `savedDurationMs`
 *      is non-null only when an answer is confirmed uploaded, and it is cleared
 *      the instant a replacement upload starts — because al_reserve_answer()
 *      resets that row to `pending` at the same moment. A screen that kept
 *      saying "Saved" through a failed replacement would be lying about the one
 *      thing that matters most here.
 *
 *   3. **State is text, never colour or motion alone.** "Recording" is the word
 *      Recording; a saved answer says Saved. The timer is deliberately outside
 *      the live region — a value announced every second makes a screen reader
 *      unusable — and a separate polite region announces only transitions.
 */

type Screen = "intro" | "mic" | "question" | "review" | "info" | "consent" | "submitting" | "done";

type MicState = "idle" | "requesting" | "granted" | "denied" | "no_device";

/** What is happening with the take in front of the participant right now. */
type TakeState = "idle" | "recorded" | "uploading" | "failed";

interface AnswerState {
  take: TakeState;
  /** Non-null only while WUWF genuinely holds a confirmed upload for this question. */
  savedDurationMs: number | null;
  /** Length of the take in hand, if there is one. */
  takeDurationMs: number | null;
  blob: Blob | null;
  previewUrl: string | null;
  error: string | null;
  skipped: boolean;
  /** The participant asked to record over an answer that is already saved. */
  retake: boolean;
}

const EMPTY_ANSWER: AnswerState = {
  take: "idle",
  savedDurationMs: null,
  takeDurationMs: null,
  blob: null,
  previewUrl: null,
  error: null,
  skipped: false,
  retake: false,
};

/** Survives an accidental reload within the same tab, so progress can be restored. */
function submissionStorageKey(publicId: string): string {
  return `wuwf-listen-submission:${publicId}`;
}

export function Participate({
  query,
  embedded,
  standaloneUrl,
  previewMode = false,
}: {
  query: PublicQueryPayload;
  embedded: boolean;
  standaloneUrl: string;
  previewMode?: boolean;
}) {
  const questions = query.questions;

  const [screen, setScreen] = useState<Screen>("intro");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [micState, setMicState] = useState<MicState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [values, setValues] = useState<ParticipantValues>({});
  const [consent, setConsent] = useState({
    contact: false,
    identify: false,
    anonymous: false,
    agreed: false,
  });
  const [submittedCount, setSubmittedCount] = useState(0);
  const [supported, setSupported] = useState(true);
  // null until the capability check runs, and stays null on browsers that don't
  // expose Permissions Policy introspection at all (Safari, Firefox).
  const [micPolicy, setMicPolicy] = useState<boolean | null>(null);
  const [guidance, setGuidance] = useState<MicrophoneGuidance | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  const currentQuestion = questions[questionIndex];
  const currentAnswer = currentQuestion
    ? (answers[currentQuestion.id] ?? EMPTY_ANSWER)
    : EMPTY_ANSWER;

  const progress: QuestionProgress[] = useMemo(
    () =>
      questions.map((question) => {
        const answer = answers[question.id] ?? EMPTY_ANSWER;
        return {
          questionId: question.id,
          position: question.position,
          required: question.required,
          state:
            answer.savedDurationMs !== null
              ? "saved"
              : answer.take === "uploading"
                ? "uploading"
                : answer.take === "failed"
                  ? "failed"
                  : answer.take === "recorded"
                    ? "recorded"
                    : answer.skipped
                      ? "skipped"
                      : "unanswered",
        };
      }),
    [questions, answers],
  );

  const readiness = useMemo(() => deriveSubmitReadiness(progress), [progress]);
  const visibleFields = useMemo(() => participantFields(query.fields), [query.fields]);
  const missingFields = useMemo(
    () => missingRequiredFields(query.fields, values),
    [query.fields, values],
  );

  // Browser capability check. Post-mount only — there is no navigator or
  // MediaRecorder during SSR — which is exactly the "read an external system
  // into React state" case effects exist for.
  useEffect(() => {
    const hasGetUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);
    const hasRecorder = typeof MediaRecorder !== "undefined";
    /* eslint-disable react-hooks/set-state-in-effect -- capability detection can only run in the browser. */
    setSupported(hasGetUserMedia && hasRecorder);
    // Read before anything is clicked, so a frame that was never given the
    // microphone can say so up front instead of after a failed attempt.
    setMicPolicy(readMicrophonePolicy(document));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Move focus to the new step's heading so a keyboard or screen-reader user is
  // never left with focus on a control that no longer exists.
  useEffect(() => {
    headingRef.current?.focus();
  }, [screen, questionIndex]);

  // Restore a submission already open in this tab, so an accidental reload
  // doesn't silently start a second one. A recording in hand can't survive a
  // reload — but an answer already uploaded can, and this is how the review
  // list still shows it as saved.
  useEffect(() => {
    if (previewMode) return;
    const stored = sessionStorage.getItem(submissionStorageKey(query.public_id));
    if (!stored) return;

    let cancelled = false;
    loadProgress(stored).then((result) => {
      if (cancelled || !result || result.status !== "in_progress") return;
      setSubmissionId(stored);
      setAnswers((previous) => {
        const next = { ...previous };
        for (const answer of result.answers) {
          if (!answer.questionId || answer.status !== "uploaded") continue;
          next[answer.questionId] = { ...EMPTY_ANSWER, savedDurationMs: answer.durationMs ?? 0 };
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [query.public_id, previewMode]);

  // "Whether the participant may safely leave the page", made literal: the
  // browser warns only while something is genuinely unsaved.
  const hasUnsavedWork = useMemo(
    () =>
      Object.values(answers).some(
        (answer) => answer.take === "recorded" || answer.take === "uploading",
      ),
    [answers],
  );

  useEffect(() => {
    if (!hasUnsavedWork) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedWork]);

  const stopTicking = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  useEffect(
    () => () => {
      stopTicking();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [stopTicking],
  );

  function setAnswer(questionId: string, update: Partial<AnswerState>) {
    setAnswers((previous) => ({
      ...previous,
      [questionId]: { ...(previous[questionId] ?? EMPTY_ANSWER), ...update },
    }));
  }

  function setValue(key: ParticipantFieldKey, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  // --- Steps -------------------------------------------------------------

  async function handleBegin() {
    if (previewMode) return;
    setBusy(true);
    setFlowError(null);

    const result = await beginParticipation(query.public_id);
    setBusy(false);

    if ("error" in result) {
      setFlowError(result.error);
      return;
    }
    setSubmissionId(result.submissionId);
    sessionStorage.setItem(submissionStorageKey(query.public_id), result.submissionId);
    setScreen("mic");
  }

  async function requestMicrophone() {
    setMicState("requesting");
    setFlowError(null);
    try {
      // Browser defaults (echo cancellation, noise suppression, gain control on)
      // — deliberately the opposite of Remote Interview's raw capture. That tool
      // records a prepared guest on a laptop and wants nothing between the
      // microphone and the file; this one records a stranger on a phone in a
      // kitchen, where those three are the difference between usable and not.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicState("granted");
      setAnnouncement("Microphone ready.");
    } catch (error) {
      // getUserMedia rejects with NotAllowedError both when a person clicks
      // "Block" and when this frame was never delegated the microphone. Those
      // need opposite advice — see lib/audience-listening/microphone.ts.
      const name = error instanceof DOMException ? error.name : "";
      const result = deriveMicrophoneGuidance({
        embedded,
        policyAllowsMicrophone: micPolicy,
        errorName: name,
      });
      setGuidance(result);
      setMicState(result.block === "no_device" ? "no_device" : "denied");
      setAnnouncement(result.message);
    }
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || !currentQuestion) return;

    const mimeType = RECORDING_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const questionId = currentQuestion.id;
    chunksRef.current = [];
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stopTicking();
      const takeDurationMs = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });

      setAnswers((previous) => {
        const existing = previous[questionId] ?? EMPTY_ANSWER;
        if (existing.previewUrl) URL.revokeObjectURL(existing.previewUrl);
        return {
          ...previous,
          [questionId]: {
            ...existing,
            take: "recorded",
            takeDurationMs,
            blob,
            previewUrl: URL.createObjectURL(blob),
            error: null,
            skipped: false,
          },
        };
      });
      setIsRecording(false);
      setAnnouncement(`Recording stopped. ${Math.round(takeDurationMs / 1000)} seconds captured.`);
    };

    const maxMs = currentQuestion.max_duration_seconds * 1000;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setIsRecording(true);
    setAnnouncement("Recording started.");
    recorder.start();

    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= maxMs) {
        setAnnouncement("Maximum length reached. Recording stopped.");
        stopRecording();
      }
    }, 200);
  }

  function stopRecording() {
    stopTicking();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  /** Throws away the take in hand. An answer already saved to WUWF is untouched. */
  function discardTake() {
    if (!currentQuestion) return;
    setAnswers((previous) => {
      const existing = previous[currentQuestion.id] ?? EMPTY_ANSWER;
      if (existing.previewUrl) URL.revokeObjectURL(existing.previewUrl);
      return {
        ...previous,
        [currentQuestion.id]: {
          ...existing,
          take: "idle",
          takeDurationMs: null,
          blob: null,
          previewUrl: null,
          error: null,
          retake: existing.savedDurationMs !== null ? false : existing.retake,
        },
      };
    });
    setElapsedMs(0);
    setAnnouncement("Recording discarded.");
  }

  /**
   * Reserve the row, upload the bytes straight to Storage, confirm. The blob
   * stays in memory throughout, so a failure here is retryable without asking
   * anyone to record again.
   */
  async function saveAnswer(): Promise<boolean> {
    if (!currentQuestion || !submissionId) return false;
    const answer = answers[currentQuestion.id];
    if (!answer?.blob) return false;

    if (answer.blob.size > MAX_ANSWER_BYTES) {
      setAnswer(currentQuestion.id, {
        take: "failed",
        error: "That recording is too large to send. Try a shorter answer.",
      });
      return false;
    }

    // savedDurationMs clears here, not on success: al_reserve_answer() puts the
    // row back to `pending`, so from this moment WUWF no longer holds a
    // confirmed answer for this question, and the screen must say so.
    setAnswer(currentQuestion.id, { take: "uploading", error: null, savedDurationMs: null });
    const contentType = normalizeContentType(answer.blob.type || "audio/webm");

    const reserved = await reserveAnswerSlot({
      submissionId,
      questionId: currentQuestion.id,
      contentType,
    });
    if ("error" in reserved) {
      setAnswer(currentQuestion.id, { take: "failed", error: reserved.error });
      return false;
    }

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(AUDIENCE_LISTENING_MEDIA_BUCKET)
      .upload(reserved.storagePath, answer.blob, { contentType, upsert: true });

    if (uploadError) {
      setAnswer(currentQuestion.id, {
        take: "failed",
        error: "Your answer didn't reach us — check your connection and try again.",
      });
      return false;
    }

    const confirmed = await confirmAnswerUpload({
      answerId: reserved.answerId,
      sizeBytes: answer.blob.size,
      durationMs: answer.takeDurationMs,
    });
    if ("error" in confirmed) {
      setAnswer(currentQuestion.id, { take: "failed", error: confirmed.error });
      return false;
    }

    setAnswers((previous) => {
      const existing = previous[currentQuestion.id] ?? EMPTY_ANSWER;
      if (existing.previewUrl) URL.revokeObjectURL(existing.previewUrl);
      return {
        ...previous,
        [currentQuestion.id]: {
          ...EMPTY_ANSWER,
          savedDurationMs: existing.takeDurationMs,
        },
      };
    });
    setAnnouncement("Answer saved.");
    return true;
  }

  async function handleSaveAndContinue() {
    setBusy(true);
    const ok = await saveAnswer();
    setBusy(false);
    if (ok) advance();
  }

  function handleSkip() {
    if (!currentQuestion) return;
    setAnswer(currentQuestion.id, { ...EMPTY_ANSWER, skipped: true });
    advance();
  }

  function advance() {
    setElapsedMs(0);
    if (questionIndex < questions.length - 1) {
      setQuestionIndex(questionIndex + 1);
    } else {
      setScreen("review");
    }
  }

  async function handleSubmit() {
    if (!submissionId) return;
    setScreen("submitting");
    setFlowError(null);

    const saved = await saveDetails({
      submissionId,
      name: values.name ?? null,
      email: values.email ?? null,
      phone: values.phone ?? null,
      city: values.city ?? null,
      note: values.note ?? null,
      consentContact: consent.contact,
      consentIdentify: consent.identify,
      requestAnonymous: consent.anonymous,
    });
    if ("error" in saved) {
      setFlowError(saved.error);
      setScreen("consent");
      return;
    }

    const result = await submitResponse({ submissionId, consentAgreed: consent.agreed });
    if ("error" in result) {
      setFlowError(result.error);
      setScreen("consent");
      return;
    }

    sessionStorage.removeItem(submissionStorageKey(query.public_id));
    setSubmittedCount(result.answers);
    setScreen("done");
  }

  // --- Render ------------------------------------------------------------

  const blockedReason = submitBlockedReason(readiness, consent.agreed, missingFields);
  const skipToNewTab = shouldSkipStraightToNewTab({ embedded, policyAllowsMicrophone: micPolicy });
  const isSaved = currentAnswer.savedDurationMs !== null;
  const showRecorder = !isSaved || currentAnswer.retake;

  const stepLabel: Record<Screen, string> = {
    intro: query.public_title,
    mic: "Get ready to record",
    question: currentQuestion ? `Question ${questionIndex + 1} of ${questions.length}` : "",
    review: "Review your answers",
    info: "A little about you",
    consent: "Permissions and consent",
    submitting: "Sending your responses to WUWF",
    done: "WUWF received your response",
  };

  return (
    <ListenShell embedded={embedded}>
      {/* Transitions only. The timer is deliberately not in here. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {previewMode && (
        <Alert variant="note" className="mb-5">
          Staff preview. This is what a participant sees — nothing here records or submits anything.
        </Alert>
      )}

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mb-3 font-serif text-[22px] font-bold leading-snug text-ink-900 focus:outline-none"
      >
        {stepLabel[screen]}
      </h1>

      {flowError && (
        <Alert className="mb-4">
          {flowError}
          {embedded && (
            <>
              {" "}
              <a
                href={standaloneUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                Open this in a new tab
              </a>{" "}
              if the problem continues.
            </>
          )}
        </Alert>
      )}

      {screen === "intro" && (
        <div className="flex flex-col gap-4">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
            {query.public_intro}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            {questions.length} question{questions.length === 1 ? "" : "s"} · one audio answer each
          </p>
          <Alert variant="note">
            Your answers go to WUWF for editorial review and will not be published automatically.
            WUWF may use one answer without using the others, and submitting doesn&apos;t guarantee
            use or a reply.
          </Alert>
          {supported ? (
            <Button type="button" onClick={handleBegin} disabled={busy || previewMode}>
              {busy ? "Starting…" : "Begin"}
            </Button>
          ) : (
            <Alert>
              This browser can&apos;t record audio. Try the latest Chrome, Safari, Firefox or Edge —
              on a phone, the built-in browser usually works.
            </Alert>
          )}
        </div>
      )}

      {screen === "mic" && (
        <div className="flex flex-col gap-4">
          {/* The frame provably has no microphone permission, so the "Allow"
              button below cannot work. Say so and offer the route that does,
              instead of making someone fail first to find out. */}
          {micState === "idle" && skipToNewTab ? (
            <>
              <p className="text-[15px] leading-relaxed text-ink-700">
                Recording needs to happen in its own tab — this article doesn&apos;t allow it inside
                the page. Nothing is lost by opening it; you&apos;ll start from here.
              </p>
              <a href={standaloneUrl} target="_blank" rel="noopener noreferrer">
                <Button type="button" className="w-full">
                  Open in a new tab to record
                </Button>
              </a>
            </>
          ) : (
            <p className="text-[15px] leading-relaxed text-ink-700">
              WUWF needs access to your microphone. You&apos;ll only be asked once — recording
              starts when you press Start recording, and stops when you press Stop.
            </p>
          )}

          {micState === "idle" && !skipToNewTab && (
            <Button type="button" onClick={requestMicrophone}>
              Allow microphone access
            </Button>
          )}
          {micState === "requesting" && <p className="text-sm text-ink-500">Requesting access…</p>}

          {micState === "denied" && guidance && (
            <>
              <Alert>{guidance.message}</Alert>
              <div className="flex flex-wrap gap-2">
                {guidance.offerNewTab && (
                  <a href={standaloneUrl} target="_blank" rel="noopener noreferrer">
                    <Button type="button">Open in a new tab</Button>
                  </a>
                )}
                {guidance.offerRetry && (
                  <Button
                    type="button"
                    variant={guidance.offerNewTab ? "secondary" : "primary"}
                    onClick={requestMicrophone}
                  >
                    Try again
                  </Button>
                )}
              </div>
            </>
          )}

          {micState === "no_device" && (
            <Alert>
              No microphone was found. Connect one, or use a phone — then reload this page.
            </Alert>
          )}

          {micState === "granted" && (
            <>
              <p className="rounded border border-line bg-panel-50 px-3.5 py-2.5 text-sm font-semibold text-ink-700">
                Microphone ready
              </p>
              <Button type="button" onClick={() => setScreen("question")}>
                Continue to question 1
              </Button>
            </>
          )}
        </div>
      )}

      {screen === "question" && currentQuestion && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={currentQuestion.required ? "accent" : "muted"}>
              {currentQuestion.required ? "Required" : "Optional"}
            </Badge>
            <span className="text-xs text-ink-400">
              Up to {describeDuration(currentQuestion.max_duration_seconds)}
            </span>
          </div>

          <p className="font-serif text-[19px] font-bold leading-snug text-ink-900">
            {currentQuestion.prompt}
          </p>
          {currentQuestion.guidance && (
            <p className="text-sm leading-relaxed text-ink-500">{currentQuestion.guidance}</p>
          )}

          {isRecording ? (
            <div className="flex flex-col gap-3 rounded border border-line bg-panel-50 p-4">
              <p className="text-sm font-bold text-ink-900">Recording</p>
              <p
                role="timer"
                aria-live="off"
                className="font-mono text-[26px] font-bold tabular-nums text-ink-900"
              >
                {formatClock(elapsedMs / 1000)}
                <span className="text-base font-normal text-ink-400">
                  {" / "}
                  {formatClock(currentQuestion.max_duration_seconds)}
                </span>
              </p>
              <Button type="button" onClick={stopRecording}>
                Stop recording
              </Button>
            </div>
          ) : currentAnswer.take === "recorded" || currentAnswer.take === "failed" ? (
            <div className="flex flex-col gap-3 rounded border border-line bg-panel-50 p-4">
              <p className="text-sm font-bold text-ink-900">
                Recorded
                {currentAnswer.takeDurationMs
                  ? ` — ${formatClock(currentAnswer.takeDurationMs / 1000)}`
                  : ""}
              </p>
              {currentAnswer.previewUrl && (
                <audio controls src={currentAnswer.previewUrl} className="w-full">
                  <track kind="captions" />
                </audio>
              )}
              {currentAnswer.error && <Alert>{currentAnswer.error}</Alert>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={discardTake} disabled={busy}>
                  Redo this answer
                </Button>
                <Button type="button" onClick={handleSaveAndContinue} disabled={busy}>
                  {busy
                    ? "Saving…"
                    : currentAnswer.take === "failed"
                      ? "Try sending again"
                      : questionIndex === questions.length - 1
                        ? "Save and review"
                        : "Save and continue"}
                </Button>
              </div>
            </div>
          ) : currentAnswer.take === "uploading" ? (
            <p className="rounded border border-line bg-panel-50 p-4 text-sm font-semibold text-ink-700">
              Saving your answer…
            </p>
          ) : isSaved && !currentAnswer.retake ? (
            <div className="flex flex-col gap-3 rounded border border-success-border bg-success-bg p-4">
              <p className="text-sm font-bold text-success-fg">Saved — WUWF has this answer</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAnswer(currentQuestion.id, { retake: true })}
                >
                  Replace this answer
                </Button>
                <Button type="button" onClick={advance}>
                  {questionIndex === questions.length - 1 ? "Review answers" : "Next question"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {isSaved && currentAnswer.retake && (
                <Alert variant="note">
                  Recording again replaces the answer WUWF already has for this question. Nothing
                  else you&apos;ve sent is affected.
                </Alert>
              )}
              <Button type="button" onClick={startRecording} disabled={micState !== "granted"}>
                Start recording
              </Button>
              {isSaved && currentAnswer.retake && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAnswer(currentQuestion.id, { retake: false })}
                >
                  Keep the answer I already sent
                </Button>
              )}
              {!isSaved && !currentQuestion.required && (
                <Button type="button" variant="ghost" onClick={handleSkip}>
                  Skip this question — it&apos;s optional
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <p className="text-xs text-ink-400">
              Question {questionIndex + 1} of {questions.length}
              {readiness.savedCount > 0 &&
                ` · ${readiness.savedCount} answer${readiness.savedCount === 1 ? "" : "s"} saved`}
            </p>
            <div className="flex gap-3">
              {questionIndex > 0 && !isRecording && (
                <button
                  type="button"
                  onClick={() => setQuestionIndex(questionIndex - 1)}
                  className="text-xs font-semibold text-brand-link hover:underline"
                >
                  ← Previous question
                </button>
              )}
              {showRecorder && !isRecording && currentAnswer.take === "idle" && !isSaved && (
                <button
                  type="button"
                  onClick={advance}
                  className="text-xs font-semibold text-brand-link hover:underline"
                >
                  Come back to this later →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {screen === "review" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink-500">
            You can replace any recording before you continue.
          </p>
          <ul className="flex flex-col gap-2">
            {questions.map((question, index) => {
              const state = progress[index]?.state ?? "unanswered";
              const durationMs = answers[question.id]?.savedDurationMs ?? null;
              return (
                <li
                  key={question.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-line px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{question.prompt}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {state === "saved"
                        ? `Answered${durationMs ? ` · ${formatClock(durationMs / 1000)}` : ""}`
                        : state === "skipped"
                          ? "Skipped"
                          : question.required
                            ? "Required — still needs an answer"
                            : "Not answered"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (state === "saved") setAnswer(question.id, { retake: true });
                      setQuestionIndex(index);
                      setScreen("question");
                    }}
                  >
                    {state === "saved" ? "Replace" : "Record"}
                  </Button>
                </li>
              );
            })}
          </ul>

          {readiness.missingRequiredPositions.length > 0 && (
            <Alert>{submitBlockedReason(readiness, true, [])}</Alert>
          )}

          <Button
            type="button"
            onClick={() => setScreen(visibleFields.length > 0 ? "info" : "consent")}
            disabled={!readiness.canSubmit}
          >
            Continue
          </Button>
        </div>
      )}

      {screen === "info" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink-500">
            {visibleFields.every((field) => field.mode === "optional")
              ? "Everything here is optional."
              : "Fields marked required are needed before you can submit."}
          </p>

          {visibleFields.map((field) => (
            <div key={field.key}>
              <Label htmlFor={`field-${field.key}`}>
                {field.label}
                {field.mode === "optional" ? " (optional)" : ""}
              </Label>
              {field.kind === "textarea" ? (
                <Textarea
                  id={`field-${field.key}`}
                  rows={3}
                  maxLength={field.maxLength}
                  required={field.mode === "required"}
                  value={values[field.key] ?? ""}
                  onChange={(event) => setValue(field.key, event.target.value)}
                />
              ) : (
                <Input
                  id={`field-${field.key}`}
                  type={field.kind}
                  maxLength={field.maxLength}
                  required={field.mode === "required"}
                  value={values[field.key] ?? ""}
                  onChange={(event) => setValue(field.key, event.target.value)}
                />
              )}
              {field.hint && <FieldHint>{field.hint}</FieldHint>}
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setScreen("review")}>
              Back
            </Button>
            <Button
              type="button"
              onClick={() => setScreen("consent")}
              disabled={missingFields.length > 0}
            >
              Continue
            </Button>
          </div>
          {missingFields.length > 0 && (
            <p className="text-xs text-ink-400">
              {submitBlockedReason(readiness, true, missingFields)}
            </p>
          )}
        </div>
      )}

      {screen === "consent" && (
        <div className="flex flex-col gap-4">
          {query.ask_contact_permission && (
            <>
              <Checkbox
                checked={consent.contact}
                onChange={(checked) => setConsent({ ...consent, contact: checked })}
                label="WUWF may contact me about my responses."
              />
              {consent.contact && !values.email?.trim() && !values.phone?.trim() && (
                <Alert variant="note">
                  You haven&apos;t given an email or phone number, so there&apos;s no way to reach
                  you. Go back and add one if you&apos;d like to be contacted.
                </Alert>
              )}
            </>
          )}
          {query.ask_attribution_permission && (
            <Checkbox
              checked={consent.identify}
              onChange={(checked) => setConsent({ ...consent, identify: checked })}
              label="WUWF may identify me by name if one or more of my responses is used."
            />
          )}
          {query.allow_anonymous_request && (
            <Checkbox
              checked={consent.anonymous}
              onChange={(checked) => setConsent({ ...consent, anonymous: checked })}
              label="Please consider my responses anonymously."
            />
          )}

          <p className="whitespace-pre-wrap rounded border border-line bg-panel-50 p-4 text-xs leading-relaxed text-ink-700">
            {query.consent_text}
          </p>

          <Checkbox
            checked={consent.agreed}
            onChange={(checked) => setConsent({ ...consent, agreed: checked })}
            label="I have read and agree to these terms."
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setScreen(visibleFields.length > 0 ? "info" : "review")}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={Boolean(blockedReason) || previewMode}
            >
              Submit my response
            </Button>
          </div>
          {blockedReason && <p className="text-xs text-ink-400">{blockedReason}</p>}
        </div>
      )}

      {screen === "submitting" && (
        <div className="flex flex-col gap-3">
          <p className="text-[15px] leading-relaxed text-ink-700">
            Please keep this page open until this finishes.
          </p>
          <p aria-live="polite" className="text-sm font-semibold text-ink-900">
            Sending…
          </p>
        </div>
      )}

      {screen === "done" && (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed text-ink-700">
            {submittedCount} answer{submittedCount === 1 ? "" : "s"} received. Thank you — you can
            close this page.
          </p>
          <Alert variant="note">
            A reporter may contact you only if you gave permission. Nothing here is published
            automatically, and submitting doesn&apos;t guarantee a reply.
          </Alert>
          <p className="text-xs text-ink-400">— WUWF Public Media, Pensacola, FL</p>
        </div>
      )}
    </ListenShell>
  );
}

/** A real checkbox with a real label — no custom control, nothing dependent on hover. */
function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-brand-primary focus:ring-brand-surface"
      />
      {label}
    </label>
  );
}
