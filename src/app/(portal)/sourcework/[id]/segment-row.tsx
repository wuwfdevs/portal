"use client";

import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { useSyncedState } from "@/lib/use-synced-state";
import { formatDuration } from "@/lib/transcription/media";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";
import { clipAtToken, type ClipSpan, type TimedToken } from "@/lib/transcription/selection";
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
 *
 * Words already belonging to a clip carry an underline, and the one clip
 * that's active carries a tint as well — see markClass() for why those are
 * two different channels rather than two shades of one.
 */
export function SegmentRow({
  projectId,
  segment,
  tokens,
  clipSpans,
  selectedClipId,
  hoveredClipId,
  speakers,
  segmentIndex,
  found,
  isActive,
  isLast,
  showSpeaker,
  isEditing,
  onStartEditing,
  onStopEditing,
  onSeek,
  onSelectClip,
  onMakeExcerpt,
}: {
  projectId: string;
  segment: TranscriptSegment;
  tokens: TimedToken[];
  /** Which runs of this line's words belong to clips — precomputed once by the workspace. */
  clipSpans: ClipSpan[];
  selectedClipId: string | null;
  hoveredClipId: string | null;
  speakers: TranscriptSpeaker[];
  segmentIndex: number;
  /** Words to highlight for "Find in this transcript": every match, and the one being looked at. */
  found?: { tokens: Set<number>; currentTokens: Set<number> };
  isActive: boolean;
  isLast: boolean;
  showSpeaker: boolean;
  /** Which line is open for editing is owned by the workspace, so only one ever is and `E` can open the active one. */
  isEditing: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onSeek: (startMs: number) => void;
  /** A plain click on a word: null where nothing is clipped, which clears the selection. */
  onSelectClip: (clipId: string | null) => void;
  /** Turns the whole line into the pending excerpt — the way to make one on a phone without precise text selection. */
  onMakeExcerpt: () => void;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Synced, not plain useState: a split/merge changes this row's server text
  // while React keeps the same instance (same list key), and a stale local
  // copy here is what silently overwrote a real split in production.
  const [text, setText] = useSyncedState(segment.text);
  const [speakerId, setSpeakerId] = useSyncedState(segment.speakerId ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [caret, setCaret] = useState(0);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [changingSpeaker, setChangingSpeaker] = useState(false);

  const speaker = speakers.find((candidate) => candidate.id === segment.speakerId);
  const canSplit = caret > 0 && caret < text.trim().length;

  /** How strongly one word is marked: the strongest state any clip over it asks for. */
  function tokenMark(tokenIndex: number): Mark {
    let mark: Mark = "none";
    for (const span of clipSpans) {
      if (tokenIndex < span.fromTokenIndex || tokenIndex > span.toTokenIndex) continue;
      if (span.clipId === selectedClipId) return "selected";
      if (span.clipId === hoveredClipId) mark = "hovered";
      else if (mark === "none") mark = "clipped";
    }
    return mark;
  }

  /**
   * The space before a word takes the *weaker* of its neighbours, so a mark
   * runs unbroken through a clip but stops at its edge instead of spilling
   * onto the whitespace beyond it.
   */
  function gapMark(tokenIndex: number): Mark {
    const before = tokenMark(tokenIndex - 1);
    const after = tokenMark(tokenIndex);
    return MARK_ORDER.indexOf(before) < MARK_ORDER.indexOf(after) ? before : after;
  }

  /**
   * A plain click on a clipped word opens that clip in the rail. Safe to hang
   * off the text because the click that ends a drag leaves a live selection
   * behind, which is the one case this bails on — so making a clip and
   * opening one stay separate gestures on the same words.
   */
  function handleTextClick(event: React.MouseEvent<HTMLParagraphElement>) {
    const tokenEl = (event.target as HTMLElement).closest("[data-token-index]");
    if (!(tokenEl instanceof HTMLElement)) return;
    if (window.getSelection()?.isCollapsed === false) return;
    onSelectClip(clipAtToken(clipSpans, Number(tokenEl.dataset.tokenIndex)));
  }

  function beginEditing() {
    setActionError(null);
    onStartEditing();
  }

  function cancelEditing() {
    setText(segment.text);
    setIsDirty(false);
    onStopEditing();
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
    onStopEditing();
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
    onStopEditing();
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
    onStopEditing();
    router.refresh();
  }

  return (
    <div
      // On the wrapper, not the text, so follow-along can find the active
      // line even while it's being edited. Token spans stay nested inside.
      data-segment-index={segmentIndex}
      className={cn(
        // content-visibility lets the browser skip layout and paint for lines
        // that are scrolled far off, so a two-hour transcript scrolls like a
        // short one. The lines stay in the DOM on purpose: a selection can
        // span lines that are off screen, and find and follow-along scroll
        // to a line by looking it up.
        "group border-l-2 px-4 py-2 transition-colors [contain-intrinsic-size:auto_72px] [content-visibility:auto]",
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
          className="-my-2 w-11 shrink-0 py-2 text-left font-mono text-[11px] text-ink-400 hover:text-brand-link hover:underline max-lg:-my-2.5 max-lg:min-h-11 max-lg:py-3"
        >
          {formatDuration(segment.startMs)}
        </button>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div>
              <Textarea
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
                className="border-brand-primary px-2 py-1.5"
              />

              {canSplit && <SplitPreview text={text} caret={caret} />}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSave}
                  className="max-lg:min-h-11 max-lg:px-4"
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={cancelEditing}
                  className="max-lg:min-h-11 max-lg:px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="link"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSplit}
                  disabled={!canSplit}
                  title={
                    canSplit
                      ? "Split this line at the cursor"
                      : "Put the cursor inside the text to split there"
                  }
                  className="text-brand-link max-lg:min-h-11"
                >
                  Split here
                </Button>
                <span className="text-[11px] text-ink-400 max-lg:hidden">
                  ⌘↵ to save · Esc to cancel
                </span>
              </div>
            </div>
          ) : (
            <p
              onDoubleClick={beginEditing}
              onClick={handleTextClick}
              className="text-sm leading-relaxed text-ink-900"
            >
              {/* Spaces sit between the spans, not inside them, so selecting
                  whitespace alone never counts as touching a word. They do get
                  a span of their own when both neighbours are in the same
                  clip, purely so the mark runs unbroken across the gap —
                  without a data-token-index, so selection still ignores it. */}
              {tokens.map((token, tokenIndex) => (
                <Fragment key={tokenIndex}>
                  {tokenIndex > 0 && <span className={markClass(gapMark(tokenIndex))}> </span>}
                  <span
                    data-token-index={tokenIndex}
                    className={cn(
                      markClass(tokenMark(tokenIndex)),
                      found?.tokens.has(tokenIndex) &&
                        (found.currentTokens.has(tokenIndex)
                          ? "rounded-sm bg-brand-primary/50"
                          : "rounded-sm bg-brand-primary/20"),
                    )}
                  >
                    {token.text}
                  </span>
                </Fragment>
              ))}
            </p>
          )}
        </div>

        {!isEditing && (
          // Always present, not revealed on hover: hover doesn't exist on
          // touch, so the old hover-only row left a phone or tablet with no
          // way to edit, merge or reassign a line. A quiet "⋮" costs one
          // small icon per line instead of a toolbar.
          <div className="flex shrink-0 items-center gap-2">
            {status === "saving" && <span className="text-[11px] text-ink-400">Saving…</span>}
            {status === "saved" && <span className="text-[11px] text-ink-400">Saved</span>}
            <ActionMenu
              label="Line actions"
              trigger="quiet"
              sheetHeading={
                <>
                  <span className="font-mono text-xs text-ink-500">
                    {formatDuration(segment.startMs)} ·{" "}
                    {speaker
                      ? speakerDisplayLabel(speaker.diarizationLabel, speaker.displayName)
                      : "Unknown speaker"}
                  </span>
                  <span className="mt-0.5 block truncate">{text}</span>
                </>
              }
              items={[
                { label: "Edit text", onClick: beginEditing },
                { label: "Make an excerpt from this line", onClick: onMakeExcerpt },
                { label: "Change speaker…", onClick: () => setChangingSpeaker(true) },
                ...(isLast
                  ? []
                  : [{ label: "Merge with the next line", onClick: () => void handleMerge() }]),
              ]}
            />
          </div>
        )}
      </div>

      {changingSpeaker && !isEditing && (
        <div className="mt-1.5 flex items-center gap-2 pl-14">
          <Select
            compact
            autoFocus
            value={speakerId}
            onChange={async (event) => {
              await handleSpeakerChange(event);
              setChangingSpeaker(false);
            }}
            onBlur={() => setChangingSpeaker(false)}
            aria-label="Who is speaking on this line"
            className="max-w-[16rem]"
          >
            <option value="">Unknown speaker</option>
            {speakers.map((option) => (
              <option key={option.id} value={option.id}>
                {speakerDisplayLabel(option.diarizationLabel, option.displayName)}
              </option>
            ))}
          </Select>
        </div>
      )}

      {actionError && <p className="mt-1.5 pl-14 text-xs text-danger">{actionError}</p>}
    </div>
  );
}

/** Weakest to strongest, which is also the order the states override each other. */
const MARK_ORDER = ["none", "clipped", "hovered", "selected"] as const;

type Mark = (typeof MARK_ORDER)[number];

/**
 * Two channels, not two shades. "This is clipped" is an underline, because
 * it's ambient — it's on for every clipped word at once, it has to survive
 * clips overlapping (one underline whether one clip covers a word or three),
 * and being a non-colour channel it doesn't rely on hue to be legible. The
 * tint is spent on the single clip that's active, which is the state a
 * background can afford to be loud about.
 */
function markClass(mark: Mark): string {
  switch (mark) {
    case "selected":
      return "cursor-pointer border-b-2 border-clipped-line bg-clipped-selected";
    case "hovered":
      return "cursor-pointer border-b-2 border-clipped-line bg-clipped-hover";
    case "clipped":
      return "cursor-pointer border-b-2 border-clipped-line/60";
    case "none":
      return "";
  }
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
