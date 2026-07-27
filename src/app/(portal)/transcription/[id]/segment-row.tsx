"use client";

import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useSyncedState } from "@/lib/use-synced-state";
import { formatDuration } from "@/lib/transcription/media";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";
import type { TimedToken } from "@/lib/transcription/selection";
import {
  mergeSegmentWithNext,
  reassignSegmentSpeaker,
  splitSegment,
  updateSegmentText,
} from "./actions";
import type { TranscriptSegment, TranscriptSpeaker } from "@/lib/transcription/projects";

/**
 * One line of the transcript.
 *
 * Reading mode renders the line as ordinary selectable prose, one span per
 * word carrying its (line, word) coordinates — that is what lets a drag
 * across the transcript become a clip range (see lib/transcription/
 * selection.ts). Because a plain click now belongs to text selection,
 * editing lives behind an explicit control rather than "click the text and
 * hope": the row's actions appear on hover/focus, and Edit (or a
 * double-click) is what opens the textarea.
 */
export function SegmentRow({
  projectId,
  segment,
  tokens,
  speakers,
  segmentIndex,
  isActive,
  isLast,
  showSpeaker,
  onSeek,
}: {
  projectId: string;
  segment: TranscriptSegment;
  tokens: TimedToken[];
  speakers: TranscriptSpeaker[];
  segmentIndex: number;
  isActive: boolean;
  isLast: boolean;
  showSpeaker: boolean;
  onSeek: (startMs: number) => void;
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
  const [caret, setCaret] = useState(0);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  const speaker = speakers.find((candidate) => candidate.id === segment.speakerId);
  const canSplit = caret > 0 && caret < text.trim().length;

  function beginEditing() {
    setActionError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setText(segment.text);
    setIsDirty(false);
    setIsEditing(false);
    setActionError(null);
  }

  /**
   * Saves only when the user actually typed. The old check — "does my copy
   * differ from the prop?" — treated a stale render as an edit, which is
   * precisely how a completed split got written back to its pre-split text.
   */
  async function saveText(): Promise<boolean> {
    if (!isDirty) return true;
    setStatus("saving");
    const result = await updateSegmentText({ projectId, segmentId: segment.id, text });
    if (result.error) {
      setStatus("idle");
      setActionError(result.error);
      return false;
    }
    setIsDirty(false);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
    return true;
  }

  async function handleSave() {
    if (!(await saveText())) return;
    setIsEditing(false);
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
    setActionError(null);
    if (!(await saveText())) return;

    const result = await splitSegment({ projectId, segmentId: segment.id, splitAtChar: caret });
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
        "group border-l-2 px-4 py-2 transition-colors",
        isActive ? "border-brand-primary bg-brand-surface/50" : "border-transparent",
      )}
    >
      {showSpeaker && (
        <p className="mb-1 mt-2 text-xs font-bold uppercase tracking-wide text-ink-700 first:mt-0">
          {speaker
            ? speakerDisplayLabel(speaker.diarizationLabel, speaker.displayName)
            : "Unknown speaker"}
        </p>
      )}

      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onSeek(segment.startMs)}
          title="Play from here"
          className="mt-0.5 w-11 shrink-0 text-left font-mono text-[11px] text-ink-400 hover:text-brand-link hover:underline"
        >
          {formatDuration(segment.startMs)}
        </button>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setIsDirty(true);
                  setCaret(e.target.selectionStart);
                }}
                onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") cancelEditing();
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleSave();
                }}
                autoFocus
                rows={3}
                className="w-full rounded border border-brand-primary px-2 py-1.5 text-sm leading-relaxed text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-surface"
              />

              {canSplit && <SplitPreview text={text} caret={caret} />}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSave}
                  className="rounded bg-brand-primary px-2.5 py-1 text-xs font-bold text-white hover:bg-[#2278B8]"
                >
                  Save
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={cancelEditing}
                  className="rounded border border-line px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-panel-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSplit}
                  disabled={!canSplit}
                  title={
                    canSplit
                      ? "Split this line at the cursor"
                      : "Put the cursor inside the text to split there"
                  }
                  className="text-xs font-semibold text-brand-link hover:underline disabled:text-ink-400 disabled:no-underline"
                >
                  Split here
                </button>
                <span className="text-[11px] text-ink-400">⌘↵ to save · Esc to cancel</span>
              </div>
            </div>
          ) : (
            <p
              data-segment-index={segmentIndex}
              onDoubleClick={beginEditing}
              className="text-sm leading-relaxed text-ink-900"
            >
              {/* Spaces sit between the spans, not inside them, so selecting
                  whitespace alone never counts as touching a word. */}
              {tokens.map((token, tokenIndex) => (
                <Fragment key={tokenIndex}>
                  {tokenIndex > 0 ? " " : ""}
                  <span data-token-index={tokenIndex}>{token.text}</span>
                </Fragment>
              ))}
            </p>
          )}
        </div>

        {!isEditing && (
          <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {status === "saving" && <span className="text-[11px] text-ink-400">Saving…</span>}
            {status === "saved" && <span className="text-[11px] text-ink-400">Saved</span>}
            <select
              value={speakerId}
              onChange={handleSpeakerChange}
              aria-label="Who is speaking on this line"
              title="Reassign this line to another speaker"
              className="max-w-[9rem] rounded border border-line bg-white px-1 py-0.5 text-[11px] text-ink-700 focus:border-brand-primary focus:outline-none"
            >
              <option value="">Unknown speaker</option>
              {speakers.map((option) => (
                <option key={option.id} value={option.id}>
                  {speakerDisplayLabel(option.diarizationLabel, option.displayName)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={beginEditing}
              className="text-[11px] font-semibold text-brand-link hover:underline"
            >
              Edit
            </button>
            {!isLast && (
              <button
                type="button"
                onClick={handleMerge}
                title="Join this line with the one below"
                className="text-[11px] font-semibold text-brand-link hover:underline"
              >
                Merge ↓
              </button>
            )}
          </div>
        )}
      </div>

      {actionError && <p className="mt-1.5 pl-14 text-xs text-danger">{actionError}</p>}
    </div>
  );
}

/**
 * Shows where "Split here" will actually cut. The caret is invisible once
 * you move the mouse to the button, so without this the split is a guess.
 */
function SplitPreview({ text, caret }: { text: string; caret: number }) {
  const first = text.slice(0, caret).trim();
  const second = text.slice(caret).trim();

  return (
    <div className="mt-1.5 rounded border border-dashed border-line bg-panel-50 px-2 py-1.5 text-[11px] leading-relaxed text-ink-500">
      <p className="truncate">
        <span className="font-semibold text-ink-700">1.</span> {first}
      </p>
      <p className="truncate">
        <span className="font-semibold text-ink-700">2.</span> {second}
      </p>
    </div>
  );
}
