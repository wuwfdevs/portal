import { speakerDisplayLabel } from "@/lib/transcription/transcript";

interface SpeakerLike {
  id: string;
  diarizationLabel: string;
  displayName: string | null;
}

interface SegmentLike {
  speakerId: string | null;
  startMs: number;
  endMs: number;
}

export interface SpeakerRow<S extends SpeakerLike = SpeakerLike> {
  speaker: S;
  label: string;
  named: boolean;
  talkMs: number;
  /** This speaker's share of everything attributed to a speaker, 0 to 1. */
  share: number;
  lines: number;
  /** Where to seek to hear an example, or null if they have no lines. */
  firstStartMs: number | null;
}

/**
 * One row per speaker with how much they said, most talk first. A recording
 * with a dozen diarized voices is mostly two or three people and a scatter of
 * one-line "speakers"; ordering by talk time puts the ones worth naming on
 * top, whatever order the diarizer numbered them in.
 */
export function speakerRows<S extends SpeakerLike>(
  segments: SegmentLike[],
  speakers: S[],
): SpeakerRow<S>[] {
  const stats = new Map<string, { talkMs: number; lines: number; firstStartMs: number }>();
  for (const segment of segments) {
    if (!segment.speakerId) continue;
    const current = stats.get(segment.speakerId);
    const talk = Math.max(0, segment.endMs - segment.startMs);
    if (current) {
      current.talkMs += talk;
      current.lines += 1;
      current.firstStartMs = Math.min(current.firstStartMs, segment.startMs);
    } else {
      stats.set(segment.speakerId, { talkMs: talk, lines: 1, firstStartMs: segment.startMs });
    }
  }
  const total = [...stats.values()].reduce((sum, stat) => sum + stat.talkMs, 0);

  return speakers
    .map((speaker) => {
      const stat = stats.get(speaker.id);
      return {
        speaker,
        label: speakerDisplayLabel(speaker.diarizationLabel, speaker.displayName),
        named: Boolean(speaker.displayName?.trim()),
        talkMs: stat?.talkMs ?? 0,
        share: total > 0 && stat ? stat.talkMs / total : 0,
        lines: stat?.lines ?? 0,
        firstStartMs: stat?.firstStartMs ?? null,
      };
    })
    .sort((a, b) => b.talkMs - a.talkMs || a.label.localeCompare(b.label));
}

export function filterSpeakerRows<S extends SpeakerLike>(
  rows: SpeakerRow<S>[],
  options: { query?: string; unnamedOnly?: boolean },
): SpeakerRow<S>[] {
  const needle = (options.query ?? "").trim().toLowerCase();
  return rows.filter(
    (row) =>
      (!options.unnamedOnly || !row.named) &&
      (needle === "" ||
        row.label.toLowerCase().includes(needle) ||
        row.speaker.diarizationLabel.toLowerCase().includes(needle)),
  );
}

/**
 * The one line the toolbar button shows: the count, then the first few names
 * by talk time, then how many more and how many are still unnamed. However
 * many speakers there are, it stays one short line.
 */
export function speakerSummary(
  rows: SpeakerRow[],
  maxNames = 2,
): { count: number; unnamed: number; text: string } {
  const named = rows.filter((row) => row.named);
  const unnamed = rows.length - named.length;
  const shown = named.slice(0, maxNames).map((row) => row.label);
  const more = named.length - shown.length;
  const parts = [
    ...shown,
    ...(more > 0 ? [`+${more} more`] : []),
    ...(unnamed > 0 ? [`${unnamed} unnamed`] : []),
  ];
  return { count: rows.length, unnamed, text: parts.join(", ") };
}
