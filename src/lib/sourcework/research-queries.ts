import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { groupBy, indexBy } from "@/lib/collections";
import type { Database } from "@/lib/database.types";
import {
  compareQuestions,
  hostLabel,
  questionLabels,
  type ContextNote,
  type DataPoint,
  type DataPointSpan,
  type ResearchQuestion,
} from "./research";
import {
  extractionState,
  type ExtractionState,
  type RunStatus,
  type SourceExtractionInput,
} from "./run-state";
import { promptSlotDefinition, type PromptSlot } from "./prompts";

// Reads behind the research screens (docs/sourcework-analysis-design.md §7).
// Everything goes through the caller's session, so RLS is still the boundary,
// and a failed read throws rather than rendering as an empty state.

type Tables = Database["public"]["Tables"];

/** PostgREST puts `.in()` lists in the URL; a few hundred ids is plenty and a few thousand is a "Bad Request". */
const IN_CHUNK = 100;

function chunked<T>(values: readonly T[], size = IN_CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    chunks.push(values.slice(index, index + size));
  return chunks;
}

// Questions and notes -----------------------------------------------------------

/** Every question of a project (archived too), in order, labelled, with how many data points answer each. */
export async function listResearchQuestions(projectId: string): Promise<ResearchQuestion[]> {
  const supabase = await createClient();
  const [questionResult, countResult] = await Promise.all([
    supabase
      .from("sw_research_questions")
      .select("id, project_id, position, question, created_at, archived_at")
      .eq("project_id", projectId),
    supabase
      .from("sw_data_point_question_counts")
      .select("question_id, total")
      .eq("project_id", projectId),
  ]);
  const rows = unwrapRead(questionResult, "this project's research questions") ?? [];
  const counts = new Map(
    (unwrapRead(countResult, "this project's data point counts") ?? []).map((row) => [
      row.question_id,
      row.total,
    ]),
  );

  const ordered = rows.map((row) => ({ ...row, createdAt: row.created_at })).sort(compareQuestions);
  const labels = questionLabels(ordered);
  return ordered.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    position: row.position,
    question: row.question,
    label: labels.get(row.id) ?? "Q?",
    archivedAt: row.archived_at,
    dataPointCount: counts.get(row.id) ?? 0,
  }));
}

/** A project's background notes, newest last; the caller filters by status. */
export async function listContextNotes(projectId: string): Promise<ContextNote[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("sw_context_notes")
        .select("id, project_id, title, summary, url, retrieved_at, status")
        .eq("project_id", projectId)
        .order("created_at")
        .order("id"),
      "this project's background notes",
    ) ?? [];
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    summary: row.summary,
    url: row.url,
    sourceName: hostLabel(row.url),
    retrievedAt: row.retrieved_at,
    status: row.status,
  }));
}

// Runs and counts ------------------------------------------------------------------

export interface RunSummary {
  id: string;
  kind: "context" | "extraction";
  sourceId: string | null;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  counts: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type RunRow = {
  id: string;
  kind: "context" | "extraction";
  source_id: string | null;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  counts: unknown;
};

const RUN_COLUMNS = "id, kind, source_id, status, started_at, finished_at, error, counts";

function toRunSummary(row: RunRow): RunSummary {
  return {
    id: row.id,
    kind: row.kind,
    sourceId: row.source_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    error: row.error,
    counts: asRecord(row.counts),
  };
}

/** The project's most recent non-trial background run, however many runs have happened since. */
export async function getLatestContextRun(projectId: string): Promise<RunSummary | null> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("sw_analysis_runs")
        .select(RUN_COLUMNS)
        .eq("project_id", projectId)
        .eq("kind", "context")
        .eq("trial", false)
        .order("started_at", { ascending: false })
        .limit(1),
      "this project's latest background run",
    ) ?? [];
  return rows[0] ? toRunSummary(rows[0]) : null;
}

/**
 * The latest non-trial extraction run of each given source. One query per
 * source rather than one truncated history, so a project with many runs never
 * loses an older source's latest.
 */
