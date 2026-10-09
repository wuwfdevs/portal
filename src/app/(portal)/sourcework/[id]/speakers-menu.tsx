"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { CheckboxField, Input, Select } from "@/components/ui/input";
import { useSyncedState } from "@/lib/use-synced-state";
import { formatDuration } from "@/lib/transcription/media";
import { filterSpeakerRows, speakerRows, speakerSummary } from "@/lib/transcription/speakers";
import type { TranscriptSegment, TranscriptSpeaker } from "@/lib/transcription/projects";
import { mergeSpeakers, renameSpeaker } from "./actions";

/** Past this many speakers the panel offers a filter; below it a filter is clutter. */
const FILTER_THRESHOLD = 6;

/**
 * Who is speaking, as one toolbar button instead of a permanent panel (or a
 * chip per person): "Speakers (14) · Mayor Reeves, R. Alvarez, +6 more, 6
 * unnamed". It opens a panel that sorts by talk time, filters once there are
 * enough speakers to need it, and scrolls on its own, so a town-hall
 * recording with a dozen diarized voices is as manageable as an interview
 * with two. Each row renames in place, plays an example, and can be merged
 * into another speaker to fold back a voice the diarizer split.
 */
export function SpeakersMenu({
  projectId,
  speakers,
  segments,
  onSeek,
  onRenamed,
}: {
  projectId: string | null;
  speakers: TranscriptSpeaker[];
  segments: TranscriptSegment[];
  onSeek: (startMs: number) => void;
  onRenamed: (speakerId: string, displayName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [unnamedOnly, setUnnamedOnly] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => speakerRows(segments, speakers), [segments, speakers]);
  const summary = useMemo(() => speakerSummary(rows), [rows]);
  const visible = useMemo(
    () => filterSpeakerRows(rows, { query, unnamedOnly }),
    [rows, query, unnamedOnly],
  );

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (speakers.length === 0) return null;

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="secondary"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="max-w-full max-lg:hidden"
      >
        <span className="truncate">
          Speakers ({summary.count}){summary.text && ` · ${summary.text}`}
        </span>
        <span aria-hidden="true" className="ml-1.5 text-[10px]">
          ▾
        </span>
      </Button>
      <FloatingPanel
        anchorRef={buttonRef}
        open={open}
        align="start"
        ref={panelRef}
        role="dialog"
        className="w-[34rem] max-w-[calc(100vw-1rem)] rounded border border-line bg-white shadow-lg"
      >
        <SpeakersPanelBody
          projectId={projectId}
          rows={rows}
          summary={summary}
          visible={visible}
          query={query}
          onQuery={setQuery}
          unnamedOnly={unnamedOnly}
          onUnnamedOnly={setUnnamedOnly}
          onSeek={onSeek}
          onRenamed={onRenamed}
        />
      </FloatingPanel>
    </>
  );
}

/**
 * The speakers list as a tab of its own. Below lg the popover above is hidden
 * (a floating panel is a poor fit for a phone) and this renders the same rows
 * inline instead — the same rename, example and merge, one source of truth.
 */
