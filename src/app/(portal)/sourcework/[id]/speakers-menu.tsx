"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { CheckboxField, Input, Select } from "@/components/ui/input";
import { CONTROL_ROW } from "@/components/ui/control-row";
import { useSyncedState } from "@/lib/use-synced-state";
import { formatDuration } from "@/lib/transcription/media";
import { filterSpeakerRows, speakerRows, speakerSummary } from "@/lib/transcription/speakers";
import type { TranscriptSegment, TranscriptSpeaker } from "@/lib/transcription/projects";
import { createSpeaker, mergeSpeakers, renameSpeaker, setSpeakerRole } from "./actions";
import { useDismissable } from "@/lib/use-dismissable";

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
  representationId,
  speakers,
  segments,
  onSeek,
  onRenamed,
}: {
  projectId: string | null;
  representationId: string | null;
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

  // The panel is portaled, so the button and the panel both count as inside.
  useDismissable({
    open,
    refs: [buttonRef, panelRef],
    onDismiss: (reason) => {
      setOpen(false);
      if (reason === "escape") buttonRef.current?.focus();
    },
  });

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
        <span aria-hidden="true" className="ml-1.5 text-badge">
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
          representationId={representationId}
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
  representationId,
  speakers,
  segments,
  onSeek,
  onRenamed,
}: {
  projectId: string | null;
  representationId: string | null;
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
        representationId={representationId}
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
  representationId,
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
  representationId: string | null;
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
      {representationId && (
        <AddSpeakerForm projectId={projectId} representationId={representationId} />
      )}
    </>
  );
}

/**
 * For a voice the diarizer missed. The new speaker starts with no lines; give
 * them some from a line's "Change speaker…" menu.
 */
function AddSpeakerForm({
  projectId,
  representationId,
}: {
  projectId: string | null;
  representationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setPending(true);
    setError(null);
    const result = await createSpeaker({ projectId, representationId, displayName: name });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setName("");
    setOpen(false);
    router.refresh();
  }

  return (
    <div className={`${CONTROL_ROW} border-t border-line px-3 py-2`}>
      {open ? (
        <>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && name.trim()) void handleAdd();
              if (event.key === "Escape") setOpen(false);
            }}
            placeholder="Speaker’s name"
            aria-label="Name of the new speaker"
            className="w-full px-2.5 py-1.5 sm:w-44"
            data-row="full"
          />
          <Button
            type="button"
            size="sm"
            disabled={!name.trim() || pending}
            onClick={() => void handleAdd()}
          >
            {pending ? "Adding…" : "Add"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </>
      ) : (
        <Button
          touch
          type="button"
          variant="link"
          onClick={() => setOpen(true)}
          className="text-brand-link"
        >
          + Add a speaker
        </Button>
      )}
    </div>
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
  const [interviewer, setInterviewer] = useSyncedState(speaker.role === "interviewer");
  const [roleError, setRoleError] = useState<string | null>(null);

  async function handleInterviewer(next: boolean) {
    setInterviewer(next);
    setRoleError(null);
    const result = await setSpeakerRole({
      projectId,
      speakerId: speaker.id,
      role: next ? "interviewer" : null,
    });
    if (result.error) {
      setInterviewer(!next);
      setRoleError(result.error);
      return;
    }
    router.refresh();
  }

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
        <span className="font-mono text-label text-ink-500">
          {row.lines === 0
            ? "no lines"
            : `${formatDuration(row.talkMs)} · ${Math.round(row.share * 100)}%`}
        </span>
        {row.firstStartMs !== null && (
          <Button
            touch
            type="button"
            variant="link"
            onClick={() => onSeek(row.firstStartMs!)}
            className="text-brand-link"
          >
            Hear an example
          </Button>
        )}
        {others.length > 0 && (
          <Button
            touch
            type="button"
            variant="link"
            onClick={() => setMerging((current) => !current)}
            className="text-brand-link"
          >
            Merge…
          </Button>
        )}
        <label className="flex min-h-11 items-center gap-1.5 text-xs text-ink-700 lg:min-h-0">
          <input
            type="checkbox"
            checked={interviewer}
            onChange={(event) => void handleInterviewer(event.target.checked)}
          />
          Interviewer
        </label>
        {roleError && <span className="text-xs text-danger">{roleError}</span>}
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
