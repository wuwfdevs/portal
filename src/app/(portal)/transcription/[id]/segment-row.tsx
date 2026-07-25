"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
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
  segment,
  speakers,
  isActive,
  isLast,
  isSelected,
  isInSelectionRange,
  onSeek,
  onToggleSelect,
}: {
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
  const [text, setText] = useState(segment.text);
  const [speakerId, setSpeakerId] = useState(segment.speakerId ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  /** Saves an in-progress edit if there is one — called before split/merge so neither silently drops unsaved text. */
  async function saveTextIfChanged(): Promise<boolean> {
    if (text.trim() === segment.text.trim()) return true;
    const result = await updateSegmentText({ segmentId: segment.id, text });
    if (result.error) {
      setActionError(result.error);
      return false;
    }
    return true;
  }

  async function handleTextBlur() {
    setIsEditing(false);
    if (text.trim() === segment.text.trim()) return;
    setStatus("saving");
    const result = await updateSegmentText({ segmentId: segment.id, text });
    if (result.error) {
      setStatus("error");
      setActionError(result.error);
      setText(segment.text);
      return;
    }
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
  }

  async function handleSpeakerChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextValue = event.target.value;
    setSpeakerId(nextValue);
    await reassignSegmentSpeaker({ segmentId: segment.id, speakerId: nextValue || null });
  }

  async function handleSplit() {
    const cursor = textareaRef.current?.selectionStart ?? 0;
    setActionError(null);
    if (!(await saveTextIfChanged())) return;

    const result = await splitSegment({ segmentId: segment.id, splitAtChar: cursor });
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setIsEditing(false);
    router.refresh();
  }

  async function handleMerge() {
    setActionError(null);
    if (!(await saveTextIfChanged())) return;

    const result = await mergeSegmentWithNext({ segmentId: segment.id });
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
            onChange={(e) => setText(e.target.value)}
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
