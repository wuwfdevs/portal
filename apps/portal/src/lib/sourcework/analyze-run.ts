import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { getProjectById } from "@/lib/transcription/projects";
import { RESEARCH_MODEL } from "./model";
import { readSourceUnits, type ReadSource } from "./source-units";
import { resolveSpans, unitIdsForSpan, windowUnits } from "./extraction-units";
import {
  buildAnalyzeInput,
  mergeAnalyses,
  parseAnalysisOutput,
  type AnalyzeConsulted,
  type AnalyzeFinding,
  type AnalyzeNote,
  type EstablishedFinding,
  type ParsedAnalysis,
} from "./analyze-prompt";
import { dropDecidedClips, dropDecidedFindings, establishedLabel } from "./analyze-fresh";
import { callAnalyzeModel } from "./analyze-ai";
import { MAX_ESTABLISHED_FINDINGS, noteKey } from "./analyze-prompt";
import {
  getLivePrompt,
  listContextNotes,
  listDataPointsForSource,
  listResearchQuestions,
} from "./research-queries";
import { finishRun, startRun } from "./research-runs";

// Analyze one source, end to end (docs/sourcework-analysis-design.md §20): read it as numbered units,
// ask the model (with web search available) for findings, a few candidate clips and the pages it
// consulted, check every claim in code, and write the result as suggestions. Nothing a person has
// decided is ever touched, and a re-run replaces only what is still waiting.

export interface AnalyzeContext {
  projectTitle: string;
  projectDescription: string | null;
  /** The active questions, in order, numbered from 1 for the model. May be empty: Analyze does not need one. */
  questions: { id: string; number: number; question: string }[];
  /** Accepted findings from the project's current sources, so the model can add to them rather than repeat. */
  established: EstablishedFinding[];
  /** Pages consulted on earlier runs that nobody dismissed. */
  notes: AnalyzeNote[];
}

export async function loadAnalyzeContext(
  projectId: string,
): Promise<{ ok: true; context: AnalyzeContext } | { ok: false; error: string }> {
  const project = await getProjectById(projectId);
  if (!project) return { ok: false, error: "That project doesn't exist." };

  const questions = (await listResearchQuestions(projectId))
    .filter((question) => !question.archivedAt)
    .map((question, index) => ({
      id: question.id,
      number: index + 1,
      question: question.question,
    }));
  const numberByQuestionId = new Map(questions.map((question) => [question.id, question.number]));

  const supabase = await createClient();
  const links =
    unwrapRead(
      await supabase.from("sw_project_sources").select("source_id").eq("project_id", projectId),
      "this project's sources",
    ) ?? [];
  const sourceIds = links.map((link) => link.source_id);

  let established: EstablishedFinding[] = [];
  if (sourceIds.length > 0) {
    const [pointResult, sourceResult] = await Promise.all([
      supabase
        .from("sw_data_points")
        .select("claim, question_id, source_id")
        .eq("project_id", projectId)
        .eq("status", "accepted")
        .in("source_id", sourceIds)
        .order("created_at")
        .limit(MAX_ESTABLISHED_FINDINGS),
      supabase.from("sw_sources").select("id, title").in("id", sourceIds),
    ]);
    const points = unwrapRead(pointResult, "this project's accepted findings") ?? [];
    const titles = new Map(
      (unwrapRead(sourceResult, "this project's source titles") ?? []).map((row) => [
        row.id,
        row.title,
      ]),
    );
    established = points.map((point) => ({
      questionLabel: establishedLabel(point.question_id, numberByQuestionId),
      claim: point.claim,
      sourceTitle: titles.get(point.source_id) ?? "Source",
    }));
  }

  const notes = (await listContextNotes(projectId))
    .filter((note) => note.status === "active")
    .map((note) => ({ title: note.title, summary: note.summary }));

  return {
    ok: true,
    context: {
      projectTitle: project.title,
      projectDescription: project.description,
      questions,
      established,
      notes,
    },
  };
}

export interface AnalyzeOutcome {
  runId: string;
  findings: number;
  clips: number;
  consulted: number;
  /** Findings and clips that sat on something a person had already decided. */
  skippedDecided: number;
  /** Proposals that failed the code's checks. */
  dropped: number;
}

export type AnalyzeResult = ({ ok: true } & AnalyzeOutcome) | { ok: false; error: string };

type WindowsResult =
  | { ok: true; merged: ReturnType<typeof mergeAnalyses>; queries: string[]; windows: number }
  | { ok: false; error: string };

