import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ApEventType } from "@/lib/database.types";

/**
 * Records one entry in a submission's staff-visible activity log. Distinct
 * from logAuditEvent() (portal-wide, administrator-only reading) — see
 * design doc §4. Call this after the write it describes succeeds; a failure
 * here is logged but never blocks the caller, the same posture
 * logAuditEvent() takes.
 */
export async function logSubmissionEvent(params: {
  submissionId: string;
  actorId: string;
  eventType: ApEventType;
  note?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("ap_submission_events").insert({
    submission_id: params.submissionId,
    actor_id: params.actorId,
    event_type: params.eventType,
    note: params.note ?? null,
    metadata: params.metadata ?? {},
  });

  if (error) {
    console.error("Failed to write submission activity event", params.eventType, error);
  }
}
