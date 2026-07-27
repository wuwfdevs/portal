"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useSyncedState } from "@/lib/use-synced-state";
import { formatDuration } from "@/lib/transcription/media";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";
import {
  mergeSegmentWithNext,
  reassignSegmentSpeaker,
  splitSegment,
  updateSegmentText,
} from "./actions";
import type { TranscriptSegment, TranscriptSpeaker } from "@/lib/transcription/projects";

export function SegmentRow({
  projectId,
  segment,
  speakers,
  isActive,
  isLast,
  isSelected,
  isInSelectionRange,
  onSeek,
  onToggleSelect,
}: {
  projectId: string;
  segment: TranscriptSegment;
  speakers: TranscriptSpeaker[];
  isActive: boolean;
  isLast: boolean;
  isSelected: boolean;
  isInSelectionRange: boolean;
  onSeek: (startMs: number) => void;
  onToggleSelect: () => void;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  // Synced, not plain useState: a split/merge changes this row's server text
  // while React keeps the same instance (same list key), and a stale local
  // copy here is what silently overwrote a real split in production.
  const [text, setText] = useSyncedState(segment.text);
  const [speakerId, setSpeakerId] = useSyncedState(segment.speakerId ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  function handleTextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    setIsDirty(true);
  }

  /**
   * Saves only when the user actually typed. The old check — "does my copy
   * differ from the prop?" — treated a stale render as an edit, which is
   * precisely how a completed split got written back to its pre-split text.
   */
  async function saveText(): Promise<boolean> {
    if (!isDirty) return true;
    const result = await updateSegmentText({ projectId, segmentId: segment.id, text });
    if (result.error) {
      setActionError(result.error);
      return false;
    }
    setIsDirty(false);
    return true;
  }

  async function handleTextBlur() {
    setIsEditing(false);
    if (!isDirty) return;
    setStatus("saving");
    const result = await updateSegmentText({ projectId, segmentId: segment.id, text });
    if (result.error) {
      setStatus("error");
      setActionError(result.error);
      setText(segment.text);
      setIsDirty(false);
      return;
    }
    setIsDirty(false);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
    router.refresh();
  }

  async function handleSpeakerChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextValue = event.target.value;
    setSpeakerId(nextValue);
    const result = await reassignSegmentSpeaker({
      projectId,
      segmentId: segment.id,
      speakerId: nextValue || null,
    });
    if (result.error) {
      setActionError(result.error);
      setSpeakerId(segment.speakerId ?? "");
      return;
    }
    router.refresh();
  }

  async function handleSplit() {
    const cursor = textareaRef.current?.selectionStart ?? 0;
    setActionError(null);
    if (!(await saveText())) return;

    const result = await splitSegment({ projectId, segmentId: segment.id, splitAtChar: cursor });
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setIsEditing(false);
    router.refresh();
  }

  async function handleMerge() {
    setActionError(null);
    if (!(await saveText())) return;

    const result = await mergeSegmentWithNext({ projectId, segmentId: segment.id });
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setIsEditing(false);
    router.refresh();
  }

  return (
    <div
      className={cn(
        "border-b border-line px-4 py-3 last:border-b-0",
        isActive && "bg-brand-surface",
        !isActive && isInSelectionRange && "bg-panel-50",
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label="Select this line for a clip"
          className="h-3.5 w-3.5 rounded border-line"
        />
        <select
          value={speakerId}
          onChange={handleSpeakerChange}
          className="rounded border border-line bg-white px-1.5 py-1 text-xs font-semibold text-ink-700 focus:border-brand-primary focus:outline-none"
        >
          <option value="">Unknown speaker</option>
          {speakers.map((speaker) => (
            <option key={speaker.id} value={speaker.id}>
              {speakerDisplayLabel(speaker.diarizationLabel, speaker.displayName)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onSeek(segment.startMs)}
          className="font-mono text-[11px] font-normal text-ink-400 hover:text-brand-link hover:underline"
        >
          {formatDuration(segment.startMs)}
        </button>
        {status === "saving" && <span className="text-ink-400">Saving…</span>}
        {status === "saved" && <span className="text-ink-400">Saved</span>}
      </div>

      {isEditing ? (
        <div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            autoFocus
            rows={2}
            className="w-full rounded border border-brand-primary px-2 py-1.5 text-sm text-ink-900 focus:outline-none"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSplit}
              className="font-semibold text-brand-link hover:underline"
            >
              Split at cursor
            </button>
            {!isLast && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleMerge}
                className="font-semibold text-brand-link hover:underline"
              >
                Merge with next
              </button>
            )}
          </div>
        </div>
      ) : (
        <p
          onClick={() => setIsEditing(true)}
          className="cursor-text rounded px-1 py-0.5 text-sm text-ink-900 hover:bg-white"
        >
          {text}
        </p>
      )}

      {actionError && <p className="mt-1.5 text-xs text-danger">{actionError}</p>}
    </div>
  );
}