/** Asks the model about every window of a source and merges what it says. Writes nothing. */
async function analyzeWindows(args: {
  source: ReadSource;
  context: AnalyzeContext;
  guide: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<WindowsResult> {
  const { source, context, guide, onProgress } = args;
  const windows = windowUnits(source.units);
  const unitsById = new Map(source.units.map((unit) => [unit.id, unit]));
  const questionIds = context.questions.map((question) => question.id);

  const parts: ParsedAnalysis[] = [];
  const queries: string[] = [];
  onProgress?.(0, windows.length);
  for (let index = 0; index < windows.length; index++) {
    const window = windows[index]!;
    const input = buildAnalyzeInput({
      projectTitle: context.projectTitle,
      projectDescription: context.projectDescription,
      questions: context.questions.map(({ number, question }) => ({ number, question })),
      established: context.established,
      notes: context.notes,
      sourceTitle: source.sourceTitle,
      sourceKindLabel: source.sourceKindLabel,
      units: window,
      groups: source.groups,
      windowLabel: windows.length > 1 ? `Part ${index + 1} of ${windows.length}` : null,
    });
    const called = await callAnalyzeModel({ guide, input });
    if (!called.ok) return { ok: false, error: called.error };

    const parsed = parseAnalysisOutput(called.text, {
      questionIds,
      validUnitIds: new Set(window.map((unit) => unit.id)),
      unitsById,
      speakerByUnit: source.speakerByUnit,
      interviewerSpeakerIds: source.interviewerSpeakerIds,
      seenUrls: called.seenUrls,
    });
    if (
      parsed.dropped.unreadable > 0 &&
      parsed.findings.length === 0 &&
      parsed.excerpts.length === 0
    ) {
      return {
        ok: false,
        error: "The analysis step returned an answer that couldn't be read. Try again.",
      };
    }
    parts.push(parsed);
    queries.push(...called.queries.filter((query) => !queries.includes(query)));
    onProgress?.(index + 1, windows.length);
  }
  return { ok: true, merged: mergeAnalyses(parts), queries, windows: windows.length };
}

/** Searches that named someone on the recording: the privacy rule is in the prompt, this is how it is checked. */
function queriesNamingPeople(queries: readonly string[], names: readonly string[]): number {
  const wanted = names.map((name) => name.toLowerCase()).filter((name) => name.length >= 3);
  return queries.filter((query) => wanted.some((name) => query.toLowerCase().includes(name)))
    .length;
}

export async function runAnalyze(args: {
  projectId: string;
  sourceId: string;
  userId: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<AnalyzeResult> {
  const { projectId, sourceId, userId, onProgress } = args;
  const supabase = await createClient();

  const read = await readSourceUnits(projectId, sourceId);
  if (!read.ok) return read;
  const loaded = await loadAnalyzeContext(projectId);
  if (!loaded.ok) return loaded;
  const { context } = loaded;

  const live = await getLivePrompt("analyze");
  const started = await startRun(supabase, {
    kind: "analyze",
    projectId,
    sourceId,
    promptVersionId: live.versionId,
    trial: false,
    model: RESEARCH_MODEL,
    userId,
  });
  if (!started.ok) return { ok: false, error: started.error };
  const runId = started.runId;

  try {
    const analyzed = await analyzeWindows({
      source: read.source,
      context,
      guide: live.body,
      onProgress,
    });
    if (!analyzed.ok) {
      await finishRun(supabase, runId, { status: "failed", error: analyzed.error });
      return { ok: false, error: analyzed.error };
    }
    const { merged, queries, windows } = analyzed;

    // What a person has already decided on this source stays decided. Read now, after the model call
    // (a minute or two), so a card decided while it ran counts.
    const existing = await listDataPointsForSource(projectId, sourceId);
    const decidedFindings = existing
      .filter((point) => point.status !== "suggested")
      .map((point) => ({
        relevance: point.relevance,
        questionKey: point.relevance === "question" ? point.questionId : null,
        unitIds: new Set(
          point.spans.flatMap((span) => [...unitIdsForSpan(span, read.source.units)]),
        ),
      }));
    const findings = dropDecidedFindings(merged.findings, decidedFindings);

    const decidedClips =
      unwrapRead(
        await supabase
          .from("sw_quote_suggestions")
          .select("start_ms, end_ms")
          .eq("source_id", sourceId)
          .in("status", ["accepted", "rejected"]),
        "this source's decided clips",
      ) ?? [];
    const cutByHand =
      unwrapRead(
        await supabase
          .from("sw_source_excerpts")
          .select("start_ms, end_ms")
          .eq("source_id", sourceId)
          .eq("locator_kind", "temporal"),
        "this source's excerpts",
      ) ?? [];
    const occupied = [
      ...decidedClips.map((row) => ({ startMs: row.start_ms, endMs: row.end_ms })),
      ...cutByHand.flatMap((row) =>
        row.start_ms === null || row.end_ms === null
          ? []
          : [{ startMs: row.start_ms, endMs: row.end_ms }],
      ),
    ];
    const clips = dropDecidedClips(merged.excerpts, occupied);

    // Findings ---------------------------------------------------------------------------------
    const unitsById = new Map(read.source.units.map((unit) => [unit.id, unit]));
    const pointIdFor = new Map<AnalyzeFinding, string>();
    const pointRows = findings.fresh.map((finding) => {
      const id = randomUUID();
      pointIdFor.set(finding, id);
      return {
        id,
        project_id: projectId,
        source_id: sourceId,
        representation_id: read.source.representationId,
        question_id: finding.questionId,
        relevance: finding.relevance,
        story_element: null,
        claim: finding.claim,
        ai_claim: finding.claim,
        significance: finding.significance,
        speaker_id: read.source.speakerByUnit.get(finding.ranges[0]!.from) ?? null,
        kind: finding.kind,
        status: "suggested" as const,
        prompt_version_id: live.versionId,
        run_id: runId,
      };
    });
    const spanRows = findings.fresh.flatMap((finding) =>
      resolveSpans(finding.ranges, unitsById).map((span, position) => ({
        data_point_id: pointIdFor.get(finding)!,
        position,
        locator_kind: span.kind,
        start_ms: span.kind === "temporal" ? span.startMs : null,
        end_ms: span.kind === "temporal" ? span.endMs : null,
        page_number: span.kind === "document" ? span.pageNumber : null,
        first_block_id: span.kind === "document" ? span.firstBlockId : null,
        last_block_id: span.kind === "document" ? span.lastBlockId : null,
      })),
    );

    if (pointRows.length > 0) {
      const inserted = await supabase.from("sw_data_points").insert(pointRows);
      if (inserted.error) throw new Error(`Could not save the findings: ${inserted.error.message}`);
      const spansInserted = await supabase.from("sw_data_point_spans").insert(spanRows);
      if (spansInserted.error) {
        // Findings without their passages would be claims with no evidence; take them back out.
        await supabase.from("sw_data_points").delete().eq("run_id", runId);
        throw new Error(`Could not save the findings' passages: ${spansInserted.error.message}`);
      }
    }

    // Clips ------------------------------------------------------------------------------------
    const clipRows = clips.fresh.map((clip) => ({
      id: randomUUID(),
      project_id: projectId,
      source_id: sourceId,
      representation_id: read.source.representationId,
      speaker_id: clip.speakerId,
      start_ms: clip.startMs,
      end_ms: clip.endMs,
      quote_text: read.source.units
        .filter((unit) => unit.id >= clip.firstUnit && unit.id <= clip.lastUnit)
        .map((unit) => unit.text)
        .join(" "),
      reason: clip.why,
      run_id: runId,
      prompt_version_id: live.versionId,
      created_by: userId,
    }));
    if (clipRows.length > 0) {
      const inserted = await supabase.from("sw_quote_suggestions").insert(clipRows);
      if (inserted.error) throw new Error(`Could not save the clips: ${inserted.error.message}`);
      const links = clips.fresh.flatMap((clip, index) => {
        const dataPointId = clip.serves ? pointIdFor.get(clip.serves) : undefined;
        return dataPointId
          ? [{ suggestion_id: clipRows[index]!.id, data_point_id: dataPointId }]
          : [];
      });
      if (links.length > 0) {
        const linked = await supabase.from("sw_quote_suggestion_points").insert(links);
        if (linked.error)
          throw new Error(`Could not save what the clips serve: ${linked.error.message}`);
      }
    }

    // Pages the model relied on -----------------------------------------------------------------
    await saveConsultedNotes({
      supabase,
      projectId,
      userId,
      runId,
      consulted: merged.consulted,
      pointIdFor,
    });

    // The new suggestions are in; only now do the earlier run's still-unreviewed ones go.
    const clearedPoints = await supabase
      .from("sw_data_points")
      .delete()
      .eq("project_id", projectId)
      .eq("source_id", sourceId)
      .eq("status", "suggested")
      .or(`run_id.is.null,run_id.neq.${runId}`);
    if (clearedPoints.error) {
      throw new Error(`Could not replace the earlier findings: ${clearedPoints.error.message}`);
    }
    const clearedClips = await supabase
      .from("sw_quote_suggestions")
      .delete()
      .eq("source_id", sourceId)
      .eq("status", "suggested")
      .or(`run_id.is.null,run_id.neq.${runId}`);
    if (clearedClips.error) {
      throw new Error(`Could not replace the earlier clips: ${clearedClips.error.message}`);
    }

    const droppedTotal = Object.values(merged.dropped).reduce((sum, count) => sum + count, 0);
    await finishRun(supabase, runId, {
      status: "succeeded",
      counts: {
        windows,
        findings_proposed: merged.findings.length + merged.duplicateFindings,
        findings_added: pointRows.length,
        duplicates: merged.duplicateFindings,
        skipped_decided: findings.skipped + clips.skipped,
        clips_added: clipRows.length,
        consulted: merged.consulted.length,
        searches: queries.length,
        searches_naming_people: queriesNamingPeople(queries, read.source.speakerNames),
        established_shown: Math.min(context.established.length, MAX_ESTABLISHED_FINDINGS),
        questions: context.questions.length,
        dropped: merged.dropped,
      },
      queries,
    });
    return {
      ok: true,
      runId,
      findings: pointRows.length,
      clips: clipRows.length,
      consulted: merged.consulted.length,
      skippedDecided: findings.skipped + clips.skipped,
      dropped: droppedTotal,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";
    console.error("Sourcework analyze failed:", error);
    // Whatever this run managed to write is taken back; what a person decided is never in it.
    await supabase.from("sw_data_points").delete().eq("run_id", runId).eq("status", "suggested");
    await supabase
      .from("sw_quote_suggestions")
      .delete()
      .eq("run_id", runId)
      .eq("status", "suggested");
    await finishRun(supabase, runId, { status: "failed", error: message });
    return { ok: false, error: message };
  }
}

/**
 * Records the pages the model relied on as background notes (never evidence, never quotable) and
 * which findings each informed. A page already on file, dismissed or not, is reused, not duplicated,
 * and a dismissal is never undone.
 */
async function saveConsultedNotes(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  projectId: string;
  userId: string;
  runId: string;
  consulted: readonly AnalyzeConsulted[];
  pointIdFor: ReadonlyMap<AnalyzeFinding, string>;
}): Promise<void> {
  const { supabase, projectId, userId, runId, consulted, pointIdFor } = args;
  if (consulted.length === 0) return;

  const onFile =
    unwrapRead(
      await supabase.from("sw_context_notes").select("id, title, url").eq("project_id", projectId),
      "this project's background notes",
    ) ?? [];
  const byUrl = new Map(onFile.map((note) => [note.url, note.id]));
  const byTitle = new Map(onFile.map((note) => [noteKey(note.title), note.id]));

  const fresh: {
    id: string;
    project_id: string;
    title: string;
    summary: string;
    url: string;
    run_id: string;
    created_by: string;
  }[] = [];
  const noteIdFor = new Map<AnalyzeConsulted, string>();
  for (const note of consulted) {
    const known = byUrl.get(note.url) ?? byTitle.get(noteKey(note.title));
    if (known) {
      noteIdFor.set(note, known);
      continue;
    }
    const id = randomUUID();
    fresh.push({
      id,
      project_id: projectId,
      title: note.title,
      summary: note.summary,
      url: note.url,
      run_id: runId,
      created_by: userId,
    });
    byUrl.set(note.url, id);
    byTitle.set(noteKey(note.title), id);
    noteIdFor.set(note, id);
  }
  if (fresh.length > 0) {
    const inserted = await supabase.from("sw_context_notes").insert(fresh);
    if (inserted.error)
      throw new Error(`Could not save the pages consulted: ${inserted.error.message}`);
  }

  const seen = new Set<string>();
  const links: { note_id: string; data_point_id: string }[] = [];
  for (const note of consulted) {
    for (const finding of note.informs) {
      const dataPointId = pointIdFor.get(finding);
      const noteId = noteIdFor.get(note);
      if (!dataPointId || !noteId || seen.has(`${noteId}:${dataPointId}`)) continue;
      seen.add(`${noteId}:${dataPointId}`);
      links.push({ note_id: noteId, data_point_id: dataPointId });
    }
  }
  if (links.length > 0) {
    const linked = await supabase.from("sw_context_note_points").insert(links);
    if (linked.error) {
      throw new Error(`Could not save which findings the pages informed: ${linked.error.message}`);
    }
  }
}
