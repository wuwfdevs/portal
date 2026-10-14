"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { actionError, actionOk, type ActionResult } from "@/lib/action-response";
import { uuidParam } from "@/lib/sourcework/route-input";
import { getProjectById } from "@/lib/transcription/projects";
import { getSourceResearch } from "@/lib/sourcework/research-queries";
import { readFormatSpec } from "@/lib/sourcework/piece-formats";
import type { AutopilotSource } from "@/lib/sourcework/autopilot";
import { projectPath } from "@/lib/transcription/links";

// What "Write a story" needs from the server between its steps (docs/sourcework-analysis-design.md §25):
// where each source stands, and a piece to write into. Everything else is a request the person could
// make by hand. Any tool member may; RLS is the boundary.

/** Where each of the project's sources stands: still processing, failed, analyzed, being analyzed. */
export async function getAutopilotSources(input: {
  projectId: string;
}): Promise<ActionResult<{ sources: AutopilotSource[] }>> {
  await assertSourceworkContext();
  const projectId = uuidParam(input.projectId);
  if (!projectId) return actionError("That project doesn't exist.");
  const project = await getProjectById(projectId);
  if (!project) return actionError("That project doesn't exist.");

  const research = await getSourceResearch(
    project.id,
    project.sources.map((entry) => ({
      sourceId: entry.sourceId,
      status: entry.status,
      kind: entry.source.kind,
    })),
  );
  return actionOk({
    sources: project.sources.map((entry) => {
      const state = research.get(entry.sourceId)?.state;
      return {
        id: entry.sourceId,
        title: entry.source.title,
        processing: entry.status === "uploading" || entry.status === "processing",
        failed: entry.status === "failed",
        analyzed: state?.kind === "done",
        analyzing: state?.kind === "running",
      };
    }),
  });
}

/** A blank piece, written to the chosen format, for the run to outline and write into. */
export async function createAutopilotPiece(input: {
  projectId: string;
  formatId: string | null;
}): Promise<ActionResult<{ pieceId: string; version: number }>> {
  const { profile } = await assertSourceworkContext();
  const projectId = uuidParam(input.projectId);
  if (!projectId) return actionError("That project doesn't exist.");
  const supabase = await createClient();

  let formatFields: { format_version_id: string; target_seconds: number } | null = null;
  if (input.formatId) {
    const formatId = uuidParam(input.formatId);
    const format = formatId
      ? await supabase
          .from("sw_piece_formats")
          .select("live_version_id")
          .eq("id", formatId)
          .maybeSingle()
      : null;
    const versionId = format?.data?.live_version_id ?? null;
    const version = versionId
      ? await supabase
          .from("sw_piece_format_versions")
          .select("id, spec")
          .eq("id", versionId)
          .maybeSingle()
      : null;
    const spec = version?.data ? readFormatSpec(version.data.spec) : null;
    if (!version?.data || !spec) return actionError("That format isn't published.");
    formatFields = { format_version_id: version.data.id, target_seconds: spec.targetSeconds };
  }

  const inserted = await supabase
    .from("sw_pieces")
    .insert({ project_id: projectId, created_by: profile.id, ...(formatFields ?? {}) })
    .select("id, current_version")
    .single();
  if (inserted.error || !inserted.data) {
    console.error("Could not create the piece for the story run:", inserted.error);
    return actionError("Couldn't start a piece. Try again.");
  }
  revalidatePath(projectPath(projectId, "pieces"));
  return actionOk({ pieceId: inserted.data.id, version: inserted.data.current_version });
}
