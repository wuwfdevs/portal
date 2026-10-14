import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { getProjectById } from "@/lib/transcription/projects";
import { callStructuredModel } from "./openai-call";
import { RESEARCH_MODEL } from "./model";
import {
  EXPAND_FRAMING,
  buildExpandInput,
  buildExpandOutputSchema,
  expandBeats,
  type ExpandItem,
} from "./piece-expand-prompt";
import { renderFormatGuide } from "./piece-formats";
import { getLiveFormat } from "./piece-format-queries";
import { DIRECTION_MAX } from "./piece-standards";
import {
  actualityRange,
  blockSeconds,
  excerptIdsIn,
  hasBeats,
  parsePieceBody,
  type PieceBlock,
} from "./pieces";
import { loadPieceExcerpts } from "./piece-queries";
import { savePieceBlocks } from "./piece-writes";
import { finishRun, startRun } from "./research-runs";
import { getFindingsByIds } from "./synthesis-queries";

// Writing an outline out (docs/sourcework-analysis-design.md §22). Offered on a piece that has outline beats
// (the editor says "Write from outline" there). The model writes narration per beat; expandBeats puts it
// back at the beat's place and leaves every clip and every word a person wrote alone. Saved as the piece's
// next version, so Undo returns to the outline.

export type ExpandPieceResult =
  | {
      ok: true;
      version: number;
      expanded: number;
      skipped: number;
      warnings: string[];
    }
  | { ok: false; error: string; conflict?: boolean };

