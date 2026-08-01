import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { parseWords } from "@/lib/transcription/transcript";
import type { TranscribedWord } from "@/lib/transcription/asr-provider";
import type { Database, SwSourceKind } from "@/lib/database.types";
import { computeProjectStatus, type ProjectStatus } from "@/lib/transcription/status";

export type TwProject = Database["public"]["Tables"]["tw_projects"]["Row"];
export type SwSource = Database["public"]["Tables"]["sw_sources"]["Row"];
export type SwRepresentation = Database["public"]["Tables"]["sw_representations"]["Row"];

// computeProjectStatus/processingLabel/ProjectStatus live in ./status (pure,
// no "server-only") so client components can import them without pulling in
// this module's server-only data access — see that file's header comment.
// Re-exported here so every existing server-side import of these three from
// "@/lib/transcription/projects" keeps working unchanged.
export { computeProjectStatus, processingLabel, type ProjectStatus } from "@/lib/transcription/status";

export interface ProjectSourceRef {
  sourceId: string;
  representationId: string | null;
}

/** One source a project references, with its own status — see listSourcesForProject. */
export interface ProjectSourceSummary {
  sourceId: string;
  source: SwSource;
  transcript: SwRepresentation | null;
  status: ProjectStatus;
  addedAt: string;
}

const STATUS_SEVERITY: Record<ProjectStatus, number> = {
  failed: 3,
  uploading: 2,
  processing: 1,
  ready: 0,
};

/**
 * Collapses several sources' independent statuses into the one badge a
 * multi-source project's header shows — worst case wins, so a project isn't
 * reported "ready" while one of its sources is still failing or uploading.
 */
export function computeAggregateProjectStatus(statuses: ProjectStatus[]): ProjectStatus {
  if (statuses.length === 0) return "uploading";
  return statuses.reduce((worst, status) =>
    STATUS_SEVERITY[status] > STATUS_SEVERITY[worst] ? status : worst,
  );
}

/**
 * Every source a project references, oldest-attached first (so index 0 is
 * always the same "primary" source getPrimarySourceForProject picks) — what
 * the workspace's source pill row and the project detail header are built
 * from.
 */
