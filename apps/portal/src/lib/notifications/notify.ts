import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantRequiredForTool } from "@/lib/tool-access-rules";
import { safeLocalPath } from "@/lib/safe-path";
import { getNotificationType, type NotificationTypeKey } from "./catalog";
import { canOpenTool, planDeliveries, type RecipientFacts } from "./plan";
import type { StoredPreference } from "./preferences";
import { sendQueuedEmails } from "./cron/send-queued";

export interface NotifyInput {
  type: NotificationTypeKey;
  /**
   * Profile ids of the people this event concerns, worked out by the tool that raises it (a request's author, a project's owner, the
   * holders of a role). Never "everyone who can open the tool": notify() does not widen an audience, it only narrows it.
   */
  recipients: readonly string[];
  /** The person who did the thing; never told of their own action. */
  actorId?: string | null;
  title: string;
  body?: string;
  /** A local path ("/roadmap/<id>"); anything else is stored as none. */
  href?: string | null;
  /** A repeated raise with the same key for the same person does nothing. */
  dedupeKey?: string;
}

const TITLE_MAX = 200;
const BODY_MAX = 2000;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Tells people about an event (docs/notifications-design.md §4): who is told and where comes from the catalog, each person's
 * preferences and whether they can open the tool; the Notification Center row is written now and the email is queued, then sent right
 * after the response (and, failing that, by the scheduled sweep in api/cron/notifications).
 *
 * Best effort and never throws: a failure is logged (the type and a count, never the title, body or an address) and the action that
 * raised the event goes on, as `notifyHostRequest` does. Uses the service client because the recipient is usually not the person acting
 * and no signed-in policy lets one person write another's row.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const def = getNotificationType(input.type);
    if (!def) {
      console.error("Notifications: unknown type", input.type);
      return;
    }
    const ids = [...new Set(input.recipients)];
    if (ids.length === 0) return;

    const db = createAdminClient();

    const [
      { data: profiles, error: profilesError },
      { data: tool, error: toolError },
      { data: prefs, error: prefsError },
    ] = await Promise.all([
      db.from("profiles").select("id, account_status").in("id", ids),
      db
        .from("tools")
        .select("id, enabled, status, default_access")
        .eq("key", def.toolKey)
        .maybeSingle(),
      db
        .from("notification_preferences")
        .select("user_id, type, in_app, email")
        .eq("type", def.key)
        .in("user_id", ids),
    ]);
    if (profilesError || toolError || prefsError) {
      console.error("Notifications: could not read who to tell", input.type);
      return;
    }
    if (!tool) return;

    const grantRequired = grantRequiredForTool(tool);
    let granted = new Set<string>();
    if (tool.enabled && grantRequired) {
      const { data: grants, error: grantsError } = await db
        .from("tool_access")
        .select("user_id")
        .eq("tool_id", tool.id)
        .is("revoked_at", null)
        .in("user_id", ids);
      if (grantsError) {
        console.error("Notifications: could not read who can open the tool", input.type);
        return;
      }
      granted = new Set((grants ?? []).map((row) => row.user_id));
    }

    const storedBy = new Map<string, StoredPreference>(
      (prefs ?? []).map((row) => [
        row.user_id,
        { type: row.type, in_app: row.in_app, email: row.email },
      ]),
    );
    const facts: RecipientFacts[] = (profiles ?? []).map((profile) => ({
      id: profile.id,
      active: profile.account_status === "active",
      canOpenTool: canOpenTool({
        toolEnabled: tool.enabled,
        grantRequired,
        hasGrant: granted.has(profile.id),
      }),
      stored: storedBy.get(profile.id),
    }));

    const plan = planDeliveries(def, facts, input.actorId ?? null);
    if (plan.length === 0) return;

    const href = input.href ? safeLocalPath(input.href, "") || null : null;
    const rows = plan.map((delivery) => ({
      recipient_id: delivery.recipientId,
      type: def.key,
      title: clip(input.title.trim() || def.label, TITLE_MAX),
      body: clip((input.body ?? "").trim(), BODY_MAX),
      href,
      in_app: delivery.inApp,
      dedupe_key: input.dedupeKey ?? null,
      email_state: delivery.email ? ("pending" as const) : ("none" as const),
    }));

    const { error } = await db
      .from("notification_inbox")
      .upsert(rows, { onConflict: "recipient_id,dedupe_key", ignoreDuplicates: true });
    if (error) {
      console.error("Notifications: could not save", input.type, error.code ?? "");
      return;
    }

    // Email goes out now, right after the response, not at the next scheduled run: the row is already queued, and the claim's lease
    // means this and the scheduled sweep can never send the same one twice. If there is no request to hang the work on (a scheduled
    // task or a webhook raised the event) the sweep sends it a few minutes later instead.
    if (plan.some((delivery) => delivery.email)) {
      try {
        after(async () => {
          try {
            await sendQueuedEmails(db);
          } catch (caught) {
            console.error(
              "Notifications: immediate send failed",
              caught instanceof Error ? caught.name : "unknown error",
            );
          }
        });
      } catch {
        // No request scope: the scheduled sweep sends it.
      }
    }
  } catch (error) {
    console.error(
      "Notifications: could not raise",
      input.type,
      error instanceof Error ? error.name : "unknown error",
    );
  }
}
