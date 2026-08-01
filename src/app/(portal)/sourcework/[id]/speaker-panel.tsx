"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSyncedState } from "@/lib/use-synced-state";
import { findFirstSegmentIndexForSpeaker } from "@/lib/transcription/transcript";
import { formatDuration } from "@/lib/transcription/media";
import { renameSpeaker } from "./actions";
import type { TranscriptSegment, TranscriptSpeaker } from "@/lib/transcription/projects";

/**
 * Name every speaker once, here — every segment's speaker chip picks it up
 * immediately (see docs/transcription-workspace-design.md workflow B). An
 * unnamed-speaker count is a gentle nudge, never a gate.
 */
export function SpeakerPanel({
  projectId,
  speakers,
  segments,
  onSeek,
  onRenamed,
}: {
  projectId: string;
  speakers: TranscriptSpeaker[];
  segments: TranscriptSegment[];
  onSeek: (startMs: number) => void;
  onRenamed: (speakerId: string, displayName: string) => void;
}) {
  if (speakers.length === 0) return null;

  const unnamedCount = speakers.filter((s) => !s.displayName?.trim()).length;

  return (
    <div className="rounded border border-line bg-panel-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-500">Speakers</h2>
        {unnamedCount > 0 && (
          <span className="text-xs text-ink-400">
            {unnamedCount} unnamed speaker{unnamedCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {speakers.map((speaker) => {
          const snippetIndex = findFirstSegmentIndexForSpeaker(segments, speaker.id);
          const snippet = snippetIndex >= 0 ? segments[snippetIndex] : null;
          return (
            <SpeakerRow
              key={speaker.id}
              projectId={projectId}
              speaker={speaker}
              snippet={snippet ?? null}
              onSeek={onSeek}
              onRenamed={onRenamed}
            />
          );
        })}
      </div>
    </div>
  );
}

function SpeakerRow({
  projectId,
  speaker,
  snippet,
  onSeek,
  onRenamed,
}: {
  projectId: string;
  speaker: TranscriptSpeaker;
  snippet: TranscriptSegment | null;
  onSeek: (startMs: number) => void;
  onRenamed: (speakerId: string, displayName: string) => void;
}) {
  // Synced + dirty-tracked for the same reason as SegmentRow: never let a
  // stale local copy decide that the user made an edit.
  const [value, setValue] = useSyncedState(speaker.displayName ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const router = useRouter();

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

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setIsDirty(true);
        }}
        onBlur={handleBlur}
        placeholder={`Speaker ${speaker.diarizationLabel}`}
        className="w-48 rounded border border-line bg-white px-2.5 py-1.5 text-base text-ink-900 placeholder:text-ink-400 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-surface sm:text-sm"
      />
      {snippet && (
        <button
          type="button"
          onClick={() => onSeek(snippet.startMs)}
          className="text-xs font-semibold text-brand-link hover:underline"
        >
          Hear an example ({formatDuration(snippet.startMs)})
        </button>
      )}
      {status === "saving" && <span className="text-xs text-ink-400">Saving…</span>}
      {status === "saved" && <span className="text-xs text-ink-400">Saved</span>}
      {status === "error" && <span className="text-xs text-danger">Couldn&apos;t save</span>}
    </div>
  );
}
