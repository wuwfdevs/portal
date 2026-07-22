import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type TwProject = Database["public"]["Tables"]["tw_projects"]["Row"];

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
