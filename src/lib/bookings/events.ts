import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Append to the Rates tab's change log. Best-effort, like logAuditEvent():
 * a failure here is logged, never allowed to fail the write it describes.
 */
export async function logRateModelEvent(params: {
  versionId: string | null;
  actorId: string;
  kind: string;
  note: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("bk_rate_model_events").insert({
    version_id: params.versionId,
    actor_id: params.actorId,
    kind: params.kind,
    note: params.note,
    metadata: params.metadata ?? {},
  });
  if (error) console.error("Could not write rate model event", params.kind, error);
}

/**
 * Append to a project's staff-visible timeline (slice 3). Same posture as
 * above: a failure is logged, never allowed to fail the write it describes.
 */
export async function logProjectEvent(params: {
  projectId: string;
  actorId: string;
  kind: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("bk_project_events").insert({
    project_id: params.projectId,
    actor_id: params.actorId,
    kind: params.kind,
    note: params.note ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) console.error("Could not write project event", params.kind, error);
}
