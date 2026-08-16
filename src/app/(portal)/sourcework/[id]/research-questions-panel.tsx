"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea, FieldError } from "@/components/ui/input";
import {
  createResearchQuestion,
  reorderResearchQuestion,
  setResearchQuestionActive,
  updateResearchQuestion,
} from "./research-actions";
import type { SwResearchQuestion } from "@/lib/transcription/research";
import type { ThemesAnsweringQuestion } from "@/lib/transcription/themes";
import Link from "next/link";

const REORDER_BUTTON_CLASSES =
  "flex h-6 w-6 items-center justify-center rounded border border-line text-ink-500 " +
  "transition-colors hover:border-brand-primary hover:text-brand-link " +
  "disabled:cursor-not-allowed disabled:border-line/60 disabled:text-ink-400/40";

/**
 * A project's research questions — what a reporter is trying to find out
 * (docs/sourcework-design.md §9.5). Active questions are reorderable;
 * deactivated ones (no delete path — §9.2) collapse into a disclosure below.
 */
export function ResearchQuestionsPanel({
  projectId,
  questions,
  answeringThemesByQuestionId,
}: {
  projectId: string;
  questions: SwResearchQuestion[];
  /**
   * Which theme(s) answer each question, if any — the reverse rollup from
   * Phase 5 (docs/sourcework-analysis-design.md §1's "actual deliverable"
   * framing). A plain object, not a Map: this crossed the server/client
   * component boundary in the page. Optional so this component keeps
   * working, minus the rollup line, if a caller doesn't have it yet.
   */
  answeringThemesByQuestionId?: Record<string, ThemesAnsweringQuestion[]>;
}) {
  const router = useRouter();
  const [showDeactivated, setShowDeactivated] = useState(false);
  const active = questions.filter((question) => question.active);
  const deactivated = questions.filter((question) => !question.active);

  return (
    <section>
      <h2 className="mb-3 font-serif text-lg font-bold text-ink-900">Research questions</h2>
      {active.length === 0 && (
        <p className="mb-3 text-sm italic text-ink-400">
          Nothing yet — write down what you&rsquo;re trying to find out.
        </p>
      )}
      <ul className="mb-3 flex flex-col gap-2">
        {active.map((question, index) => (
          <QuestionRow
            key={question.id}
            question={question}
            isFirst={index === 0}
            isLast={index === active.length - 1}
            answeringThemes={answeringThemesByQuestionId?.[question.id] ?? []}
            onChanged={() => router.refresh()}
          />
        ))}
      </ul>

      <AddQuestionForm projectId={projectId} onCreated={() => router.refresh()} />

      {deactivated.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowDeactivated((value) => !value)}
            className="text-xs font-semibold text-ink-500 hover:text-ink-700"
          >
            {showDeactivated ? "Hide" : "Show"} deactivated ({deactivated.length})
          </button>
          {showDeactivated && (
            <ul className="mt-2 flex flex-col gap-2">
              {deactivated.map((question) => (
                <QuestionRow
                  key={question.id}
                  question={question}
                  isFirst
                  isLast
                  answeringThemes={answeringThemesByQuestionId?.[question.id] ?? []}
                  onChanged={() => router.refresh()}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function QuestionRow({
  question,
  isFirst,
  isLast,
  answeringThemes,
  onChanged,
}: {
  question: SwResearchQuestion;
  isFirst: boolean;
  isLast: boolean;
  answeringThemes: ThemesAnsweringQuestion[];
  onChanged: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [prompt, setPrompt] = useState(question.prompt);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    const result = await updateResearchQuestion(question.id, prompt);
    setIsSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setIsEditing(false);
    onChanged();
  }

  async function handleToggleActive() {
    await setResearchQuestionActive(question.id, !question.active);
    onChanged();
  }

  async function handleReorder(direction: "up" | "down") {
    await reorderResearchQuestion(question.id, direction);
    onChanged();
  }

  return (
    <li className="rounded border border-line bg-white p-3">
      {isEditing ? (
        <div>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={2}
            autoFocus
          />
          {error && <FieldError>{error}</FieldError>}
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-2.5 py-1 text-xs"
            >
              {isSaving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPrompt(question.prompt);
                setIsEditing(false);
                setError(null);
              }}
              className="px-2.5 py-1 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className={
                question.active ? "text-sm text-ink-900" : "text-sm text-ink-400 line-through"
              }
            >
              {question.prompt}
            </p>
            {answeringThemes.length > 0 ? (
              <p className="mt-1 text-xs text-ink-500">
                Answered by:{" "}
                {answeringThemes.map((theme, index) => (
                  <span key={theme.id}>
                    {index > 0 && ", "}
                    <Link
                      href={`/sourcework/themes/${theme.id}`}
                      className="italic text-brand-link hover:underline"
                    >
                      {theme.title}
                    </Link>
                  </span>
                ))}
              </p>
            ) : (
              question.active && <p className="mt-1 text-xs italic text-ink-400">Not yet answered</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {question.active && (
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={isFirst}
                  onClick={() => handleReorder("up")}
                  aria-label="Move up"
                  className={REORDER_BUTTON_CLASSES}
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  disabled={isLast}
                  onClick={() => handleReorder("down")}
                  aria-label="Move down"
                  className={REORDER_BUTTON_CLASSES}
                >
                  <span aria-hidden="true">↓</span>
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-xs font-semibold text-brand-link hover:underline"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleToggleActive}
              className="text-xs font-semibold text-ink-500 hover:text-ink-700"
            >
              {question.active ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function AddQuestionForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await createResearchQuestion(projectId, prompt);
    setIsSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setPrompt("");
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="What are you trying to find out?"
        className="flex-1"
      />
      <Button type="submit" variant="secondary" disabled={isSaving} className="shrink-0">
        {isSaving ? "Adding…" : "Add"}
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </form>
  );
}
