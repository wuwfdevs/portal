import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";

export type TwProject = Database["public"]["Tables"]["tw_projects"]["Row"];

export interface TranscriptSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerLabel: string;
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
 * Ordered, read-only transcript for a project — Phase 2 has no editing yet
 * (Phase 3). Two flat queries joined in JS rather than a Postgrest embedded
 * select, since database.types.ts is hand-written with empty Relationships
 * (see its header comment) and doesn't carry the foreign-key metadata
 * embedded selects rely on for reliable typing.
 */
export async function listSegmentsForProject(projectId: string): Promise<TranscriptSegment[]> {
  const supabase = await createClient();
  const [{ data: segments }, { data: speakers }] = await Promise.all([
    supabase
      .from("tw_segments")
      .select("id, speaker_id, start_ms, end_ms, text")
      .eq("project_id", projectId)
      .order("position"),
    supabase
      .from("tw_speakers")
      .select("id, diarization_label, display_name")
      .eq("project_id", projectId),
  ]);

  const speakerById = new Map((speakers ?? []).map((s) => [s.id, s]));

  return (segments ?? []).map((row) => {
    const speaker = row.speaker_id ? speakerById.get(row.speaker_id) : undefined;
    return {
      id: row.id,
      startMs: row.start_ms,
      endMs: row.end_ms,
      text: row.text,
      speakerLabel: speaker
        ? speakerDisplayLabel(speaker.diarization_label, speaker.display_name)
        : "Unknown speaker",
    };
  });
}
