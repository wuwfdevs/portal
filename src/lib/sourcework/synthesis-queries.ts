import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { formatDuration } from "@/lib/transcription/media";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";
import { chunked } from "./research-queries";
import { isStaleRun, type SynthesisStanding } from "./run-state";
import { parseSynthesisBody, type SynthesisBody } from "./synthesis";

// Reads behind the synthesis (docs/sourcework-analysis-design.md §21). Everything goes through the
// caller's session, so RLS is still the boundary, and a failed read throws rather than rendering as
// an empty page.

/** Findings handed to one synthesis run. Past this the oldest are left out and the page says so. */
export const MAX_SYNTHESIS_FINDINGS = 400;

export interface AcceptedFinding {
  id: string;
  claim: string;
  significance: string | null;
  kind: string;
  questionId: string | null;
  sourceId: string;
  sourceTitle: string;
  speakerId: string | null;
  speakerLabel: string | null;
  /** The first passage the finding rests on. */
  startMs: number | null;
  endMs: number | null;
  page: number | null;
  /** "12:41" into a recording, null for a document. */
  at: string | null;
  updatedAt: string;
}

/**
 * Every accepted finding of a project's current sources, oldest first, with who said it and where.
 * `truncated` is true when there were more than a run can read.
 */
export async function listAcceptedFindings(
  projectId: string,
): Promise<{ findings: AcceptedFinding[]; truncated: boolean }> {
  const supabase = await createClient();
  const links =
    unwrapRead(
      await supabase.from("sw_project_sources").select("source_id").eq("project_id", projectId),
      "this project's sources",
    ) ?? [];
  const sourceIds = links.map((link) => link.source_id);
  if (sourceIds.length === 0) return { findings: [], truncated: false };

  const [pointResult, sourceResult] = await Promise.all([
    supabase
      .from("sw_data_points")
      .select(FINDING_COLUMNS)
      .eq("project_id", projectId)
      .eq("status", "accepted")
      .in("source_id", sourceIds)
      .order("created_at")
      .order("id")
      .limit(MAX_SYNTHESIS_FINDINGS + 1),
    supabase.from("sw_sources").select("id, title").in("id", sourceIds),
  ]);
  const rows = unwrapRead(pointResult, "this project's accepted findings") ?? [];
  const truncated = rows.length > MAX_SYNTHESIS_FINDINGS;
  const points = rows.slice(0, MAX_SYNTHESIS_FINDINGS);
  const titles = new Map(
    (unwrapRead(sourceResult, "this project's source titles") ?? []).map((row) => [
      row.id,
      row.title,
    ]),
  );

  return { truncated, findings: await hydrateFindings(supabase, points, titles) };
}

type Client = Awaited<ReturnType<typeof createClient>>;

interface FindingRow {
  id: string;
  claim: string;
  significance: string | null;
  kind: string;
  question_id: string | null;
  source_id: string;
  speaker_id: string | null;
  updated_at: string;
}

const FINDING_COLUMNS =
  "id, claim, significance, kind, question_id, source_id, speaker_id, updated_at, created_at";

/** Adds each finding's first passage and speaker name. One implementation for every way of loading findings. */
async function hydrateFindings(
  supabase: Client,
  points: readonly FindingRow[],
  titles: ReadonlyMap<string, string>,
): Promise<AcceptedFinding[]> {
  const firstSpan = new Map<
    string,
    { startMs: number | null; endMs: number | null; page: number | null }
  >();
  for (const ids of chunked(points.map((point) => point.id))) {
    const spans =
      unwrapRead(
        await supabase
          .from("sw_data_point_spans")
          .select("data_point_id, position, start_ms, end_ms, page_number")
          .in("data_point_id", ids)
          .order("position"),
        "these findings' passages",
      ) ?? [];
    for (const span of spans) {
      if (!firstSpan.has(span.data_point_id)) {
        firstSpan.set(span.data_point_id, {
          startMs: span.start_ms,
          endMs: span.end_ms,
          page: span.page_number,
        });
      }
    }
  }

  const speakerIds = [
    ...new Set(points.flatMap((point) => (point.speaker_id ? [point.speaker_id] : []))),
  ];
  const speakerLabel = new Map<string, string>();
  for (const ids of chunked(speakerIds)) {
    for (const speaker of unwrapRead(
      await supabase
        .from("tw_speakers")
        .select("id, diarization_label, display_name")
        .in("id", ids),
      "these findings' speakers",
    ) ?? []) {
      speakerLabel.set(
        speaker.id,
        speakerDisplayLabel(speaker.diarization_label, speaker.display_name),
      );
    }
  }

  return points.map((point) => {
    const span = firstSpan.get(point.id);
    return {
      id: point.id,
      claim: point.claim,
      significance: point.significance,
      kind: point.kind,
      questionId: point.question_id,
      sourceId: point.source_id,
      sourceTitle: titles.get(point.source_id) ?? "Source",
      speakerId: point.speaker_id,
      speakerLabel: point.speaker_id ? (speakerLabel.get(point.speaker_id) ?? null) : null,
      startMs: span?.startMs ?? null,
      endMs: span?.endMs ?? null,
      page: span?.page ?? null,
      at: span?.startMs != null ? formatDuration(span.startMs) : null,
      updatedAt: point.updated_at,
    };
  });
}