export async function listSourcesForProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<ProjectSourceSummary[]> {
  const links =
    unwrapRead(
      await supabase
        .from("sw_project_sources")
        .select("source_id, added_at")
        .eq("project_id", projectId)
        .order("added_at"),
      "this project's sources",
    ) ?? [];
  if (links.length === 0) return [];

  const sourceIds = links.map((link) => link.source_id);
  const sources =
    unwrapRead(
      await supabase.from("sw_sources").select("*").in("id", sourceIds),
      "this project's sources",
    ) ?? [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  // A source's *primary* representation — its transcript if audio/video,
  // its document_text extraction if a document (docs/sourcework-design.md
  // §8.9). A source only ever has one of these today; Phase 6+ chains
  // (translation, etc.) are a later representation, not this one.
  const representations =
    unwrapRead(
      await supabase
        .from("sw_representations")
        .select("*")
        .in("source_id", sourceIds)
        .in("kind", ["transcript", "document_text"]),
      "this project's transcripts",
    ) ?? [];
  const transcriptBySourceId = new Map(representations.map((r) => [r.source_id, r]));

  const summaries: ProjectSourceSummary[] = [];
  for (const link of links) {
    const source = sourceById.get(link.source_id);
    if (!source) continue; // RLS-invisible or mid-delete; skip rather than throw
    const transcript = transcriptBySourceId.get(link.source_id) ?? null;
    summaries.push({
      sourceId: link.source_id,
      source,
      transcript,
      status: computeProjectStatus(source, transcript),
      addedAt: link.added_at,
    });
  }
  return summaries;
}

/**
 * The source a project's workspace screens actually operate on. Every
 * project created through this tool's UI references exactly one source
 * today (see docs/sourcework-design.md) — "primary" just means "earliest
 * referenced", for the day a project references more than one.
 */
export async function getPrimarySourceForProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<ProjectSourceRef | null> {
  const { data: link } = await supabase
    .from("sw_project_sources")
    .select("source_id")
    .eq("project_id", projectId)
    .order("added_at")
    .limit(1)
    .maybeSingle();
  if (!link) return null;
  return getSourceRef(supabase, link.source_id);
}

/** Resolves a specific source's primary representation (transcript, or document_text — see docs/sourcework-design.md §8.9) — the explicit-id counterpart to getPrimarySourceForProject, for call sites (like retrying a non-primary source) that already know which source they mean. */
export async function getSourceRef(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceId: string,
): Promise<ProjectSourceRef> {
  const { data: representation } = await supabase
    .from("sw_representations")
    .select("id")
    .eq("source_id", sourceId)
    .in("kind", ["transcript", "document_text"])
    .maybeSingle();

  return { sourceId, representationId: representation?.id ?? null };
}

export interface ProjectDetail {
  id: string;
  title: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  /** Every source this project references, oldest first. Almost always one — see docs/sourcework-design.md §7. */
  sources: ProjectSourceSummary[];
  /** Worst-case status across every attached source — see computeAggregateProjectStatus. */
  status: ProjectStatus;
}

export interface ProjectListRow {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  /** The primary source's kind — audio/video card fields vs. document ones (page count, not duration) key off this. */
  sourceKind: SwSourceKind | null;
  interviewDate: string | null;
  durationMs: number | null;
  sizeBytes: number | null;
  pageCount: number | null;
  status: ProjectStatus;
}

export interface TranscriptSegment {
  id: string;
  position: number;
  startMs: number;
  endMs: number;
  text: string;
  textEdited: boolean;
  speakerId: string | null;
  /** ASR word timings, what text selection snaps clip boundaries to. */
  words: TranscribedWord[];
}

export interface TranscriptSpeaker {
  id: string;
  diarizationLabel: string;
  displayName: string | null;
}

export interface ProjectTranscript {
  segments: TranscriptSegment[];
  speakers: TranscriptSpeaker[];
}

/**
 * Projects visible to the current user, newest first, with the source/
 * transcript fields the list screen shows. RLS already scopes this to
 * transcription tool members — this is a shared workspace, so every member
 * sees every project, not just their own uploads.
 *
 * Flat queries rather than an embedded select, same reason as everywhere
 * else in this module: database.types.ts is hand-written with empty
 * Relationships (see its header comment).
 */
export async function listProjects(): Promise<ProjectListRow[]> {
  const supabase = await createClient();

  const projects =
    unwrapRead(
      await supabase
        .from("tw_projects")
        .select("id, title, description, created_at")
        .order("created_at", { ascending: false }),
      "the project list",
    ) ?? [];
  if (projects.length === 0) return [];

  const links =
    unwrapRead(
      await supabase
        .from("sw_project_sources")
        .select("project_id, source_id, added_at")
        .in(
          "project_id",
          projects.map((p) => p.id),
        )
        .order("added_at"),
      "the project list's sources",
    ) ?? [];
  const primarySourceIdByProject = new Map<string, string>();
  for (const link of links) {
    if (!primarySourceIdByProject.has(link.project_id)) {
      primarySourceIdByProject.set(link.project_id, link.source_id);
    }
  }

  const sourceIds = [...new Set(links.map((l) => l.source_id))];
  const sources =
    sourceIds.length === 0
      ? []
      : (unwrapRead(
          await supabase
            .from("sw_sources")
            .select("id, kind, interview_date, status, original_size_bytes, original_duration_ms, page_count")
            .in("id", sourceIds),
          "the project list's sources",
        ) ?? []);
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  const transcripts =
    sourceIds.length === 0
      ? []
      : (unwrapRead(
          await supabase
            .from("sw_representations")
            .select("id, source_id, status")
            .in("source_id", sourceIds)
            .in("kind", ["transcript", "document_text"]),
          "the project list's transcripts",
        ) ?? []);
  const transcriptBySourceId = new Map(transcripts.map((t) => [t.source_id, t]));

  return projects.map((project) => {
    const sourceId = primarySourceIdByProject.get(project.id) ?? null;
    const source = sourceId ? (sourceById.get(sourceId) ?? null) : null;
    const transcript = sourceId ? (transcriptBySourceId.get(sourceId) ?? null) : null;
    return {
      id: project.id,
      title: project.title,
      description: project.description,
      createdAt: project.created_at,
      sourceKind: source?.kind ?? null,
      interviewDate: source?.interview_date ?? null,
      durationMs: source?.original_duration_ms ?? null,
      sizeBytes: source?.original_size_bytes ?? null,
      pageCount: source?.page_count ?? null,
      status: computeProjectStatus(source, transcript),
    };
  });
}

export async function getProjectById(id: string): Promise<ProjectDetail | null> {
  const supabase = await createClient();
  const project = unwrapRead(
    await supabase
      .from("tw_projects")
      .select("id, title, description, created_by, created_at")
      .eq("id", id)
      .maybeSingle(),
    "this project",
  );
  if (!project) return null;

  const sources = await listSourcesForProject(supabase, id);

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    createdBy: project.created_by,
    createdAt: project.created_at,
    sources,
    status: computeAggregateProjectStatus(sources.map((s) => s.status)),
  };
}