export function SpeakersPane({
  projectId,
  speakers,
  segments,
  onSeek,
  onRenamed,
}: {
  projectId: string | null;
  speakers: TranscriptSpeaker[];
  segments: TranscriptSegment[];
  onSeek: (startMs: number) => void;
  onRenamed: (speakerId: string, displayName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [unnamedOnly, setUnnamedOnly] = useState(false);
  const rows = useMemo(() => speakerRows(segments, speakers), [segments, speakers]);
  const summary = useMemo(() => speakerSummary(rows), [rows]);
  const visible = useMemo(
    () => filterSpeakerRows(rows, { query, unnamedOnly }),
    [rows, query, unnamedOnly],
  );

  if (speakers.length === 0) {
    return <p className="text-sm text-ink-500">No speakers were identified in this recording.</p>;
  }

  return (
    <div className="rounded border border-line bg-white">
      <SpeakersPanelBody
        projectId={projectId}
        rows={rows}
        summary={summary}
        visible={visible}
        query={query}
        onQuery={setQuery}
        unnamedOnly={unnamedOnly}
        onUnnamedOnly={setUnnamedOnly}
        onSeek={onSeek}
        onRenamed={onRenamed}
        scrollable={false}
      />
    </div>
  );
}

function SpeakersPanelBody({
  projectId,
  rows,
  summary,
  visible,
  query,
  onQuery,
  unnamedOnly,
  onUnnamedOnly,
  onSeek,
  onRenamed,
  scrollable = true,
}: {
  projectId: string | null;
  rows: ReturnType<typeof speakerRows>;
  summary: ReturnType<typeof speakerSummary>;
  visible: ReturnType<typeof speakerRows>;
  query: string;
  onQuery: (value: string) => void;
  unnamedOnly: boolean;
  onUnnamedOnly: (value: boolean) => void;
  onSeek: (startMs: number) => void;
  onRenamed: (speakerId: string, displayName: string) => void;
  /** The popover caps its height and scrolls; the tab is part of the page and does not. */
  scrollable?: boolean;
}) {
  return (
    <>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <strong className="text-sm text-ink-900">Speakers ({summary.count})</strong>
          {summary.unnamed > 0 && (
            <span className="text-xs text-ink-500">{summary.unnamed} unnamed</span>
          )}
        </div>
        {rows.length > FILTER_THRESHOLD && (
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="search"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Find a speaker"
              aria-label="Find a speaker"
              className="min-w-0 flex-1 px-2.5 py-1.5"
            />
            <CheckboxField
              label="Unnamed only"
              checked={unnamedOnly}
              onChange={(event) => onUnnamedOnly(event.target.checked)}
            />
          </div>
        )}
      </div>
      <ul className={cn("border-t border-line", scrollable && "max-h-80 overflow-y-auto")}>
        {visible.length === 0 ? (
          <li className="px-3 py-4 text-sm text-ink-500">No speaker matches.</li>
        ) : (
          visible.map((row) => (
            <SpeakerEditRow
              key={row.speaker.id}
              projectId={projectId}
              row={row}
              others={rows.filter((other) => other.speaker.id !== row.speaker.id)}
              onSeek={onSeek}
              onRenamed={onRenamed}
            />
          ))
        )}
      </ul>
    </>
  );
}

function SpeakerEditRow({
  projectId,
  row,
  others,
  onSeek,
  onRenamed,
}: {
  projectId: string | null;
  row: ReturnType<typeof speakerRows>[number];
  others: ReturnType<typeof speakerRows>;
  onSeek: (startMs: number) => void;
  onRenamed: (speakerId: string, displayName: string) => void;
}) {
  const router = useRouter();
  const { speaker } = row;
  // Synced + dirty-tracked, as SegmentRow's text is: never let a stale local
  // copy decide the user made an edit.
  const [value, setValue] = useSyncedState(speaker.displayName ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [merging, setMerging] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergePending, setMergePending] = useState(false);

  async function handleBlur() {
    if (!isDirty) return;
    setStatus("saving");
    const result = await renameSpeaker({ projectId, speakerId: speaker.id, displayName: value });
    if (result.error) {
      setStatus("error");
      return;
    }
    setIsDirty(false);
    onRenamed(speaker.id, value.trim());
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
    router.refresh();
  }

  async function handleMerge() {
    if (!mergeTarget) return;
    setMergePending(true);
    setMergeError(null);
    const result = await mergeSpeakers({
      projectId,
      fromSpeakerId: speaker.id,
      intoSpeakerId: mergeTarget,
    });
    setMergePending(false);
    if (result.error) {
      setMergeError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-2 border-b border-line px-3 py-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setIsDirty(true);
          }}
          onBlur={handleBlur}
          placeholder={`Speaker ${speaker.diarizationLabel}`}
          aria-label={`Name for ${row.label}`}
          className="w-full px-2.5 py-1.5 sm:w-44"
        />
        <span className="font-mono text-[11px] text-ink-500">
          {row.lines === 0
            ? "no lines"
            : `${formatDuration(row.talkMs)} · ${Math.round(row.share * 100)}%`}
        </span>
        {row.firstStartMs !== null && (
          <Button
            type="button"
            variant="link"
            onClick={() => onSeek(row.firstStartMs!)}
            className="text-brand-link max-lg:min-h-11"
          >
            Hear an example
          </Button>
        )}
        {others.length > 0 && (
          <Button
            type="button"
            variant="link"
            onClick={() => setMerging((current) => !current)}
            className="text-brand-link max-lg:min-h-11"
          >
            Merge…
          </Button>
        )}
        <span className="text-xs text-ink-400" aria-live="polite">
          {status === "saving" && "Saving…"}
          {status === "saved" && "Saved"}
          {status === "error" && <span className="text-danger">Couldn’t save</span>}
        </span>
      </div>
      {merging && (
        <div className="flex flex-wrap items-center gap-2 rounded bg-panel-50 p-2">
          <span className="text-xs text-ink-700">Move all of {row.label}’s lines to</span>
          <Select
            compact
            value={mergeTarget}
            onChange={(event) => setMergeTarget(event.target.value)}
            aria-label={`Merge ${row.label} into`}
            className="max-w-[14rem]"
          >
            <option value="">Choose a speaker</option>
            {others.map((other) => (
              <option key={other.speaker.id} value={other.speaker.id}>
                {other.label}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={!mergeTarget || mergePending}
            onClick={handleMerge}
          >
            {mergePending ? "Merging…" : "Merge"}
          </Button>
          {mergeError && <span className="text-xs text-danger">{mergeError}</span>}
        </div>
      )}
    </li>
  );
}
