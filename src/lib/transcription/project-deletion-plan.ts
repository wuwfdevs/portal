import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { DeletionSource } from "@/lib/transcription/project-deletion";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * The facts `describeProjectDeletion` needs for one project: each source, how
 * many excerpts it has, and whether another project also references it. One
 * query finds the shared sources; excerpt counts are head counts per source
 * that would actually be removed, so no read can run into PostgREST's row cap.
 */
export async function loadDeletionSources(
  supabase: Client,
  projectId: string,
  sources: { id: string; title: string; kind: DeletionSource["kind"] }[],
): Promise<DeletionSource[]> {
  if (sources.length === 0) return [];
  const ids = sources.map((source) => source.id);

  const others =
    unwrapRead(
      await supabase
        .from("sw_project_sources")
        .select("source_id")
        .in("source_id", ids)
        .neq("project_id", projectId),
      "which sources other projects use",
    ) ?? [];
  const shared = new Set(others.map((row) => row.source_id));

  return Promise.all(
    sources.map(async (source) => {
      const usedElsewhere = shared.has(source.id);
      let excerptCount = 0;
      if (!usedElsewhere) {
        const result = await supabase
          .from("sw_source_excerpts")
          .select("id", { count: "exact", head: true })
          .eq("source_id", source.id);
        unwrapRead(result, "this source's excerpts");
        excerptCount = result.count ?? 0;
      }
      return { ...source, excerptCount, usedElsewhere };
    }),
  );
}
