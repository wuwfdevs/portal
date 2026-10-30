import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { RESEARCH_MODEL } from "./model";
import {
  OUTLINE_FRAMING,
  MAX_OUTLINE_EXCERPTS,
  buildOutlineInput,
  buildOutlineOutputSchema,
  parseOutlineOutput,
} from "./piece-outline-prompt";
import { renderFormatGuide, type FormatSpec } from "./piece-formats";
import { getLiveFormat } from "./piece-format-queries";
import { computePieceLength, type PieceBlock } from "./pieces";
import { PassageLedger } from "./passage-ledger";
import { listPickerExcerpts, type PieceExcerpt } from "./piece-queries";
import { savePieceBlocks } from "./piece-writes";
import { getProjectById } from "@/lib/transcription/projects";
import { getLivePrompt, listResearchQuestions, type LivePrompt } from "./research-queries";
import { finishRun, startRun } from "./research-runs";
import { getCurrentSynthesis, listAcceptedFindings } from "./synthesis-queries";
import { renderSynthesisLines } from "./synthesis-prompt";
import { buildSynthesisTools } from "./synthesis-tools";
import { runToolLoop } from "./tool-loop";

// Outline a piece (docs/sourcework-analysis-design.md §22): read the project's accepted findings, its
// synthesis and every excerpt it has, let the model check the tape with the same lookups synthesis uses,
// and save beats and actualities as the piece's next version. The outline is an ordinary version: History
// and Undo already work, and nothing a person wrote is touched because this is offered on an empty piece
// and refuses if the piece changed. `generateOutline` is the read-and-ask half, which writes nothing; a
// format's "Try this draft" uses it too.

export interface OutlineFormat {
  name: string;
  spec: FormatSpec;
  /** The published version this guidance came from; null for an editor's unpublished draft. */
  versionId: string | null;
}

export type GeneratedOutline =
  | {
      ok: true;
      blocks: PieceBlock[];
      warnings: string[];
      /** Every excerpt the project offers, so a caller can show or measure the clips the outline placed. */
      picker: PieceExcerpt[];
      counts: Record<string, unknown>;
    }
  | { ok: false; error: string };

