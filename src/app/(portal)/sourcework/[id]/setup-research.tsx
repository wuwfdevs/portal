"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionMenu } from "@/components/ui/action-menu";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { actionFailureMessage } from "@/lib/use-action";
import { formatShortDate } from "@/lib/format";
import type { ActionResult } from "@/lib/action-response";
import {
  QUESTION_LIMIT,
  QUESTION_MAX,
  type ContextNote,
  type ResearchQuestion,
} from "@/lib/sourcework/research";
import {
  NOTES_SHOWN,
  dataPointsLabel,
  isNotConfiguredMessage,
  splitContextNotes,
} from "@/lib/sourcework/setup-view";
import {
  addResearchQuestion,
  moveResearchQuestion,
  setContextNoteDismissed,
  setResearchQuestionArchived,
  updateResearchQuestion,
} from "../research-actions";

const TAP = "max-lg:min-h-11";

/**
 * The Setup tab's two editable sections, in one component because they share
 * the background lookup: changing a question gathers background again, and the
 * Refresh button, the first visit and a question edit all show the same
 * "Looking up background…" state.
 */
export function SetupResearch({
  projectId,
  questions,
  notes,
  backgroundStale,
}: {
  projectId: string;
  questions: ResearchQuestion[];
  notes: ContextNote[];
  /** The server's contextNeedsRefresh() for the current questions and last run. */
  backgroundStale: boolean;
}) {
  const router = useRouter();
  const [gathering, setGathering] = useState(false);
  const [gatherError, setGatherError] = useState<string | null>(null);
  const startedAuto = useRef(false);

  async function gather(force: boolean) {
    setGathering(true);
    setGatherError(null);
    try {
      const response = await fetch("/api/sourcework/context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(force ? { projectId, force: true } : { projectId }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!response.ok || body?.ok === false) {
        setGatherError(body?.error ?? "Couldn't look up background. Try again.");
      }
    } catch {
      setGatherError("Couldn't look up background. Check your connection and try again.");
    } finally {
      setGathering(false);
      router.refresh();
    }
  }

  // Once per visit, when the background is missing or no longer matches the
  // questions. The ref keeps React's strict-mode double effect to one request.
  useEffect(() => {
    if (!backgroundStale || startedAuto.current) return;
    startedAuto.current = true;
    void gather(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundStale]);

  const active = questions.filter((question) => question.archivedAt === null);

  return (
    <>
      <QuestionsSection
        projectId={projectId}
        questions={questions}
        onChanged={() => void gather(false)}
      />
      <BackgroundSection
        notes={notes}
        hasQuestions={active.length > 0}
        gathering={gathering}
        error={gatherError}
        onRefresh={() => void gather(true)}
      />
    </>
  );
}

// Questions ------------------------------------------------------------------------

function QuestionsSection({
  projectId,
  questions,
  onChanged,
}: {
  projectId: string;
  questions: ResearchQuestion[];
  onChanged: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");

  const active = questions.filter((question) => question.archivedAt === null);
  const archived = questions.filter((question) => question.archivedAt !== null);
  const atLimit = active.length >= QUESTION_LIMIT;

  async function act(
    write: () => Promise<ActionResult<Record<string, unknown>>>,
    options: { gather?: boolean } = {},
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const result = await write();
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      router.refresh();
      if (options.gather) onChanged();
      return true;
    } catch (caught) {
      setError(actionFailureMessage(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitNew() {
    if (newText.trim() === "") return;
    const ok = await act(() => addResearchQuestion({ projectId, question: newText }), {
      gather: true,
    });
    if (ok) {
      setNewText("");
      setAdding(false);
    }
  }

  return (
    <section aria-labelledby="questions-heading">
      <SectionHeading level="eyebrow" id="questions-heading" className="mb-2">
        Research questions
      </SectionHeading>
      <div className="flex flex-col gap-3 rounded border border-line bg-white p-4 sm:p-5">
        <p className="text-sm text-ink-500">
          What you are trying to learn. Data points that answer a question are tagged with it;
          passages worth using that answer none are kept as story material.
        </p>
        {error && <Alert variant="danger">{error}</Alert>}

        {active.length > 0 && (
          <ol className="flex flex-col divide-y divide-line">
            {active.map((question, index) => (
              <QuestionRow
                key={`${question.id}:${question.question}`}
                question={question}
                isFirst={index === 0}
                isLast={index === active.length - 1}
                busy={busy}
                onSave={(text) =>
                  act(() => updateResearchQuestion({ id: question.id, question: text }), {
                    gather: true,
                  })
                }
                onMove={(direction) =>
                  act(() => moveResearchQuestion({ id: question.id, direction }))
                }
                onArchive={() =>
                  act(() => setResearchQuestionArchived({ id: question.id, archived: true }), {
                    gather: true,
                  })
                }
              />
            ))}
          </ol>
        )}

        {adding ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              autoFocus
              value={newText}
              maxLength={QUESTION_MAX}
              placeholder="What do you want to learn?"
              aria-label="New research question"
              disabled={busy}
              onChange={(event) => setNewText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitNew();
                }
                if (event.key === "Escape") setAdding(false);
              }}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                className={TAP}
                disabled={busy || newText.trim() === ""}
                onClick={() => void submitNew()}
              >
                Add
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={TAP}
                onClick={() => setAdding(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : atLimit ? (
          <p className="text-sm text-ink-500">
            A project can have {QUESTION_LIMIT} questions at a time. Archive one to add another.
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={`${TAP} self-start`}
              onClick={() => setAdding(true)}
            >
              + Add question
            </Button>
            <p className="text-xs text-ink-400">
              Changing a question does not change data points already accepted. The ⋮ menu reorders
              or archives; archived questions keep their data points.
            </p>
          </div>
        )}
        {(adding || atLimit) && (
          <p className="text-xs text-ink-400">
            Changing a question does not change data points already accepted. The ⋮ menu reorders or
            archives; archived questions keep their data points.
          </p>
        )}

        {archived.length > 0 && (
          <details className="text-sm">
            <summary className={`${TAP} flex cursor-pointer items-center text-ink-500`}>
              Archived ({archived.length})
            </summary>
            <ul className="mt-1 flex flex-col divide-y divide-line">
              {archived.map((question) => (
                <li key={question.id} className="flex items-center gap-3 py-2">
                  <span className="w-8 shrink-0 font-mono text-xs text-ink-400">
                    {question.label}
                  </span>
                  <span className="min-w-0 flex-1 text-ink-500">{question.question}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className={TAP}
                    disabled={busy || atLimit}
                    title={atLimit ? "Archive another question first" : undefined}
                    onClick={() =>
                      void act(
                        () => setResearchQuestionArchived({ id: question.id, archived: false }),
                        {
                          gather: true,
                        },
                      )
                    }
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function QuestionRow({
  question,
  isFirst,
  isLast,
  busy,
  onSave,
  onMove,
  onArchive,
}: {
  question: ResearchQuestion;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onSave: (text: string) => Promise<boolean>;
  onMove: (direction: "up" | "down") => Promise<boolean>;
  onArchive: () => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(question.question);

  async function save() {
    const text = draft.trim();
    if (text === question.question) return;
    const ok = await onSave(text);
    if (!ok) setDraft(question.question);
  }

  const count = dataPointsLabel(question.dataPointCount);
  return (
    <li className="flex items-start gap-2 py-2 sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <span className="font-mono text-xs text-ink-400 sm:hidden">
          {question.label} · {count}
        </span>
        <span className="hidden w-8 shrink-0 font-mono text-xs text-ink-400 sm:inline">
          {question.label}
        </span>
        <Input
          value={draft}
          maxLength={QUESTION_MAX}
          aria-label={`Question ${question.label}`}
          disabled={busy}
          className="border-transparent hover:border-line"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setDraft(question.question);
          }}
        />
        <span className="hidden shrink-0 whitespace-nowrap text-xs text-ink-500 sm:inline">
          {count}
        </span>
      </div>
      <ActionMenu
        trigger="quiet"
        label={`Actions for ${question.label}`}
        sheetHeading={question.label}
        items={[
          {
            label: "Move up",
            disabled: isFirst,
            hint: isFirst ? "Already first" : undefined,
            onClick: () => void onMove("up"),
          },
          {
            label: "Move down",
            disabled: isLast,
            hint: isLast ? "Already last" : undefined,
            onClick: () => void onMove("down"),
          },
          {
            label: "Archive",
            dividerBefore: true,
            onClick: () => void onArchive(),
          },
        ]}
      />
    </li>
  );
}

// Background -------------------------------------------------------------------------

function BackgroundSection({
  notes,
  hasQuestions,
  gathering,
  error,
  onRefresh,
}: {
  notes: ContextNote[];
  hasQuestions: boolean;
  gathering: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { active, dismissed } = splitContextNotes(notes);
  const shown = expanded ? active : active.slice(0, NOTES_SHOWN);

  async function setDismissed(id: string, value: boolean) {
    setBusyId(id);
    setActionError(null);
    try {
      const result = await setContextNoteDismissed({ id, dismissed: value });
      if (!result.ok) setActionError(result.error);
      else router.refresh();
    } catch (caught) {
      setActionError(actionFailureMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="background-heading">
      <SectionHeading
        level="eyebrow"
        id="background-heading"
        className="mb-2 items-center"
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={TAP}
            disabled={gathering || !hasQuestions}
            aria-busy={gathering || undefined}
            onClick={onRefresh}
          >
            {gathering ? "Looking up background…" : "Refresh"}
          </Button>
        }
      >
        Background notes · {active.length}
      </SectionHeading>
      <div className="flex flex-col gap-3 rounded border border-line bg-white p-4 sm:p-5">
        <p className="text-sm text-ink-500">
          Found on the web to help read your sources: people, places and terms they mention. They
          inform the model, are never quoted, and never count as evidence. Dismiss one that is wrong
          or irrelevant.
        </p>
        {actionError && <Alert variant="danger">{actionError}</Alert>}
        {error &&
          (isNotConfiguredMessage(error) ? (
            <p className="text-sm text-ink-500">{error}</p>
          ) : (
            <Alert variant="danger">{error}</Alert>
          ))}
        {gathering && active.length === 0 && (
          <p role="status" className="text-sm text-ink-500">
            Looking up background…
          </p>
        )}
        {!gathering && active.length === 0 && !error && (
          <p className="text-sm text-ink-400">
            {hasQuestions
              ? "No background notes yet."
              : "Background is looked up once the project has research questions."}
          </p>
        )}

        {shown.length > 0 && (
          <ul className="flex flex-col divide-y divide-line">
            {shown.map((note) => (
              <li key={note.id} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <a
                    href={note.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-brand-link hover:underline"
                  >
                    {note.title}
                  </a>
                  <p className="mt-0.5 text-sm text-ink-700">{note.summary}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {note.sourceName} · retrieved {formatShortDate(note.retrievedAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className={TAP}
                  disabled={busyId === note.id}
                  onClick={() => void setDismissed(note.id, true)}
                >
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        )}
        {active.length > NOTES_SHOWN && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className={`${TAP} self-start text-sm font-semibold text-brand-link`}
          >
            {expanded ? "Show fewer" : `Show ${active.length - NOTES_SHOWN} more`}
          </button>
        )}

        {dismissed.length > 0 && (
          <details className="text-sm">
            <summary className={`${TAP} flex cursor-pointer items-center text-ink-500`}>
              Dismissed ({dismissed.length})
            </summary>
            <ul className="mt-1 flex flex-col divide-y divide-line">
              {dismissed.map((note) => (
                <li key={note.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 text-ink-500">{note.title}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className={TAP}
                    disabled={busyId === note.id}
                    onClick={() => void setDismissed(note.id, false)}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-400">
        Gathered automatically when you add or change questions, and before sources are extracted.
        Search queries avoid interviewee names.
      </p>
    </section>
  );
}
