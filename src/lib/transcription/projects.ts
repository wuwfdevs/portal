import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type TwProject = Database["public"]["Tables"]["tw_projects"]["Row"];

export interface TranscriptSegment {
  id: string;
  position: number;
  startMs: number;
  endMs: number;
  text: string;
  textEdited: boolean;
  speakerId: string | null;
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
 * Projects visible to the current user, newest first. RLS already scopes
 * this to transcription tool members (see has_transcription_access() in the
 * schema migration) — this is a shared workspace, so every member sees
 * every project, not just their own uploads. `search` does a simple
 * case-insensitive match against title/description; full transcript and
 * clip search lands in a later phase (see design doc §3F / Phase 5).
 */
export async function listProjects(search?: string): Promise<TwProject[]> {
  const supabase = await createClient();
  let query = supabase.from("tw_projects").select("*").order("created_at", { ascending: false });

  const trimmed = search?.trim();
  if (trimmed) {
    const pattern = `%${trimmed.replace(/[%_]/g, (match) => `\\${match}`)}%`;
    query = query.or(`title.ilike.${pattern},description.ilike.${pattern}`);
  }

  const { data } = await query;
  return data ?? [];
}

export async function getProjectById(id: string): Promise<TwProject | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tw_projects").select("*").eq("id", id).maybeSingle();
  return data;
}

/**
 * A project's transcript: ordered segments plus the project's speakers,
 * fetched as two flat queries rather than a Postgrest embedded select,
 * since database.types.ts is hand-written with empty Relationships (see its
 * header comment) and doesn't carry the foreign-key metadata embedded
 * selects rely on for reliable typing. Segments carry the raw speaker_id
 * (not a pre-merged display label) so the correction UI can offer
 * reassignment among the project's actual speaker rows.
 */
export async function getTranscriptForProject(projectId: string): Promise<ProjectTranscript> {
  const supabase = await createClient();
  const [{ data: segments }, { data: speakers }] = await Promise.all([
    supabase
      .from("tw_segments")
      .select("id, position, speaker_id, start_ms, end_ms, text, text_edited")
      .eq("project_id", projectId)
      .order("position"),
    supabase
      .from("tw_speakers")
      .select("id, diarization_label, display_name")
      .eq("project_id", projectId),
  ]);

  return {
    segments: (segments ?? []).map((row) => ({
      id: row.id,
      position: row.position,
      startMs: row.start_ms,
      endMs: row.end_ms,
      text: row.text,
      textEdited: row.text_edited,
      speakerId: row.speaker_id,
    })),
    speakers: (speakers ?? []).map((row) => ({
      id: row.id,
      diarizationLabel: row.diarization_label,
      displayName: row.display_name,
    })),
  };
}