/** The inverse of getPrimarySourceForProject — used by excerpt/clip code, which only naturally has a source id. */
export async function getPrimaryProjectIdForSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("sw_project_sources")
    .select("project_id")
    .eq("source_id", sourceId)
    .order("added_at")
    .limit(1)
    .maybeSingle();
  return data?.project_id ?? null;
}

/**
 * Every project that references a source, not just the earliest-attached
 * one — what a source-scoped write (an excerpt, a correction) needs to
 * revalidate, since a shared source's clips/transcript are reachable from
 * every project that attached it, not only the first.
 */
export async function listProjectIdsForSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("sw_project_sources")
    .select("project_id")
    .eq("source_id", sourceId);
  return (data ?? []).map((row) => row.project_id);
}

export interface SourceLibraryRow {
  id: string;
  kind: SwSource["kind"];
  title: string;
  createdAt: string;
  interviewDate: string | null;
  durationMs: number | null;
  pageCount: number | null;
  status: ProjectStatus;
  /** How many projects reference this source — see sw_project_sources. */
  projectCount: number;
}

/**
 * Every source visible to the caller, newest first — the Source Library's
 * browse surface (docs/sourcework-design.md §7.2). Independent of any one
 * project: a source shows up here whether it's attached to zero, one, or
 * several projects.
 */
export async function listSources(): Promise<SourceLibraryRow[]> {
  const supabase = await createClient();

  const sources =
    unwrapRead(
      await supabase
        .from("sw_sources")
        .select("id, kind, title, interview_date, status, original_duration_ms, page_count, created_at")
        .order("created_at", { ascending: false }),
      "the source library",
    ) ?? [];
  if (sources.length === 0) return [];

  const sourceIds = sources.map((s) => s.id);
  const [transcriptResult, linkResult] = await Promise.all([
    supabase
      .from("sw_representations")
      .select("source_id, status")
      .in("source_id", sourceIds)
      .in("kind", ["transcript", "document_text"]),
    supabase.from("sw_project_sources").select("source_id").in("source_id", sourceIds),
  ]);
  const transcripts = unwrapRead(transcriptResult, "the source library's transcripts") ?? [];
  const transcriptStatusBySourceId = new Map(transcripts.map((t) => [t.source_id, t.status]));

  const links = unwrapRead(linkResult, "the source library's project counts") ?? [];
  const projectCountBySourceId = new Map<string, number>();
  for (const link of links) {
    projectCountBySourceId.set(
      link.source_id,
      (projectCountBySourceId.get(link.source_id) ?? 0) + 1,
    );
  }

  return sources.map((source) => {
    const transcriptStatus = transcriptStatusBySourceId.get(source.id);
    return {
      id: source.id,
      kind: source.kind,
      title: source.title,
      createdAt: source.created_at,
      interviewDate: source.interview_date,
      durationMs: source.original_duration_ms,
      pageCount: source.page_count,
      status: computeProjectStatus(
        { status: source.status },
        transcriptStatus ? { status: transcriptStatus } : null,
      ),
      projectCount: projectCountBySourceId.get(source.id) ?? 0,
    };
  });
}