export async function expandOutline(args: {
  pieceId: string;
  /** A published format to follow, or null for none. */
  formatId: string | null;
  direction: string;
  userId: string;
  /** Refuse unless the piece is still at this version. */
  expectVersion: number;
}): Promise<ExpandPieceResult> {
  const supabase = await createClient();
  const piece = unwrapRead(
    await supabase
      .from("sw_pieces")
      .select("id, project_id, current_version, target_seconds")
      .eq("id", args.pieceId)
      .maybeSingle(),
    "this piece",
  );
  if (!piece) return { ok: false, error: "That piece no longer exists." };
  if (piece.current_version !== args.expectVersion) {
    return {
      ok: false,
      conflict: true,
      error: "This piece changed while you were choosing. Reload to see it.",
    };
  }

  let blocks: PieceBlock[] = [];
  if (piece.current_version > 0) {
    const version = unwrapRead(
      await supabase
        .from("sw_piece_versions")
        .select("body")
        .eq("piece_id", piece.id)
        .eq("version", piece.current_version)
        .maybeSingle(),
      "this piece's content",
    );
    const parsed = parsePieceBody(version?.body);
    if (!parsed) return { ok: false, error: "That piece's saved content could not be read." };
    blocks = parsed;
  }
  if (!hasBeats(blocks)) return { ok: false, error: "This piece has no outline beats to write." };

  const format = args.formatId ? await getLiveFormat(args.formatId) : null;
  if (args.formatId && !format) {
    return { ok: false, error: "That format isn't published, so it can't guide the writing." };
  }
  const project = await getProjectById(piece.project_id);
  if (!project) return { ok: false, error: "That project doesn't exist." };

  const run = await startRun(supabase, {
    kind: "expand",
    projectId: piece.project_id,
    sourceId: null,
    pieceId: piece.id,
    formatVersionId: format?.versionId ?? null,
    promptVersionId: null,
    trial: false,
    model: RESEARCH_MODEL,
    userId: args.userId,
  });
  if (!run.ok) return { ok: false, error: run.error };

  try {
    const citedIds = blocks.flatMap((block) => (block.type === "beat" ? block.cites : []));
    const [cited, excerpts] = await Promise.all([
      getFindingsByIds(piece.project_id, citedIds),
      loadPieceExcerpts(supabase, excerptIdsIn(blocks)),
    ]);
    const findingById = new Map(cited.map((finding) => [finding.id, finding]));
    const excerptById = new Map(excerpts.map((excerpt) => [excerpt.id, excerpt]));

    let beatNumber = 0;
    const items = blocks.map((block): ExpandItem => {
      if (block.type === "beat") {
        beatNumber += 1;
        return {
          kind: "beat",
          number: beatNumber,
          text: block.text,
          verify: block.verify,
          anchor: block.role === "anchor",
          cited: block.cites.map((id) => {
            const finding = findingById.get(id);
            return finding
              ? {
                  claim: finding.claim,
                  speaker: finding.speakerLabel,
                  sourceTitle: finding.sourceTitle,
                  at: finding.at,
                  withdrawn: false,
                }
              : { claim: "", speaker: null, sourceTitle: "", at: null, withdrawn: true };
          }),
        };
      }
      if (block.type === "narration") {
        return { kind: "narration", text: block.text, anchor: block.role === "anchor" };
      }
      const excerpt = excerptById.get(block.excerpt_id);
      const range = actualityRange(block, excerpt);
      return {
        kind: "actuality",
        speaker: excerpt?.speaker ?? null,
        sourceTitle: excerpt?.sourceTitle ?? "",
        seconds: excerpt ? blockSeconds(block, excerptById) : 0,
        words: excerpt && range ? excerpt.text : "",
        missing: !excerpt,
      };
    });

    const formatGuide = format ? renderFormatGuide(format.name, format.spec) : null;
    const answer = await callStructuredModel({
      step: "writing",
      schemaName: "piece_expand",
      schema: buildExpandOutputSchema(),
      framing: EXPAND_FRAMING,
      guide: formatGuide ?? "",
      input: buildExpandInput({
        projectTitle: project.title,
        direction: args.direction.slice(0, DIRECTION_MAX),
        formatGuide,
        targetSeconds: piece.target_seconds ?? format?.spec.targetSeconds ?? null,
        items,
      }),
    });
    if (!answer.ok) {
      await finishRun(supabase, run.runId, { status: "failed", error: answer.error });
      return { ok: false, error: answer.error };
    }

    const result = expandBeats(blocks, answer.text, randomUUID);
    if (!result.ok) {
      await finishRun(supabase, run.runId, { status: "failed", error: result.error });
      return { ok: false, error: result.error };
    }

    const saved = await savePieceBlocks(
      supabase,
      piece.id,
      piece.current_version,
      result.blocks,
      "generation",
    );
    if (!saved.ok) {
      const error =
        "conflict" in saved
          ? "Someone saved this piece while the outline was being written out."
          : saved.error;
      await finishRun(supabase, run.runId, { status: "failed", error });
      return { ok: false, error, conflict: "conflict" in saved };
    }

    const updated = await supabase
      .from("sw_pieces")
      .update({
        drafted_version: saved.version,
        ...(format ? { format_version_id: format.versionId } : {}),
        ...(piece.target_seconds === null && format
          ? { target_seconds: format.spec.targetSeconds }
          : {}),
      })
      .eq("id", piece.id);
    if (updated.error) console.error("Could not record an expanded outline:", updated.error);

    await finishRun(supabase, run.runId, {
      status: "succeeded",
      counts: {
        mode: "expand_outline",
        beats_expanded: result.expanded,
        beats_skipped: result.skipped,
        blocks: result.blocks.length,
        length_seconds: saved.lengthSeconds,
        withdrawn_findings: new Set(citedIds).size - cited.length,
      },
    });
    return {
      ok: true,
      version: saved.version,
      expanded: result.expanded,
      skipped: result.skipped,
      warnings: result.warnings,
    };
  } catch (error) {
    console.error("Sourcework outline expansion failed:", error);
    const message = error instanceof Error ? error.message : "Writing the outline out failed.";
    await finishRun(supabase, run.runId, { status: "failed", error: message });
    return { ok: false, error: message };
  }
}
