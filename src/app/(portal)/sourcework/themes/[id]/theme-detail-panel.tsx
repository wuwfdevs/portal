"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, FieldError } from "@/components/ui/input";
import { formatDuration } from "@/lib/transcription/media";
import { wouldCreateThemeCycle } from "@/lib/transcription/theme-hierarchy";
import type { ThemeDetail, ThemeListItem, ResearchQuestionOption } from "@/lib/transcription/themes";
import type { ThemeDataPointRef } from "@/lib/transcription/themes";
import {
  attachDataPointToTheme,
  deleteTheme,
  detachDataPointFromTheme,
  listAttachableDataPoints,
  setThemeParent,
  setThemeResearchQuestion,
  updateTheme,
  type AttachableDataPoint,
} from "../actions";

const NONE_VALUE = "";

export function ThemeDetailPanel({
  theme,
  allThemes,
  questions,
}: {
  theme: ThemeDetail;
  allThemes: ThemeListItem[];
  questions: ResearchQuestionOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(theme.title);
  const [notes, setNotes] = useState(theme.notes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  async function handleSaveDetails() {
    setIsSaving(true);
    setError(null);
    const result = await updateTheme(theme.id, title, notes);
    setIsSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleQuestionChange(value: string) {
    await setThemeResearchQuestion(theme.id, value === NONE_VALUE ? null : value);
    refresh();
  }

  async function handleParentChange(value: string) {
    const result = await setThemeParent(theme.id, value === NONE_VALUE ? null : value);
    if (result.error) {
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleDelete() {
    if (
      !confirm(
        "Delete this theme? Its data points stay untouched; any child themes become top-level.",
      )
    ) {
      return;
    }
    await deleteTheme(theme.id);
    router.push("/sourcework?tab=themes");
  }

  async function handleDetach(dataPointId: string) {
    await detachDataPointFromTheme(theme.id, dataPointId);
    refresh();
  }

  const parentByThemeId = new Map(allThemes.map((item) => [item.id, item.parentThemeId]));
  const parentOptions = allThemes.filter(
    (candidate) =>
      candidate.id !== theme.id && !wouldCreateThemeCycle(theme.id, candidate.id, parentByThemeId),
  );

  return (
    <div>
      <div className="mb-6 rounded border border-line bg-white p-4">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mb-2 text-lg font-semibold"
        />
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Synthesis / notes — why this theme matters, and what it means."
        />
        {error && <FieldError>{error}</FieldError>}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleSaveDetails}
            disabled={isSaving}
            className="px-3 py-1.5 text-xs"
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <button
            type="button"
            onClick={handleDelete}
            className="text-xs font-semibold text-ink-500 hover:text-danger"
          >
            Delete theme
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-700">Answers…</label>
          <Select
            value={theme.researchQuestionId ?? NONE_VALUE}
            onChange={(event) => handleQuestionChange(event.target.value)}
          >
            <option value={NONE_VALUE}>Doesn&rsquo;t answer a specific question</option>
            {questions.map((question) => (
              <option key={question.id} value={question.id}>
                {question.prompt} ({question.projectTitle})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-700">Group under…</label>
          <Select
            value={theme.parentThemeId ?? NONE_VALUE}
            onChange={(event) => handleParentChange(event.target.value)}
          >
            <option value={NONE_VALUE}>Top-level (no parent theme)</option>
            {parentOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {theme.children.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
            Child themes
          </h2>
          <ul className="flex flex-col gap-1.5">
            {theme.children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/sourcework/themes/${child.id}`}
                  className="text-sm text-brand-link hover:underline"
                >
                  {child.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-3 font-serif text-lg font-bold text-ink-900">Data points</h2>
        {theme.dataPoints.length === 0 && (
          <p className="mb-3 text-sm italic text-ink-400">
            Nothing grouped here yet — attach a data point from any project.
          </p>
        )}
        <ul className="mb-3 flex flex-col gap-3">
          {theme.dataPoints.map((dataPoint) => (
            <ThemeDataPointCard
              key={dataPoint.id}
              dataPoint={dataPoint}
              onDetach={() => handleDetach(dataPoint.id)}
            />
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setIsPickerOpen(true)}
          className="text-xs font-semibold text-brand-link hover:underline"
        >
          + Add a data point
        </button>
      </div>

      {isPickerOpen && (
        <DataPointPicker
          themeId={theme.id}
          onClose={() => setIsPickerOpen(false)}
          onAttached={() => {
            setIsPickerOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ThemeDataPointCard({
  dataPoint,
  onDetach,
}: {
  dataPoint: ThemeDataPointRef;
  onDetach: () => void;
}) {
  return (
    <li className="rounded border border-line bg-white p-4">
      <p className="text-sm text-ink-900">{dataPoint.summary}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <Link
          href={`/sourcework/${dataPoint.projectId}/research`}
          className="text-xs text-ink-500 hover:text-brand-link"
        >
          {dataPoint.projectTitle}
        </Link>
        <button
          type="button"
          onClick={onDetach}
          className="text-xs font-semibold text-ink-400 hover:text-danger"
        >
          Remove from theme
        </button>
      </div>
      {dataPoint.excerpts.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {dataPoint.excerpts.map((excerpt) => {
            const params = new URLSearchParams();
            params.set("source", excerpt.sourceId);
            if (excerpt.startMs !== null) params.set("t", String(excerpt.startMs));
            else if (excerpt.pageNumber !== null) params.set("page", String(excerpt.pageNumber));
            return (
              <li key={excerpt.excerptId}>
                <Link
                  href={`/sourcework/${dataPoint.projectId}?${params.toString()}`}
                  className="rounded-full border border-line bg-panel-50 px-2.5 py-0.5 text-xs text-brand-link hover:underline"
                >
                  {excerpt.title}
                  {excerpt.startMs !== null
                    ? ` · ${formatDuration(excerpt.startMs)}`
                    : excerpt.pageNumber !== null
                      ? ` · p. ${excerpt.pageNumber}`
                      : ""}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function DataPointPicker({
  themeId,
  onClose,
  onAttached,
}: {
  themeId: string;
  onClose: () => void;
  onAttached: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AttachableDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [attachingId, setAttachingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const dataPoints = await listAttachableDataPoints(themeId, query);
      if (!cancelled) {
        setResults(dataPoints);
        setIsLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [themeId, query]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setIsLoading(true);
  }

  async function handleAttach(dataPointId: string) {
    setAttachingId(dataPointId);
    await attachDataPointToTheme(themeId, dataPointId);
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
          <p className="text-sm font-semibold text-ink-900">Add a data point</p>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-ink-400 hover:text-ink-700"
          >
            Close
          </button>
        </div>
        <Input
          autoFocus
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Search every project's data points…"
          className="mb-3"
        />
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <p className="py-4 text-center text-xs text-ink-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-400">
              Nothing matches. Every matching data point may already be in this theme.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {results.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink-900">{candidate.summary}</p>
                    <p className="truncate text-xs text-ink-500">{candidate.projectTitle}</p>
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