/**
 * The accepted findings among `ids` (an outline beat's citations), in the order asked. A finding that was
 * rejected or removed since is missing from the result, so a caller can say it was withdrawn.
 */
export async function getFindingsByIds(
  projectId: string,
  ids: readonly string[],
): Promise<AcceptedFinding[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const supabase = await createClient();
  const rows: FindingRow[] = [];
  for (const chunk of chunked(unique)) {
    rows.push(
      ...(unwrapRead(
        await supabase
          .from("sw_data_points")
          .select(FINDING_COLUMNS)
          .eq("project_id", projectId)
          .eq("status", "accepted")
          .in("id", chunk),
        "these findings",
      ) ?? []),
    );
  }
  if (rows.length === 0) return [];
  const sourceIds = [...new Set(rows.map((row) => row.source_id))];
  const titles = new Map(
    (
      unwrapRead(
        await supabase.from("sw_sources").select("id, title").in("id", sourceIds),
        "these findings' sources",
      ) ?? []
    ).map((row) => [row.id, row.title]),
  );
  const hydrated = new Map(
    (await hydrateFindings(supabase, rows, titles)).map((finding) => [finding.id, finding]),
  );
  return unique.flatMap((id) => {
    const finding = hydrated.get(id);
    return finding ? [finding] : [];
  });
}

export interface SynthesisVersionSummary {
  version: number;
  savedVia: "person" | "model";
  createdAt: string;
  runId: string | null;
}

export interface CurrentSynthesis extends SynthesisVersionSummary {
  body: SynthesisBody;
}

/** The synthesis a project is at now, or null when none has been written. */
export async function getCurrentSynthesis(projectId: string): Promise<CurrentSynthesis | null> {
  const supabase = await createClient();
  const head = unwrapRead(
    await supabase
      .from("sw_project_syntheses")
      .select("current_version")
      .eq("project_id", projectId)
      .maybeSingle(),
    "this project's synthesis",
  );
  if (!head || head.current_version < 1) return null;
  return getSynthesisVersion(projectId, head.current_version);
}

export async function getSynthesisVersion(
  projectId: string,
  version: number,
): Promise<CurrentSynthesis | null> {
  const supabase = await createClient();
  const row = unwrapRead(
    await supabase
      .from("sw_project_synthesis_versions")
      .select("version, body, saved_via, created_at, run_id")
      .eq("project_id", projectId)
      .eq("version", version)
      .maybeSingle(),
    "this synthesis",
  );
  if (!row) return null;
  return {
    version: row.version,
    body: parseSynthesisBody(row.body),
    savedVia: row.saved_via === "person" ? "person" : "model",
    createdAt: row.created_at,
    runId: row.run_id,
  };
}

export async function listSynthesisVersions(
  projectId: string,
  limit = 20,
): Promise<SynthesisVersionSummary[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("sw_project_synthesis_versions")
        .select("version, saved_via, created_at, run_id")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(limit),
      "this project's synthesis history",
    ) ?? [];
  return rows.map((row) => ({
    version: row.version,
    savedVia: row.saved_via === "person" ? "person" : "model",
    createdAt: row.created_at,
    runId: row.run_id,
  }));
}

/** Whether a synthesis run is in flight for the project (and not so old it must have died). */
export async function isSynthesisRunning(projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const run = unwrapRead(
    await supabase
      .from("sw_analysis_runs")
      .select("started_at")
      .eq("project_id", projectId)
      .eq("kind", "synthesis")
      .eq("trial", false)
      .eq("status", "running")
      .maybeSingle(),
    "this project's synthesis run",
  );
  if (!run) return false;
  return !isStaleRun(run.started_at);
}

/** The numbers behind the Setup status and the Synthesis tab's badge, without reading any content. */
export async function getSynthesisStanding(projectId: string): Promise<SynthesisStanding> {
  const supabase = await createClient();
  const [accepted, head] = await Promise.all([
    supabase
      .from("sw_data_points")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", "accepted"),
    supabase
      .from("sw_project_syntheses")
      .select("current_version")
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);
  const acceptedFindings =
    unwrapRead({ data: accepted.count, error: accepted.error }, "this project's findings") ?? 0;
  const version = unwrapRead(head, "this project's synthesis")?.current_version ?? 0;
  if (version < 1) return { acceptedFindings, hasSynthesis: false, changedSince: 0 };

  const written = unwrapRead(
    await supabase
      .from("sw_project_synthesis_versions")
      .select("created_at")
      .eq("project_id", projectId)
      .eq("version", version)
      .maybeSingle(),
    "this synthesis",
  );
  if (!written) return { acceptedFindings, hasSynthesis: true, changedSince: 0 };
  const changed = await supabase
    .from("sw_data_points")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "accepted")
    .gt("updated_at", written.created_at);
  return {
    acceptedFindings,
    hasSynthesis: true,
    changedSince:
      unwrapRead({ data: changed.count, error: changed.error }, "this project's findings") ?? 0,
  };
}

/** Titles of sources by id, for a passage in a source that has no accepted finding to borrow a title from. */
export async function getSourceTitles(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const rows = unwrapRead(
    await supabase.from("sw_sources").select("id, title").in("id", unique),
    "these sources",
  );
  return new Map((rows ?? []).map((row) => [row.id, row.title]));
}