export async function getLatestExtractionRuns(
  projectId: string,
  sourceIds: readonly string[],
): Promise<Map<string, RunSummary>> {
  const supabase = await createClient();
  const found = await Promise.all(
    [...new Set(sourceIds)].map(async (sourceId) => {
      const rows =
        unwrapRead(
          await supabase
            .from("sw_analysis_runs")
            .select(RUN_COLUMNS)
            .eq("project_id", projectId)
            .eq("source_id", sourceId)
            .eq("kind", "extraction")
            .eq("trial", false)
            .order("started_at", { ascending: false })
            .limit(1),
          "a source's latest extraction run",
        ) ?? [];
      return rows[0] ? toRunSummary(rows[0]) : null;
    }),
  );
  const result = new Map<string, RunSummary>();
  for (const run of found) if (run?.sourceId) result.set(run.sourceId, run);
  return result;
}

export interface SourceResearch {
  state: ExtractionState;
  counts: { total: number; toReview: number; accepted: number; rejected: number };
}

/**
 * Where each of a project's sources stands with extraction: the run log and the
 * data point counts folded into one ExtractionState (run-state.ts) per source.
 */
export async function getSourceResearch(
  projectId: string,
  sources: readonly {
    sourceId: string;
    status: SourceExtractionInput["sourceStatus"];
    kind: SourceExtractionInput["sourceKind"];
  }[],
): Promise<Map<string, SourceResearch>> {
  const supabase = await createClient();
  const [latestBySource, countRows] = await Promise.all([
    getLatestExtractionRuns(
      projectId,
      sources.map((source) => source.sourceId),
    ),
    supabase
      .from("sw_data_point_counts")
      .select("source_id, total, to_review, accepted, rejected")
      .eq("project_id", projectId)
      .then((result) => unwrapRead(result, "this project's data point counts") ?? []),
  ]);

  const countsBySource = indexBy(countRows, (row) => row.source_id);

  const result = new Map<string, SourceResearch>();
  for (const source of sources) {
    const counts = countsBySource.get(source.sourceId);
    const summary = {
      total: counts?.total ?? 0,
      toReview: counts?.to_review ?? 0,
      accepted: counts?.accepted ?? 0,
      rejected: counts?.rejected ?? 0,
    };
    const run = latestBySource.get(source.sourceId) ?? null;
    result.set(source.sourceId, {
      state: extractionState({
        sourceStatus: source.status,
        sourceKind: source.kind,
        latestRun: run ? { status: run.status, startedAt: run.startedAt, error: run.error } : null,
        counts: { total: summary.total, toReview: summary.toReview },
      }),
      counts: summary,
    });
  }
  return result;
}

// Data points ------------------------------------------------------------------------

function toSpan(row: Tables["sw_data_point_spans"]["Row"]): DataPointSpan | null {
  if (row.locator_kind === "temporal" && row.start_ms !== null && row.end_ms !== null) {
    return { kind: "temporal", startMs: row.start_ms, endMs: row.end_ms };
  }
  if (row.locator_kind === "document" && row.page_number !== null) {
    return {
      kind: "document",
      pageNumber: row.page_number,
      firstBlockId: row.first_block_id,
      lastBlockId: row.last_block_id,
    };
  }
  return null;
}

/** Spans for a set of data points, chunked so a long list can't overrun the URL. */
async function spansFor(dataPointIds: readonly string[]): Promise<Map<string, DataPointSpan[]>> {
  const supabase = await createClient();
  const rows: Tables["sw_data_point_spans"]["Row"][] = [];
  for (const ids of chunked(dataPointIds)) {
    rows.push(
      ...(unwrapRead(
        await supabase
          .from("sw_data_point_spans")
          .select(
            "id, data_point_id, position, locator_kind, start_ms, end_ms, page_number, first_block_id, last_block_id",
          )
          .in("data_point_id", ids)
          .order("position"),
        "these data points' passages",
      ) ?? []),
    );
  }
  const byPoint = groupBy(rows, (row) => row.data_point_id);
  return new Map(
    [...byPoint.entries()].map(([id, spanRows]) => [
      id,
      spanRows.map(toSpan).filter((span): span is DataPointSpan => span !== null),
    ]),
  );
}

function toDataPoint(row: Tables["sw_data_points"]["Row"], spans: DataPointSpan[]): DataPoint {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceId: row.source_id,
    representationId: row.representation_id,
    questionId: row.question_id,
    relevance: row.relevance,
    storyElement: row.story_element,
    claim: row.claim,
    aiClaim: row.ai_claim,
    speakerId: row.speaker_id,
    kind: row.kind,
    status: row.status,
    promptVersionId: row.prompt_version_id,
    spans,
  };
}