/** The material and the model call behind an outline. Reads the project; writes nothing. */
export async function generateOutline(args: {
  projectId: string;
  format: OutlineFormat | null;
  /** The piece's own target, which wins over the format's. */
  targetSeconds: number | null;
  direction: string;
  guide: LivePrompt;
}): Promise<GeneratedOutline> {
  const project = await getProjectById(args.projectId);
  if (!project) return { ok: false, error: "That project doesn't exist." };

  const [{ findings }, picker, synthesis, questionRows] = await Promise.all([
    listAcceptedFindings(args.projectId),
    listPickerExcerpts(args.projectId),
    getCurrentSynthesis(args.projectId),
    listResearchQuestions(args.projectId),
  ]);
  if (findings.length === 0 && picker.length === 0) {
    return {
      ok: false,
      error:
        "There is nothing to outline from yet. Accept some findings or make an excerpt, then try again.",
    };
  }

  const questions = questionRows
    .filter((question) => !question.archivedAt)
    .map((question, index) => ({
      id: question.id,
      number: index + 1,
      question: question.question,
    }));
  const questionNumberById = new Map(questions.map((question) => [question.id, question.number]));
  const findingNumberById = new Map(findings.map((finding, index) => [finding.id, index + 1]));
  const excerpts = picker.slice(0, MAX_OUTLINE_EXCERPTS).map((excerpt, index) => ({
    number: index + 1,
    id: excerpt.id,
    title: excerpt.title,
    speaker: excerpt.speaker,
    sourceTitle: excerpt.sourceTitle,
    seconds: Math.max(0, Math.round((excerpt.endMs - excerpt.startMs) / 1000)),
    words: excerpt.text,
  }));

  const ledger = new PassageLedger();
  const sourceTitleById = new Map(
    findings.map((finding) => [finding.sourceId, finding.sourceTitle]),
  );
  for (const excerpt of picker) sourceTitleById.set(excerpt.sourceId, excerpt.sourceTitle);

  const looped = await runToolLoop({
    step: "outline",
    instructions: `${OUTLINE_FRAMING}\n\n${args.guide.body}`,
    input: buildOutlineInput({
      projectTitle: project.title,
      projectDescription: project.description,
      direction: args.direction,
      formatGuide: args.format ? renderFormatGuide(args.format.name, args.format.spec) : null,
      targetSeconds: args.targetSeconds ?? args.format?.spec.targetSeconds ?? null,
      questions,
      synthesisLines: synthesis
        ? renderSynthesisLines(synthesis.body, { questionNumberById, findingNumberById })
        : [],
      findings: findings.map((finding, index) => ({
        number: index + 1,
        claim: finding.claim,
        significance: finding.significance,
        kind: finding.kind,
        sourceTitle: finding.sourceTitle,
        speaker: finding.speakerLabel,
        at: finding.at,
        questionNumber: finding.questionId
          ? (questionNumberById.get(finding.questionId) ?? null)
          : null,
      })),
      excerpts,
    }),
    schemaName: "piece_outline",
    schema: buildOutlineOutputSchema(),
    tools: buildSynthesisTools({
      projectId: args.projectId,
      findings,
      sourceTitleById,
      ledger,
    }),
  });
  if (!looped.ok) return { ok: false, error: looped.error };

  const parsed = parseOutlineOutput(looped.text, {
    findingIds: findings.map((finding) => finding.id),
    excerpts,
    passages: ledger.asMap(),
    newId: randomUUID,
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  return {
    ok: true,
    blocks: parsed.blocks,
    warnings: parsed.warnings,
    picker,
    counts: {
      beats: parsed.blocks.filter((block) => block.type === "beat").length,
      actualities: parsed.blocks.filter((block) => block.type === "actuality").length,
      findings_shown: findings.length,
      excerpts_shown: excerpts.length,
      excerpts_available: picker.length,
      rounds: looped.rounds,
      tool_calls: looped.calls.length,
      tool_calls_failed: looped.calls.filter((call) => call.failed).length,
      passages_shown: ledger.size,
      synthesis_version: synthesis?.version ?? null,
      dropped: parsed.dropped,
    },
  };
}

export type OutlinePieceResult =
  | {
      ok: true;
      version: number;
      beats: number;
      actualities: number;
      warnings: string[];
    }
  | { ok: false; error: string; conflict?: boolean };

export async function outlinePiece(args: {
  pieceId: string;
  /** A published format to follow (length, usual actuality range, style); null for none. */
  formatId: string | null;
  direction: string;
  userId: string;
  /** Refuse unless the piece is still at this version. */
  expectVersion: number;
}): Promise<OutlinePieceResult> {
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

  const format = args.formatId ? await getLiveFormat(args.formatId) : null;
  if (args.formatId && !format) {
    return { ok: false, error: "That format isn't published, so it can't guide an outline." };
  }
  const guide = await getLivePrompt("outline");

  const run = await startRun(supabase, {
    kind: "outline",
    projectId: piece.project_id,
    sourceId: null,
    pieceId: piece.id,
    formatVersionId: format?.versionId ?? null,
    promptVersionId: guide.versionId,
    trial: false,
    model: RESEARCH_MODEL,
    userId: args.userId,
  });
  if (!run.ok) return { ok: false, error: run.error };

  try {
    const generated = await generateOutline({
      projectId: piece.project_id,
      format: format ? { name: format.name, spec: format.spec, versionId: format.versionId } : null,
      targetSeconds: piece.target_seconds,
      direction: args.direction,
      guide,
    });
    if (!generated.ok) {
      await finishRun(supabase, run.runId, { status: "failed", error: generated.error });
      return { ok: false, error: generated.error };
    }

    const saved = await savePieceBlocks(
      supabase,
      piece.id,
      piece.current_version,
      generated.blocks,
      "generation",
    );
    if (!saved.ok) {
      const error =
        "conflict" in saved
          ? "Someone saved this piece while the outline was being written."
          : saved.error;
      await finishRun(supabase, run.runId, { status: "failed", error });
      return { ok: false, error, conflict: "conflict" in saved };
    }

    // The format guides the piece from here, but nothing was written out: drafted_version stays as it is.
    if (format) {
      const updated = await supabase
        .from("sw_pieces")
        .update({
          format_version_id: format.versionId,
          ...(piece.target_seconds === null ? { target_seconds: format.spec.targetSeconds } : {}),
        })
        .eq("id", piece.id);
      if (updated.error) console.error("Could not record the format of an outline:", updated.error);
    }

    const beats = generated.blocks.filter((block) => block.type === "beat").length;
    const actualities = generated.blocks.filter((block) => block.type === "actuality").length;
    await finishRun(supabase, run.runId, {
      status: "succeeded",
      counts: {
        ...generated.counts,
        length_seconds: computePieceLength(generated.blocks, generated.picker).totalSeconds,
      },
    });
    return { ok: true, version: saved.version, beats, actualities, warnings: generated.warnings };
  } catch (error) {
    console.error("Sourcework outline failed:", error);
    const message = error instanceof Error ? error.message : "The outline failed.";
    await finishRun(supabase, run.runId, { status: "failed", error: message });
    return { ok: false, error: message };
  }
}
