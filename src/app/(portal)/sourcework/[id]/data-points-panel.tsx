"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, Textarea, FieldError } from "@/components/ui/input";
import { formatDuration } from "@/lib/transcription/media";
import type { SwResearchQuestion } from "@/lib/transcription/research";
import type { ProjectDataPoint, DataPointExcerptRef } from "@/lib/transcription/research";
import {
  attachExcerptToDataPoint,
  createDataPoint,
  deleteDataPoint,
  detachExcerptFromDataPoint,
  listAttachableExcerpts,
  setDataPointResearchQuestion,
  updateDataPointSummary,
  type AttachableExcerpt,
} from "./research-actions";

const NO_QUESTION_VALUE = "";

/**
 * A project's data points — the reporter's own articulated findings,
 * grounded by zero or more excerpts (docs/sourcework-design.md §9.5).
 */
export function DataPointsPanel({
  projectId,
  questions,
  dataPoints,
}: {
  projectId: string;
  questions: SwResearchQuestion[];
  dataPoints: ProjectDataPoint[];
}) {
  const router = useRouter();
  const activeQuestions = questions.filter((question) => question.active);
  const questionById = new Map(questions.map((question) => [question.id, question]));

  return (
    <section>
      <h2 className="mb-3 font-serif text-lg font-bold text-ink-900">Data points</h2>
      {dataPoints.length === 0 && (
        <p className="mb-3 text-sm italic text-ink-400">
          Nothing yet — a data point is your own finding, grounded by evidence you attach below.
        </p>
      )}
      <ul className="mb-4 flex flex-col gap-3">
        {dataPoints.map((dataPoint) => (
          <DataPointCard
            key={dataPoint.id}
            projectId={projectId}
            dataPoint={dataPoint}
            questions={activeQuestions}
            answeredQuestion={
              dataPoint.researchQuestionId ? (questionById.get(dataPoint.researchQuestionId) ?? null) : null
            }
            onChanged={() => router.refresh()}
          />
        ))}
      </ul>

      <NewDataPointForm
        projectId={projectId}
        questions={activeQuestions}
        onCreated={() => router.refresh()}
      />
    </section>
  );
}

