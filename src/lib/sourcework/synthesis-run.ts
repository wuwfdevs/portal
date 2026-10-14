import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getProjectById } from "@/lib/transcription/projects";
import { RESEARCH_MODEL } from "./model";
import { getLivePrompt, listResearchQuestions } from "./research-queries";
import { finishRun, startRun } from "./research-runs";
import { PassageLedger } from "./passage-ledger";
import {
  SYNTHESIS_FRAMING,
  buildSynthesisInput,
  buildSynthesisOutputSchema,
  parseSynthesisOutput,
  renderBaseSynthesis,
  type SynthesisInputFinding,
} from "./synthesis-prompt";
import { buildSynthesisTools } from "./synthesis-tools";
import { getCurrentSynthesis, listAcceptedFindings } from "./synthesis-queries";
import { carryPinned, isEmptySynthesis } from "./synthesis";
import { runToolLoop } from "./tool-loop";

// Synthesize a project, end to end (docs/sourcework-analysis-design.md §21): number the accepted
// findings, ask the model what they establish for each question (with tools to check the tape), check
// every statement in code, carry forward what a person wrote, and save the result as a new version.
// A run never overwrites a version: it writes the next one, and if someone saved first it saves nothing.

export interface SynthesisOutcome {
  runId: string;
  version: number;
  statements: number;
  tensions: number;
  gaps: number;
  narrative: number;
  emerging: number;
  dropped: number;
}

export type SynthesisResult = ({ ok: true } & SynthesisOutcome) | { ok: false; error: string };

export async function runSynthesis(args: {
  projectId: string;
  userId: string;
}): Promise<SynthesisResult> {
  const { projectId, userId } = args;

  const project = await getProjectById(projectId);
  if (!project) return { ok: false, error: "That project doesn't exist." };

  const { findings, truncated } = await listAcceptedFindings(projectId);
  if (findings.length === 0) {
    return {
      ok: false,
      error: "There are no accepted findings yet. Analyze a source and accept what it finds first.",
    };
  }
  const questions = (await listResearchQuestions(projectId))
    .filter((question) => !question.archivedAt)
    .map((question, index) => ({
      id: question.id,
      number: index + 1,
      question: question.question,
    }));
  const questionNumberById = new Map(questions.map((question) => [question.id, question.number]));

  const sources: { number: number; id: string; title: string }[] = [];
  const sourceNumber = new Map<string, number>();
  for (const finding of findings) {
    if (sourceNumber.has(finding.sourceId)) continue;
    const number = sources.length + 1;
    sourceNumber.set(finding.sourceId, number);
    sources.push({ number, id: finding.sourceId, title: finding.sourceTitle });
  }
  const inputFindings: SynthesisInputFinding[] = findings.map((finding, index) => ({
    number: index + 1,
    id: finding.id,
    sourceNumber: sourceNumber.get(finding.sourceId)!,
    questionNumber: finding.questionId
      ? (questionNumberById.get(finding.questionId) ?? null)
      : null,
    kind: finding.kind,
    claim: finding.claim,
    significance: finding.significance,
    speaker: finding.speakerLabel,
    at: finding.at,
  }));
  const findingNumberById = new Map(inputFindings.map((finding) => [finding.id, finding.number]));

  const current = await getCurrentSynthesis(projectId);
  const baseVersion = current?.version ?? 0;
  const base = current
    ? renderBaseSynthesis(current.body, {
        version: current.version,
        questionNumberById,
        findingNumberById,
      })
    : null;

  const supabase = await createClient();
  const live = await getLivePrompt("synthesis");
  const started = await startRun(supabase, {
    kind: "synthesis",
    projectId,
    sourceId: null,
    promptVersionId: live.versionId,
    trial: false,
    model: RESEARCH_MODEL,
    userId,
  });
  if (!started.ok) return { ok: false, error: started.error };
  const runId = started.runId;

  try {
    const ledger = new PassageLedger();
    const sourceTitleById = new Map(sources.map((source) => [source.id, source.title]));
    const looped = await runToolLoop({
      step: "synthesis",
      instructions: `${SYNTHESIS_FRAMING}\n\n${live.body}`,
      input: buildSynthesisInput({
        projectTitle: project.title,
        projectDescription: project.description,
        questions,
        sources,
        findings: inputFindings,
        base,
      }),
      schemaName: "synthesis",
      schema: buildSynthesisOutputSchema(),
      tools: buildSynthesisTools({ projectId, findings, sourceTitleById, ledger }),
    });
    if (!looped.ok) {
      await finishRun(supabase, runId, { status: "failed", error: looped.error });
      return { ok: false, error: looped.error };
    }

    const parsed = parseSynthesisOutput(looped.text, {
      findingIds: findings.map((finding) => finding.id),
      findingSourceIds: findings.map((finding) => finding.sourceId),
      questionIds: questions.map((question) => question.id),
      passages: ledger.asMap(),
      newId: randomUUID,
    });
    const droppedTotal = Object.values(parsed.dropped).reduce((sum, count) => sum + count, 0);
    if (parsed.dropped.unreadable > 0 || isEmptySynthesis(parsed.body)) {
      const error =
        parsed.dropped.unreadable > 0
          ? "The synthesis step returned an answer that couldn't be read. Try again."
          : "The synthesis step found nothing it could support from these findings. Try again, or add more findings.";
      await finishRun(supabase, runId, { status: "failed", error });
      return { ok: false, error };
    }

    const accepted = new Set(findings.map((finding) => finding.id));
    const body = carryPinned(current?.body ?? null, parsed.body, accepted);

    const saved = await supabase.rpc("sw_save_project_synthesis", {
      p_project_id: projectId,
      p_base_version: baseVersion,
      p_body: body as never,
      p_saved_via: "model",
      p_run_id: runId,
      p_prompt_version_id: live.versionId,
    });
    if (saved.error) throw new Error(`Could not save the synthesis: ${saved.error.message}`);
    if (saved.data === -1) {
      const error =
        "Someone saved a change to this synthesis while it was being written, so nothing was saved. Reload and run it again.";
      await finishRun(supabase, runId, { status: "failed", error });
      return { ok: false, error };
    }

    const statements = body.sections.reduce((sum, section) => sum + section.findings.length, 0);
    const gaps = body.sections.reduce((sum, section) => sum + section.gaps.length, 0);
    await finishRun(supabase, runId, {
      status: "succeeded",
      counts: {
        findings_shown: findings.length,
        findings_truncated: truncated,
        questions: questions.length,
        rounds: looped.rounds,
        tool_calls: looped.calls.length,
        tool_calls_failed: looped.calls.filter((call) => call.failed).length,
        passages_shown: ledger.size,
        statements,
        tensions: body.tensions.length,
        gaps,
        narrative: body.narrative.length,
        emerging: body.emerging.length,
        version: saved.data,
        dropped: parsed.dropped,
      },
    });
    return {
      ok: true,
      runId,
      version: saved.data,
      statements,
      tensions: body.tensions.length,
      gaps,
      narrative: body.narrative.length,
      emerging: body.emerging.length,
      dropped: droppedTotal,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synthesis failed.";
    console.error("Sourcework synthesis failed:", error);
    await finishRun(supabase, runId, { status: "failed", error: message });
    return { ok: false, error: message };
  }
}
