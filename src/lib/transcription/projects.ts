import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { parseWords } from "@/lib/transcription/transcript";
import type { TranscribedWord } from "@/lib/transcription/asr-provider";
import type { Database } from "@/lib/database.types";

export type TwProject = Database["public"]["Tables"]["tw_projects"]["Row"];
export type SwSource = Database["public"]["Tables"]["sw_sources"]["Row"];
export type SwRepresentation = Database["public"]["Tables"]["sw_representations"]["Row"];

/** The same four states tw_projects.status used to carry, now derived from a source + its transcript representation. */
export type ProjectStatus = "uploading" | "processing" | "ready" | "failed";

/**
 * Collapses a source's upload status and its transcript representation's
 * status into the one status the workspace UI has always shown. A project
 * can (eventually) reference more than one source, but every screen that
 * shows a single status is still looking at one source's worth of work —
 * see docs/sourcework-design.md.
 */
export function computeProjectStatus(
  source: Pick<SwSource, "status"> | null,
  transcript: Pick<SwRepresentation, "status"> | null,
): ProjectStatus {
  if (!source || source.status === "uploading") return "uploading";
  if (source.status === "failed") return "failed";
  if (!transcript || transcript.status === "pending") return "processing";
  if (transcript.status === "processing") return "processing";
  return transcript.status; // 'ready' | 'failed'
}

export interface ProjectSourceRef {
  sourceId: string;
  representationId: string | null;
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

  const { data: representation } = await supabase
    .from("sw_representations")
    .select("id")
    .eq("source_id", link.source_id)
    .eq("kind", "transcript")
    .maybeSingle();

  return { sourceId: link.source_id, representationId: representation?.id ?? null };
}

export interface ProjectDetail {
  id: string;
  title: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  source: SwSource | null;
  transcript: SwRepresentation | null;
  status: ProjectStatus;
}

export interface ProjectListRow {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  interviewDate: string | null;
  durationMs: number | null;
  sizeBytes: number | null;
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
            .select("id, interview_date, status, original_size_bytes, original_duration_ms")
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
            .eq("kind", "transcript"),
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
      interviewDate: source?.interview_date ?? null,
      durationMs: source?.original_duration_ms ?? null,
      sizeBytes: source?.original_size_bytes ?? null,
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

  const ref = await getPrimarySourceForProject(supabase, id);
  const source = ref
    ? unwrapRead(
        await supabase.from("sw_sources").select("*").eq("id", ref.sourceId).maybeSingle(),
        "this project's source",
      )
    : null;
  const transcript = ref?.representationId
    ? unwrapRead(
        await supabase
          .from("sw_representations")
          .select("*")
          .eq("id", ref.representationId)
          .maybeSingle(),
        "this project's transcript",
      )
    : null;

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    createdBy: project.created_by,
    createdAt: project.created_at,
    source,
    transcript,
    status: computeProjectStatus(source, transcript),
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
