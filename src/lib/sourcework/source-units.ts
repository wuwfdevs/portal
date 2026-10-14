import "server-only";
import { getSourceDetail, getTranscriptForRepresentation } from "@/lib/transcription/projects";
import { getDocumentContentForRepresentation } from "@/lib/transcription/document-content";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";
import { formatDuration } from "@/lib/transcription/media";
import { SOURCE_KIND_LABEL } from "@/lib/transcription/status";
import {
  buildDocumentUnits,
  buildTranscriptUnits,
  type ExtractionGroup,
  type ExtractionUnit,
} from "./extraction-units";

// Reading a source into numbered units: its transcript's sentences or its
// document's blocks. What Analyze (and the passage tools) show the model.

export interface ReadSource {
  sourceId: string;
  sourceTitle: string;
  sourceKindLabel: string;
  representationId: string;
  units: ExtractionUnit[];
  groups: ExtractionGroup[];
  /** The speaker row at each transcript unit, for attributing a data point. */
  speakerByUnit: Map<number, string | null>;
  /** Display names of the people on the recording, for keeping them out of searches. */
  speakerNames: string[];
  /** Speakers a person marked as the interviewer; Analyze skips what they say. */
  interviewerSpeakerIds: Set<string>;
}

export type ReadSourceResult = { ok: true; source: ReadSource } | { ok: false; error: string };

/** A source as numbered units: its transcript's sentences or its document's blocks. */
export async function readSourceUnits(
  projectId: string,
  sourceId: string,
): Promise<ReadSourceResult> {
  const detail = await getSourceDetail(sourceId);
  if (!detail || !detail.projects.some((project) => project.id === projectId)) {
    return { ok: false, error: "That source isn't part of this project." };
  }
  const representation = detail.transcript;
  if (detail.status !== "ready" || !representation || representation.status !== "ready") {
    return {
      ok: false,
      error:
        detail.kind === "document"
          ? "This document's text isn't ready yet. Analysis can start when it is."
          : "This recording hasn't finished transcribing. Analysis can start when it does.",
    };
  }

  if (detail.kind === "document") {
    const content = await getDocumentContentForRepresentation(representation.id);
    const { units, groups } = buildDocumentUnits(
      content.blocks.map((block) => ({
        id: block.id,
        pageNumber: block.pageNumber,
        blockType: block.blockType,
        text: block.text,
      })),
    );
    if (units.length === 0) return { ok: false, error: "This document has no text to read." };
    return {
      ok: true,
      source: {
        sourceId,
        sourceTitle: detail.title,
        sourceKindLabel: SOURCE_KIND_LABEL[detail.kind],
        representationId: representation.id,
        units,
        groups,
        speakerByUnit: new Map(),
        speakerNames: [],
        interviewerSpeakerIds: new Set(),
      },
    };
  }

  const transcript = await getTranscriptForRepresentation(representation.id);
  const speakerById = new Map(transcript.speakers.map((speaker) => [speaker.id, speaker]));
  const { units, groups } = buildTranscriptUnits(
    transcript.segments.map((segment) => {
      const speaker = segment.speakerId ? speakerById.get(segment.speakerId) : undefined;
      return {
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
        words: segment.words,
        speakerLabel: speaker
          ? speakerDisplayLabel(speaker.diarizationLabel, speaker.displayName) +
            (speaker.role === "interviewer" ? " (interviewer)" : "")
          : "Unknown speaker",
      };
    }),
    formatDuration,
  );
  if (units.length === 0)
    return { ok: false, error: "This recording's transcript has no speech to read." };

  const speakerByUnit = new Map<number, string | null>();
  for (const unit of units) {
    speakerByUnit.set(unit.id, transcript.segments[unit.segmentIndex ?? -1]?.speakerId ?? null);
  }
  return {
    ok: true,
    source: {
      sourceId,
      sourceTitle: detail.title,
      sourceKindLabel: SOURCE_KIND_LABEL[detail.kind],
      representationId: representation.id,
      units,
      groups,
      speakerByUnit,
      speakerNames: transcript.speakers
        .map((speaker) => speaker.displayName?.trim() ?? "")
        .filter((name) => name !== ""),
      interviewerSpeakerIds: new Set(
        transcript.speakers.filter((speaker) => speaker.role === "interviewer").map((s) => s.id),
      ),
    },
  };
}
