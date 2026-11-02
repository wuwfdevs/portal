import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Records a privileged action. Call this from server actions immediately
 * after the action succeeds — never before, and never on the client.
 * Writes as the calling administrator, so it is itself subject to the
 * audit_events RLS policy (administrators only, actor_id must match caller).
 */
export async function logAuditEvent(params: {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("audit_events").insert({
    actor_id: params.actorId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    metadata: params.metadata ?? {},
  });

  if (error) {
    // Audit logging failure shouldn't be silently swallowed, but it also
    // shouldn't take down an otherwise-successful admin action.
    console.error("Failed to write audit event", params.action, error);
  }
}
