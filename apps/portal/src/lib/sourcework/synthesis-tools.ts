import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { countWords } from "@/lib/text";
import { searchArchive } from "@/lib/transcription/search";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";
import { formatDuration } from "@/lib/transcription/media";
import type { LoopTool } from "./tool-loop";
import type { PassageLedger } from "./passage-ledger";
import type { AcceptedFinding } from "./synthesis-queries";

// The two lookups the synthesis model may use to check a finding against the tape (docs/sourcework-
// analysis-design.md §21). They are read-only and go through the caller's session. Everything they
// show is registered in the run's PassageLedger, so a narrative note can cite a place only by a ref
// a tool gave out, and its time comes from here, never from the model.

const SEARCH_LIMIT = 8;
/** Read this far either side of a finding or a passage. */
const AROUND_MS = 60_000;
const MAX_LINES = 40;
const MAX_WORDS = 600;

export interface SynthesisToolContext {
  projectId: string;
  /** The findings as numbered for this run: number n is index n - 1. */
  findings: readonly AcceptedFinding[];
  sourceTitleById: ReadonlyMap<string, string>;
  ledger: PassageLedger;
}

export function buildSynthesisTools(context: SynthesisToolContext): LoopTool[] {
  const { projectId, findings, sourceTitleById, ledger } = context;

  const search: LoopTool = {
    name: "search_transcripts",
    description:
      "Search this project's transcripts and documents by words or meaning. Returns where each hit is, with a short snippet and a ref you can pass to read_around or cite in a narrative note.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: { query: { type: "string" } },
    },
    async run(args) {
      const query =
        typeof (args as { query?: unknown })?.query === "string"
          ? (args as { query: string }).query.trim()
          : "";
      if (query === "") throw new Error("Give a query.");
      const hits = await searchArchive(query.slice(0, 200), { projectId, limit: SEARCH_LIMIT });
      return {
        hits: hits
          .filter((hit) => hit.kind !== "project" && hit.sourceId)
          .map((hit) => ({
            ref: ledger.add({
              sourceId: hit.sourceId!,
              startMs: hit.startMs,
              endMs: hit.endMs,
              page: hit.pageNumber,
            }),
            source: sourceTitleById.get(hit.sourceId!) ?? hit.projectTitle,
            at: hit.startMs != null ? formatDuration(hit.startMs) : null,
            page: hit.pageNumber,
            speaker: hit.speakerLabel,
            snippet: hit.snippet,
          })),
      };
    },
  };

  const readAround: LoopTool = {
    name: "read_around",
    description:
      "Read the transcript for about a minute either side of a finding (by its number) or of a place a search returned (by its ref). Give exactly one of the two. Each line comes with a ref you can cite in a narrative note.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["finding_number", "ref"],
      properties: {
        finding_number: { type: ["integer", "null"] },
        ref: { type: ["integer", "null"] },
      },
    },
    async run(args) {
      const input = (args ?? {}) as { finding_number?: unknown; ref?: unknown };
      let sourceId: string;
      let startMs: number;
      let endMs: number;
      if (typeof input.finding_number === "number") {
        const finding = findings[input.finding_number - 1];
        if (!finding) throw new Error(`There is no finding ${input.finding_number}.`);
        if (finding.startMs === null) {
          throw new Error("That finding is from a document, not a recording.");
        }
        sourceId = finding.sourceId;
        startMs = finding.startMs;
        endMs = finding.endMs ?? finding.startMs;
      } else if (typeof input.ref === "number") {
        const place = ledger.get(input.ref);
        if (!place) throw new Error(`There is no ref ${input.ref}.`);
        if (place.startMs === null)
          throw new Error("That place is in a document, not a recording.");
        sourceId = place.sourceId;
        startMs = place.startMs;
        endMs = place.endMs ?? place.startMs;
      } else {
        throw new Error("Give a finding_number or a ref.");
      }

      const supabase = await createClient();
      const representation = unwrapRead(
        await supabase
          .from("sw_representations")
          .select("id")
          .eq("source_id", sourceId)
          .eq("kind", "transcript")
          .eq("status", "ready")
          .maybeSingle(),
        "this recording's transcript",
      );
      if (!representation) throw new Error("That recording has no finished transcript.");

      const [segments, speakers] = await Promise.all([
        supabase
          .from("tw_segments")
          .select("start_ms, end_ms, speaker_id, text")
          .eq("representation_id", representation.id)
          .gt("end_ms", Math.max(0, startMs - AROUND_MS))
          .lt("start_ms", endMs + AROUND_MS)
          .order("position")
          .limit(MAX_LINES)
          .then((result) => unwrapRead(result, "this transcript") ?? []),
        supabase
          .from("tw_speakers")
          .select("id, diarization_label, display_name, role")
          .eq("representation_id", representation.id)
          .then((result) => unwrapRead(result, "this recording's speakers") ?? []),
      ]);
      const speakerById = new Map(
        speakers.map((speaker) => [
          speaker.id,
          speakerDisplayLabel(speaker.diarization_label, speaker.display_name) +
            (speaker.role === "interviewer" ? " (interviewer)" : ""),
        ]),
      );

      let words = 0;
      const lines: { ref: number; at: string; speaker: string | null; text: string }[] = [];
      for (const segment of segments) {
        words += countWords(segment.text);
        if (words > MAX_WORDS && lines.length > 0) break;
        lines.push({
          ref: ledger.add({
            sourceId,
            startMs: segment.start_ms,
            endMs: segment.end_ms,
            page: null,
          }),
          at: formatDuration(segment.start_ms),
          speaker: segment.speaker_id ? (speakerById.get(segment.speaker_id) ?? null) : null,
          text: segment.text,
        });
      }
      return { source: sourceTitleById.get(sourceId) ?? "Source", lines };
    },
  };

  return [search, readAround];
}