function DataPointCard({
  projectId,
  dataPoint,
  questions,
  answeredQuestion,
  onChanged,
}: {
  projectId: string;
  dataPoint: ProjectDataPoint;
  questions: SwResearchQuestion[];
  answeredQuestion: SwResearchQuestion | null;
  onChanged: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [summary, setSummary] = useState(dataPoint.summary);
  const [isSaving, setIsSaving] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSaveSummary() {
    setIsSaving(true);
    setError(null);
    const result = await updateDataPointSummary(dataPoint.id, summary);
    setIsSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setIsEditing(false);
    onChanged();
  }

  async function handleQuestionChange(value: string) {
    await setDataPointResearchQuestion(dataPoint.id, value === NO_QUESTION_VALUE ? null : value);
    onChanged();
  }

  async function handleDelete() {
    if (!confirm("Delete this data point? Its grounding excerpts stay untouched.")) return;
    await deleteDataPoint(dataPoint.id);
    onChanged();
  }

  async function handleDetach(excerptId: string) {
    await detachExcerptFromDataPoint(dataPoint.id, excerptId);
    onChanged();
  }

  return (
    <li className="rounded border border-line bg-white p-4">
      {isEditing ? (
        <div>
          <Textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={3}
            autoFocus
          />
          {error && <FieldError>{error}</FieldError>}
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              onClick={handleSaveSummary}
              disabled={isSaving}
              className="px-2.5 py-1 text-xs"
            >
              {isSaving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSummary(dataPoint.summary);
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
        <>
          <p className="text-sm text-ink-900">{dataPoint.summary}</p>
          {answeredQuestion && (
            <p className="mt-1 text-xs text-ink-500">
              Answers: <span className="italic">{answeredQuestion.prompt}</span>
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-xs font-semibold text-brand-link hover:underline"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="text-xs font-semibold text-ink-500 hover:text-danger"
            >
              Delete
            </button>
            {questions.length > 0 && (
              <Select
                value={dataPoint.researchQuestionId ?? NO_QUESTION_VALUE}
                onChange={(event) => handleQuestionChange(event.target.value)}
                className="ml-auto w-auto py-1 text-xs"
              >
                <option value={NO_QUESTION_VALUE}>Doesn&rsquo;t answer a specific question</option>
                {questions.map((question) => (
                  <option key={question.id} value={question.id}>
                    {question.prompt}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </>
      )}

      <div className="mt-3 border-t border-line pt-3">
        {dataPoint.excerpts.length === 0 ? (
          <p className="text-xs italic text-ink-400">Add evidence — no excerpts attached yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {dataPoint.excerpts.map((excerpt) => (
              <ExcerptChip
                key={excerpt.excerptId}
                projectId={projectId}
                excerpt={excerpt}
                onRemove={() => handleDetach(excerpt.excerptId)}
              />
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => setIsPickerOpen(true)}
          className="mt-2 text-xs font-semibold text-brand-link hover:underline"
        >
          + Attach an excerpt
        </button>
      </div>

      {isPickerOpen && (
        <ExcerptPicker
          projectId={projectId}
          dataPointId={dataPoint.id}
          onClose={() => setIsPickerOpen(false)}
          onAttached={() => {
            setIsPickerOpen(false);
            onChanged();
          }}
        />
      )}
    </li>
  );
}

function ExcerptChip({
  projectId,
  excerpt,
  onRemove,
}: {
  projectId: string;
  excerpt: DataPointExcerptRef;
  onRemove: () => void;
}) {
  const params = new URLSearchParams();
  params.set("source", excerpt.sourceId);
  if (excerpt.startMs !== null) params.set("t", String(excerpt.startMs));
  else if (excerpt.pageNumber !== null) params.set("page", String(excerpt.pageNumber));

  return (
    <li className="flex items-center gap-1 rounded-full border border-line bg-panel-50 py-0.5 pl-2.5 pr-1 text-xs">
      <Link href={`/sourcework/${projectId}?${params.toString()}`} className="text-brand-link hover:underline">
        {excerpt.title}
        {excerpt.startMs !== null
          ? ` · ${formatDuration(excerpt.startMs)}`
          : excerpt.pageNumber !== null
            ? ` · p. ${excerpt.pageNumber}`
            : ""}
      </Link>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${excerpt.title}`}
        className="rounded-full px-1 text-ink-400 hover:text-danger"
      >
        ×
      </button>
    </li>
  );
}

function ExcerptPicker({
  projectId,
  dataPointId,
  onClose,
  onAttached,
}: {
  projectId: string;
  dataPointId: string;
  onClose: () => void;
  onAttached: () => void;
}) {
  const [candidates, setCandidates] = useState<AttachableExcerpt[] | null>(null);
  const [query, setQuery] = useState("");
  const [attachingId, setAttachingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAttachableExcerpts(projectId, dataPointId).then((result) => {
      if (!cancelled) setCandidates(result);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, dataPointId]);

  const filtered =
    candidates?.filter((candidate) => {
      const haystack = `${candidate.title} ${candidate.excerpt} ${candidate.sourceTitle}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    }) ?? [];

  async function handleAttach(excerptId: string) {
    setAttachingId(excerptId);
    await attachExcerptToDataPoint(dataPointId, excerptId);
    setAttachingId(null);
    onAttached();
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center bg-black/30 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded border border-line bg-white p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink-900">Attach an excerpt</p>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-ink-400 hover:text-ink-700"
          >
            Close
          </button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search this project's excerpts…"
          className="mb-3 w-full rounded border border-line bg-white px-3 py-2 text-base sm:text-sm"
        />
        <div className="max-h-80 overflow-y-auto">
          {candidates === null ? (
            <p className="py-4 text-center text-xs text-ink-400">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-400">
              Nothing matches. Every excerpt may already be attached.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {filtered.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">{candidate.title}</p>
                    <p className="truncate text-xs text-ink-500">{candidate.sourceTitle}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={attachingId === candidate.id}
                    onClick={() => handleAttach(candidate.id)}
                    className="shrink-0 px-2.5 py-1 text-xs"
                  >
                    {attachingId === candidate.id ? "Attaching…" : "Attach"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function NewDataPointForm({
  projectId,
  questions,
  onCreated,
}: {
  projectId: string;
  questions: SwResearchQuestion[];
  onCreated: () => void;
}) {
  const [summary, setSummary] = useState("");
  const [researchQuestionId, setResearchQuestionId] = useState(NO_QUESTION_VALUE);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await createDataPoint(
      projectId,
      summary,
      researchQuestionId === NO_QUESTION_VALUE ? null : researchQuestionId,
    );
    setIsSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSummary("");
    setResearchQuestionId(NO_QUESTION_VALUE);
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded border border-dashed border-line p-3">
      <Textarea
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        placeholder="What did you find? State it as your own claim, not a quote."
        rows={2}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {questions.length > 0 && (
          <Select
            value={researchQuestionId}
            onChange={(event) => setResearchQuestionId(event.target.value)}
            className="w-auto py-1.5 text-xs"
          >
            <option value={NO_QUESTION_VALUE}>Doesn&rsquo;t answer a specific question</option>
            {questions.map((question) => (
              <option key={question.id} value={question.id}>
                {question.prompt}
              </option>
            ))}
          </Select>
        )}
        <Button type="submit" variant="secondary" disabled={isSaving} className="ml-auto px-3 py-1.5 text-xs">
          {isSaving ? "Adding…" : "+ New data point"}
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </form>
  );
}