export interface SourceDetail {
  id: string;
  kind: SwSource["kind"];
  title: string;
  interviewDate: string | null;
  /** The same four states the project workspace shows, derived from the source plus its transcript — see computeProjectStatus. */
  status: ProjectStatus;
  errorMessage: string | null;
  durationMs: number | null;
  sizeBytes: number | null;
  pageCount: number | null;
  createdAt: string;
  originalStoragePath: string | null;
  originalContentType: string | null;
  /** This source's primary representation (transcript, or document_text), if processing has started — the workspace pane keys off its id and status. */
  transcript: SwRepresentation | null;
  /** Every project that references this source. */
  projects: { id: string; title: string }[];
}

/**
 * One source, independent of any project — Source Detail's data
 * (docs/sourcework-design.md §7.2). Excerpts for this source are fetched
 * separately via listExcerptsForSource, matching how the project workspace
 * already keeps clips separate from project/transcript reads.
 */
export async function getSourceDetail(sourceId: string): Promise<SourceDetail | null> {
  const supabase = await createClient();

  const source = unwrapRead(
    await supabase.from("sw_sources").select("*").eq("id", sourceId).maybeSingle(),
    "this source",
  );
  if (!source) return null;

  const transcript =
    unwrapRead(
      await supabase
        .from("sw_representations")
        .select("*")
        .eq("source_id", sourceId)
        .in("kind", ["transcript", "document_text"])
        .maybeSingle(),
      "this source's transcript",
    ) ?? null;

  const links =
    unwrapRead(
      await supabase.from("sw_project_sources").select("project_id").eq("source_id", sourceId),
      "this source's projects",
    ) ?? [];
  const projectIds = [...new Set(links.map((l) => l.project_id))];
  const projects =
    projectIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("tw_projects").select("id, title").in("id", projectIds),
          "this source's projects",
        ) ?? []);

  return {
    id: source.id,
    kind: source.kind,
    title: source.title,
    interviewDate: source.interview_date,
    status: computeProjectStatus(source, transcript),
    errorMessage: source.error_message,
    durationMs: source.original_duration_ms,
    sizeBytes: source.original_size_bytes,
    pageCount: source.page_count,
    createdAt: source.created_at,
    originalStoragePath: source.original_storage_path,
    originalContentType: source.original_content_type,
    transcript,
    projects,
  };
}

/**
 * A transcript representation's content: ordered segments plus its speakers.
 * Segments carry the raw speaker_id (not a pre-merged display label) so the
 * correction UI can offer reassignment among the representation's actual
 * speaker rows.
 */
export async function getTranscriptForRepresentation(
  representationId: string,
): Promise<ProjectTranscript> {
  const supabase = await createClient();
  const [segmentResult, speakerResult] = await Promise.all([
    supabase
      .from("tw_segments")
      .select("id, position, speaker_id, start_ms, end_ms, text, text_edited, words")
      .eq("representation_id", representationId)
      .order("position"),
    supabase
      .from("tw_speakers")
      .select("id, diarization_label, display_name")
      .eq("representation_id", representationId),
  ]);

  const segments = unwrapRead(segmentResult, "this transcript");
  const speakers = unwrapRead(speakerResult, "this project's speakers");

  return {
    segments: (segments ?? []).map((row) => ({
      id: row.id,
      position: row.position,
      startMs: row.start_ms,
      endMs: row.end_ms,
      text: row.text,
      textEdited: row.text_edited,
      speakerId: row.speaker_id,
      words: parseWords(row.words),
    })),
    speakers: (speakers ?? []).map((row) => ({
      id: row.id,
      diarizationLabel: row.diarization_label,
      displayName: row.display_name,
    })),
  };
}
