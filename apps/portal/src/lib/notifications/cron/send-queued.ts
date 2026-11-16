import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { sendEmail, isEmailSendingConfigured } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { describeFailure } from "@/lib/audience-listening/cron/run-task";
import { notificationEmailText } from "../email-text";

export const MAX_EMAIL_ATTEMPTS = 5;
const BATCH = 25;
const KEEP_DAYS = 90;

/**
 * The scheduled run's two small jobs (docs/notifications-design.md §5).
 *
 * Send queued email: claims up to 25 due rows (a lease, so two overlapping runs cannot send one twice), sends each through the
 * Portal's one sender and records the result; a failure is retried with a growing delay and gives up after five attempts. With email
 * not configured nothing is claimed, so rows wait instead of spending their attempts. Counts only come back: no address, title or body.
 */
export async function sendQueuedEmails(
  db: SupabaseClient<Database>,
): Promise<Record<string, unknown>> {
  if (!isEmailSendingConfigured()) return { skipped: "email_not_configured", sent: 0, failed: 0 };

  const { data: claimed, error } = await db.rpc("notification_claim_emails", { p_limit: BATCH });
  if (error) throw new Error(`Could not claim queued email: ${error.message}`);

  const origin = getSiteUrl();
  let sent = 0;
  let failed = 0;
  for (const row of claimed ?? []) {
    let ok = false;
    let reason: string | null = null;
    try {
      const { subject, text } = notificationEmailText(
        { title: row.notif_title, body: row.notif_body, href: row.notif_href },
        origin,
      );
      const result = await sendEmail({ to: row.to_email, subject, text });
      ok = result.ok;
      if (!result.ok) reason = result.error;
    } catch (caught) {
      reason = describeFailure(caught);
    }
    const { error: finishError } = await db.rpc("notification_finish_email", {
      p_id: row.notification_id,
      p_ok: ok,
      // The provider's message can carry the address; keep a short reason only.
      p_error: ok
        ? null
        : describeFailure(reason ?? "The email could not be sent.").replace(
            /\S+@\S+/g,
            "[address]",
          ),
      p_max_attempts: MAX_EMAIL_ATTEMPTS,
    });
    if (finishError)
      console.error("Notifications: could not record a send", finishError.code ?? "");
    if (ok) sent += 1;
    else failed += 1;
  }
  return { claimed: (claimed ?? []).length, sent, failed };
}

/** Deletes what is older than 90 days, read or not. */
export async function purgeOldNotifications(
  db: SupabaseClient<Database>,
  now: Date,
): Promise<Record<string, unknown>> {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await db
    .from("notification_inbox")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);
  if (error) throw new Error(`Could not clear old notifications: ${error.message}`);
  return { deleted: count ?? 0 };
}
