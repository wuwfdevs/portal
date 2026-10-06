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
