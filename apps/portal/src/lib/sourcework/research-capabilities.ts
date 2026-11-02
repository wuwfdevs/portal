// Read-only capabilities that let the assistant (and, in later slices, the model inside a run)
// go back to the material: search a project's transcripts, read a stretch of one, and read the
// findings a reporter has accepted (docs/sourcework-analysis-design.md §20). They write nothing,
// need no confirmation, and everything goes through the caller's session, so RLS is still the
// boundary. Registered in lib/capabilities/registry.ts under the `transcription` tool.
//
// What they return is the source's own words and the reporter's own accepted findings; a caller
// that quotes either quotes what is there, and a clip is still only ever placed by excerpt id.

import "server-only";
import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import { assertToolAccess } from "@/lib/auth/authz";
import { unwrapRead } from "@/lib/read-result";
import { countWords } from "@/lib/text";
import { searchArchive } from "@/lib/transcription/search";
import { sourcePath } from "@/lib/transcription/links";
import { getSourceDetail } from "@/lib/transcription/projects";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";
import { formatDuration } from "@/lib/transcription/media";
import { chunked, listResearchQuestions } from "./research-queries";

const TOOL = "transcription";
const uuid = z.string().uuid();

/** A passage read back is a stretch of conversation, not a whole interview. */
export const MAX_PASSAGE_MS = 5 * 60 * 1000;
export const MAX_PASSAGE_WORDS = 700;
export const SEARCH_RESULT_LIMIT = 12;
export const FINDINGS_LIMIT = 200;

export const searchTranscripts = defineCapability({
  id: "sourcework.project.searchTranscripts",
  label: "search transcripts",
  summary:
    "Search the transcripts and documents of one project's sources, and its saved excerpts, by words or meaning. Returns where each hit is (source, time or page) with a snippet and a link; use readPassage to read more around a hit.",
  input: z.object({
    projectId: uuid,
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler(_ctx, input) {
    await assertToolAccess(TOOL);
    const hits = await searchArchive(input.query, {
      projectId: input.projectId,
      limit: input.limit ?? SEARCH_RESULT_LIMIT,
    });
    return {
      hits: hits
        // A "project" hit is the project's own title or background, not a place in a source.
        .filter((hit) => hit.kind !== "project" && hit.sourceId)
        .map((hit) => ({
          kind: hit.kind,
          sourceId: hit.sourceId,
          startMs: hit.startMs,
          endMs: hit.endMs,
          page: hit.pageNumber,
          speaker: hit.speakerLabel,
          title: hit.title,
          snippet: hit.snippet,
          url: sourcePath(hit.sourceId!, {
            projectId: input.projectId,
            t: hit.startMs,
            page: hit.pageNumber,
          }),
        })),
    };
  },
});

export const readPassage = defineCapability({
  id: "sourcework.source.readPassage",
  label: "read passage",
  summary:
    "Read a stretch of one recording's transcript between two times (milliseconds), line by line with the speaker and time. At most five minutes and about 700 words per call; ask again from where it stopped for more.",
  input: z.object({
    sourceId: uuid,
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(1),
  }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    await assertToolAccess(TOOL);
    if (input.endMs <= input.startMs) throw new Error("endMs must be after startMs.");
    const endMs = Math.min(input.endMs, input.startMs + MAX_PASSAGE_MS);

    const detail = await getSourceDetail(input.sourceId);
    if (!detail) throw new Error("That source doesn't exist.");
    if (detail.kind === "document") throw new Error("That source is a document, not a recording.");
    const representation = detail.transcript;
    if (!representation || representation.status !== "ready") {
      throw new Error("That recording has no finished transcript yet.");
    }

    const [segments, speakers] = await Promise.all([
      supabase
        .from("tw_segments")
        .select("start_ms, end_ms, speaker_id, text")
        .eq("representation_id", representation.id)
        .gt("end_ms", input.startMs)
        .lt("start_ms", endMs)
        .order("position")
        .limit(120)
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
    let truncated = false;
    const lines: { at: string; startMs: number; speaker: string | null; text: string }[] = [];
    for (const segment of segments) {
      words += countWords(segment.text);
      if (words > MAX_PASSAGE_WORDS && lines.length > 0) {
        truncated = true;
        break;
      }
      lines.push({
        at: formatDuration(segment.start_ms),
        startMs: segment.start_ms,
        speaker: segment.speaker_id ? (speakerById.get(segment.speaker_id) ?? null) : null,
        text: segment.text,
      });
    }
    const last = lines[lines.length - 1];
    return {
      source: detail.title,
      lines,
      truncated,
      // Where to ask next if it stopped early.
      continueFromMs: truncated && last ? last.startMs + 1 : null,
    };
  },
});

export const readFindings = defineCapability({
  id: "sourcework.project.readFindings",
  label: "read findings",
  summary:
    "Read the findings a reporter has accepted in one project, grouped by the research question they answer, each with why it matters, who said it, which source and where in it. These are paraphrases; use readPassage to see the words.",
  input: z.object({ projectId: uuid }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    await assertToolAccess(TOOL);
    const links =
      unwrapRead(
        await supabase
          .from("sw_project_sources")
          .select("source_id")
          .eq("project_id", input.projectId),
        "this project's sources",
      ) ?? [];
    const sourceIds = links.map((link) => link.source_id);
    if (sourceIds.length === 0) return { questions: [], findings: [] };

    const [questions, points, sources] = await Promise.all([
      listResearchQuestions(input.projectId),
      supabase
        .from("sw_data_points")
        .select("id, claim, significance, kind, question_id, source_id")
        .eq("project_id", input.projectId)
        .eq("status", "accepted")
        .in("source_id", sourceIds)
        .order("created_at")
        .limit(FINDINGS_LIMIT)
        .then((result) => unwrapRead(result, "this project's accepted findings") ?? []),
      supabase
        .from("sw_sources")
        .select("id, title")
        .in("id", sourceIds)
        .then((result) => unwrapRead(result, "this project's sources") ?? []),
    ]);
    const titleById = new Map(sources.map((source) => [source.id, source.title]));
    const labelById = new Map(questions.map((question) => [question.id, question.label]));

    const startBySpan = new Map<string, number>();
    for (const ids of chunked(points.map((point) => point.id))) {
      for (const span of unwrapRead(
        await supabase
          .from("sw_data_point_spans")
          .select("data_point_id, start_ms, position")
          .in("data_point_id", ids)
          .eq("locator_kind", "temporal")
          .order("position"),
        "these findings' passages",
      ) ?? []) {
        if (span.start_ms !== null && !startBySpan.has(span.data_point_id)) {
          startBySpan.set(span.data_point_id, span.start_ms);
        }
      }
    }

    return {
      questions: questions
        .filter((question) => question.archivedAt === null)
        .map((question) => ({ label: question.label, question: question.question })),
      findings: points.map((point) => {
        const startMs = startBySpan.get(point.id) ?? null;
        return {
          question: point.question_id ? (labelById.get(point.question_id) ?? null) : null,
          claim: point.claim,
          whyItMatters: point.significance,
          kind: point.kind,
          source: titleById.get(point.source_id) ?? "Source",
          sourceId: point.source_id,
          startMs,
          url: sourcePath(point.source_id, { projectId: input.projectId, t: startMs }),
        };
      }),
    };
  },
});