const DATA_POINT_COLUMNS =
  "id, project_id, source_id, representation_id, question_id, relevance, story_element, claim, ai_claim, speaker_id, kind, status, prompt_version_id, run_id, created_at, updated_at";

/**
 * One project's data points for one source, with their spans. Rejected ones are
 * included (a reporter can bring one back); the screen filters. Unordered —
 * callers sort with sortDataPointsBySpan().
 */
export async function listDataPointsForSource(
  projectId: string,
  sourceId: string,
): Promise<DataPoint[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("sw_data_points")
        .select(DATA_POINT_COLUMNS)
        .eq("project_id", projectId)
        .eq("source_id", sourceId)
        .order("created_at")
        .order("id"),
      "this source's data points",
    ) ?? [];
  const spans = await spansFor(rows.map((row) => row.id));
  return rows.map((row) => toDataPoint(row, spans.get(row.id) ?? []));
}

// Prompts -------------------------------------------------------------------------------

export interface LivePrompt {
  /** Null while the slot runs on its built-in text. */
  versionId: string | null;
  version: number | null;
  body: string;
}

/** The text a run of this slot uses now: the published live version, else the built-in. */
export async function getLivePrompt(slot: PromptSlot): Promise<LivePrompt> {
  const definition = promptSlotDefinition(slot);
  if (!definition) throw new Error(`Unknown prompt slot “${slot}”.`);
  const supabase = await createClient();
  const live = unwrapRead(
    await supabase.from("sw_prompt_live").select("version_id").eq("slot", slot).maybeSingle(),
    "the live prompt",
  );
  if (!live) return { versionId: null, version: null, body: definition.builtIn };
  const version = unwrapRead(
    await supabase
      .from("sw_prompt_versions")
      .select("id, version, body")
      .eq("id", live.version_id)
      .maybeSingle(),
    "the live prompt",
  );
  if (!version) return { versionId: null, version: null, body: definition.builtIn };
  return { versionId: version.id, version: version.version, body: version.body };
}

export interface PromptVersionSummary {
  id: string;
  version: number;
  body: string;
  note: string | null;
  createdAt: string;
  createdBy: string;
  accepted: number;
  rejected: number;
  isLive: boolean;
}

/** A slot's published versions, newest first, with the accept rate each has earned. */
export async function listPromptVersions(slot: PromptSlot): Promise<PromptVersionSummary[]> {
  const supabase = await createClient();
  const [versions, live, rates] = await Promise.all([
    supabase
      .from("sw_prompt_versions")
      .select("id, version, body, note, created_at, created_by")
      .eq("slot", slot)
      .order("version", { ascending: false })
      .then((result) => unwrapRead(result, "this prompt's history") ?? []),
    supabase
      .from("sw_prompt_live")
      .select("version_id")
      .eq("slot", slot)
      .maybeSingle()
      .then((result) => unwrapRead(result, "the live prompt")),
    getExtractionAcceptRates(),
  ]);
  return versions.map((row) => ({
    id: row.id,
    version: row.version,
    body: row.body,
    note: row.note,
    createdAt: row.created_at,
    createdBy: row.created_by,
    accepted: slot === "extraction" ? (rates.get(row.id)?.accepted ?? 0) : 0,
    rejected: slot === "extraction" ? (rates.get(row.id)?.rejected ?? 0) : 0,
    isLive: live?.version_id === row.id,
  }));
}

/** Accepted and rejected data points per prompt version; the built-in text is keyed by `null`. */
export async function getExtractionAcceptRates(): Promise<
  Map<string | null, { accepted: number; rejected: number }>
> {
  const supabase = await createClient();
  const rows =
    unwrapRead(await supabase.rpc("sw_extraction_accept_rates"), "the extraction accept rates") ??
    [];
  return new Map(
    rows.map((row) => [row.prompt_version_id, { accepted: row.accepted, rejected: row.rejected }]),
  );
}

/** The signed-in editor's unpublished draft for a slot, if they have one. */
export async function getPromptDraft(
  slot: PromptSlot,
  userId: string,
): Promise<{ body: string; updatedAt: string } | null> {
  const supabase = await createClient();
  const row = unwrapRead(
    await supabase
      .from("sw_prompt_drafts")
      .select("body, updated_at")
      .eq("slot", slot)
      .eq("user_id", userId)
      .maybeSingle(),
    "your draft",
  );
  return row ? { body: row.body, updatedAt: row.updated_at } : null;
}
