import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { TRANSCRIPTION_MEDIA_BUCKET } from "@/lib/transcription/media";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Sweeps a source's Storage objects (the original file — audio/video or
 * document, sourceObjectPath doesn't distinguish — plus any rendered
 * excerpt exports under `<source id>/excerpts/`) and deletes its sw_sources
 * row. Every other table keyed off a source (representations, segments,
 * speakers, chunks, excerpts, document pages/blocks) cascades from that row
 * at the database level; this only has to reach what the database can't —
 * Storage.
 *
 * Callers decide *whether* a source should be purged (deleteProject's
 * cascade only for a source no other project still references;
 * deleteSourceEntirely always, since deleting a source affects every
 * project that references it) — this just performs the deletion once
 * decided, so the two call sites can't drift on what "clean up a source"
 * means. That drift is exactly what happened before this was extracted:
 * deleteProject's cascade only ever ran the old inline version of this for
 * a project's *primary* source, silently leaving any additional attached
 * source — of any kind, not only non-audio ones — orphaned in both the
 * database and Storage whenever a project referenced more than one.
 */
export async function purgeSource(supabase: Client, sourceId: string): Promise<{ error?: string }> {
  const { data: source } = await supabase
    .from("sw_sources")
    .select("original_storage_path")
    .eq("id", sourceId)
    .maybeSingle();

  const { data: exportedClips } = await supabase.storage
    .from(TRANSCRIPTION_MEDIA_BUCKET)
    .list(`${sourceId}/excerpts`);

  const objectPaths = [
    ...(source?.original_storage_path ? [source.original_storage_path] : []),
    ...(exportedClips ?? []).map((object) => `${sourceId}/excerpts/${object.name}`),
  ];
  if (objectPaths.length > 0) {
    await supabase.storage.from(TRANSCRIPTION_MEDIA_BUCKET).remove(objectPaths);
  }

  const { error } = await supabase.from("sw_sources").delete().eq("id", sourceId);
  if (error) return { error: "Could not delete this source." };
  return {};
}
