import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { sendAfterLinkWith } from "@/lib/audience-listening/after-link-send";
import { sendConversationAs } from "@/lib/audience-listening/conversation-handoff";
import { askDigestEmailText, digestHasNews, parseNotifyAddress, purgeReminderEmailText, weeklyDue } from "@/lib/audience-listening/notify-text";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { ownerMayRun } from "./owner-access";
import type { Task, TaskLog, TaskOutcome } from "./run-task";

type Admin = ReturnType<typeof createAdminClient>;

/** How many recordings one run joins and sends: each is an ffmpeg job, and the route has five minutes. */
const HANDOFFS_PER_RUN = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function must<T>(result: { data: T; error: { code?: string; message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.code ?? result.error.message}`);
  return result.data;
}

/** Records each task in `al_job_runs`. */
export function jobLog(db: Admin): TaskLog {
  return {
    async begin(task) {
      const { data, error } = await db.from("al_job_runs").insert({ task }).select("id").single();
      if (error) {
        console.error("Listening: could not start a job record:", error.code);
        return null;
      }
      return (data as { id: string }).id;
    },
    async end(id, outcome: TaskOutcome) {
      if (!id) return;
      const { error } = await db
        .from("al_job_runs")
        .update({ finished_at: new Date().toISOString(), ok: outcome.ok, summary: outcome.summary, error: outcome.error ?? null })
        .eq("id", id);
      if (error) console.error("Listening: could not finish a job record:", error.code);
    },
  };
}

/** Whether `userId` may be the person Sourcework records work as: the same rule as `canUseTool`, read with the service client. */
async function ownerMaySourcework(db: Admin, userId: string, cache: Map<string, boolean>): Promise<boolean> {
  const known = cache.get(userId);
  if (known !== undefined) return known;
  const tool = must(await db.from("tools").select("id, enabled, default_access").eq("key", "transcription").maybeSingle(), "read the Sourcework tool");
  const profile = must(await db.from("profiles").select("account_status").eq("id", userId).maybeSingle(), "read the campaign owner");
  let hasGrant = false;
  if (tool) {
    const grants = must(await db.from("tool_access").select("id").eq("user_id", userId).eq("tool_id", tool.id).is("revoked_at", null).limit(1), "read the owner's grant");
    hasGrant = (grants ?? []).length > 0;
  }
  const allowed = ownerMayRun({
    toolEnabled: tool?.enabled === true,
    toolDefaultAccess: tool?.default_access ?? null,
    profileActive: profile?.account_status === "active",
    hasGrant,
  });
  cache.set(userId, allowed);
  return allowed;
}

/** The campaign's owner for each of these events, by event id. */
async function ownersByEvent(db: Admin, eventIds: string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (eventIds.length === 0) return result;
  const events = must(await db.from("al_events").select("id, campaign_id").in("id", eventIds), "read the events") ?? [];
  const campaignIds = [...new Set(events.map((e) => e.campaign_id))];
  const campaigns = campaignIds.length ? must(await db.from("al_campaigns").select("id, owner_id").in("id", campaignIds), "read the campaigns") ?? [] : [];
  const ownerOf = new Map(campaigns.map((c) => [c.id, c.owner_id]));
  for (const e of events) result.set(e.id, ownerOf.get(e.campaign_id) ?? null);
  return result;
}

/**
 * Conversations that are whole but nobody has sent to Sourcework are sent, as the campaign's owner. A coordinator's button does the
 * same thing; this is only the nobody-pressed-it case. A conversation whose owner cannot use Sourcework is counted and left for a person.
 */
function handoffTask(db: Admin, now: Date): Task {
  return {
    name: "send-to-sourcework",
    async run() {
      const since = new Date(now.getTime() - 30 * DAY_MS).toISOString();
      const settled = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
      const conversations =
        must(
          await db
            .from("al_conversations")
            .select("id, event_id")
            .in("status", ["complete", "sent"])
            .is("sourcework_source_id", null)
            .gt("created_at", since)
            .lt("updated_at", settled)
            .order("updated_at", { ascending: true })
            .limit(25),
          "find recordings to send",
        ) ?? [];
      const owners = await ownersByEvent(db, [...new Set(conversations.map((c) => c.event_id))]);
      const cache = new Map<string, boolean>();
      let sent = 0;
      let failed = 0;
      let needsPerson = 0;
      let attempted = 0;
      for (const conversation of conversations) {
        const owner = owners.get(conversation.event_id) ?? null;
        if (!owner || !(await ownerMaySourcework(db, owner, cache))) {
          needsPerson += 1;
          continue;
        }
        if (attempted >= HANDOFFS_PER_RUN) continue;
        attempted += 1;
        const result = await sendConversationAs(db, owner, conversation.id);
        if (result.ok) sent += 1;
        else {
          failed += 1;
          console.error("Listening: a scheduled hand-off did not finish:", result.error.slice(0, 200));
        }
      }
      return { waiting: conversations.length, sent, failed, needs_a_person: needsPerson };
    },
  };
}

/** Emails each facilitator their link once the transcript of their table is ready. */
function afterLinksTask(db: Admin, now: Date): Task {
  return {
    name: "email-after-links",
    async run() {
      const conversations =
        must(
          await db
            .from("al_conversations")
            .select("table_id, event_id, sourcework_source_id")
            .in("status", ["transcribing", "complete"])
            .not("sourcework_source_id", "is", null)
            .limit(100),
          "find tables whose transcript may be ready",
        ) ?? [];
      const sourceIds = conversations.map((c) => c.sourcework_source_id).filter((id): id is string => id !== null);
      if (sourceIds.length === 0) return { ready: 0, sent: 0, failed: 0 };
      const ready =
        must(await db.from("sw_representations").select("source_id").in("source_id", sourceIds).eq("kind", "transcript").eq("status", "ready"), "read the transcripts") ?? [];
      const readySources = new Set(ready.map((r) => r.source_id));
      const tableIds = conversations.filter((c) => c.sourcework_source_id && readySources.has(c.sourcework_source_id)).map((c) => c.table_id);
      if (tableIds.length === 0) return { ready: 0, sent: 0, failed: 0 };
      const tables =
        must(
          await db.from("al_tables").select("id, event_id").in("id", tableIds).not("facilitator_email", "is", null).is("after_link_sent_at", null).limit(50),
          "find facilitators to email",
        ) ?? [];
      let sent = 0;
      let failed = 0;
      for (const table of tables) {
        const result = await sendAfterLinkWith(db, table.event_id, table.id, now);
        if (result.ok) sent += 1;
        else failed += 1;
      }
      return { ready: tables.length, sent, failed };
    },
  };
}

/** Marked lines become Sourcework excerpts once the transcript is ready, made as the campaign's owner. */
function excerptsTask(db: Admin): Task {
  return {
    name: "excerpts-from-marks",
    async run() {
      const marks = must(await db.from("al_highlights").select("conversation_id").is("excerpt_id", null).limit(500), "find marks without excerpts") ?? [];
      const conversationIds = [...new Set(marks.map((m) => m.conversation_id))];
      if (conversationIds.length === 0) return { conversations: 0, excerpts: 0 };
      const conversations =
        must(await db.from("al_conversations").select("id, event_id").in("id", conversationIds).not("sourcework_source_id", "is", null), "read the conversations") ?? [];
      const owners = await ownersByEvent(db, [...new Set(conversations.map((c) => c.event_id))]);
      const cache = new Map<string, boolean>();
      let excerpts = 0;
      let skipped = 0;
      for (const conversation of conversations) {
        const owner = owners.get(conversation.event_id) ?? null;
        if (!owner || !(await ownerMaySourcework(db, owner, cache))) {
          skipped += 1;
          continue;
        }
        const made = must(await db.rpc("al_create_excerpts_from_highlights", { p_conversation_id: conversation.id, p_created_by: owner }), "make excerpts");
        excerpts += made ?? 0;
      }
      return { conversations: conversations.length, excerpts, needs_a_person: skipped };
    },
  };
}

function clearEmailsTask(db: Admin): Task {
  return {
    name: "clear-facilitator-emails",
    async run() {
      const cleared = must(await db.rpc("al_cron_clear_facilitator_emails"), "clear facilitator emails");
      return { tables: cleared ?? 0 };
    },
  };
}

/** The last time a task finished well, from the log. */
async function lastOk(db: Admin, task: string): Promise<Date | null> {
  const rows = must(await db.from("al_job_runs").select("finished_at").eq("task", task).eq("ok", true).order("finished_at", { ascending: false }).limit(1), "read the job log");
  const at = rows?.[0]?.finished_at;
  return at ? new Date(at) : null;
}

/** Once a week, if anything is past its thirty days: one email to the shared mailbox. Removal stays a coordinator's click. */
function purgeReminderTask(db: Admin, now: Date): Task {
  return {
    name: "purge-reminder",
    async run() {
      const to = parseNotifyAddress(process.env.AUDIENCE_LISTENING_NOTIFY_EMAIL);
      if (!to) return { skipped: "no mailbox set" };
      const counts = must(await db.rpc("al_cron_purge_counts"), "count what is past thirty days");
      if (!counts || counts.conversations + counts.submissions === 0) return { waiting: 0 };
      if (!weeklyDue(await lastOk(db, "purge-reminder-sent"), now)) return { waiting: counts.conversations + counts.submissions, skipped: "reminded this week" };
      const message = purgeReminderEmailText(counts, `${getSiteUrl()}/audience-listening/purge`);
      const result = await sendEmail({ to, ...message });
      if (!result.ok) throw new Error(`the email did not go: ${result.error}`);
      // A separate row, so "last reminded" is its own fact and a quiet week does not reset it.
      await db.from("al_job_runs").insert({ task: "purge-reminder-sent", finished_at: now.toISOString(), ok: true, summary: { ...counts } });
      return { waiting: counts.conversations + counts.submissions, emailed: true };
    },
  };
}

/** Each day anything waits: one email with counts only. */
function digestTask(db: Admin, now: Date): Task {
  return {
    name: "ask-digest",
    async run() {
      const to = parseNotifyAddress(process.env.AUDIENCE_LISTENING_NOTIFY_EMAIL);
      if (!to) return { skipped: "no mailbox set" };
      const raw = must(await db.rpc("al_cron_digest_counts"), "count what is waiting");
      if (!raw) return { waiting: 0 };
      const counts = { questions: raw.questions_new, hostRequests: raw.host_requests_new, hostRequestsLate: raw.host_requests_late };
      if (!digestHasNews(counts)) return { waiting: 0 };
      const last = await lastOk(db, "ask-digest-sent");
      if (last && now.getTime() - last.getTime() < 20 * 60 * 60 * 1000) return { skipped: "sent today" };
      const base = getSiteUrl();
      const message = askDigestEmailText(counts, { questions: `${base}/audience-listening/inbox`, hostRequests: `${base}/audience-listening/host-requests` });
      const result = await sendEmail({ to, ...message });
      if (!result.ok) throw new Error(`the email did not go: ${result.error}`);
      await db.from("al_job_runs").insert({ task: "ask-digest-sent", finished_at: now.toISOString(), ok: true, summary: { ...counts } });
      return { ...counts, emailed: true };
    },
  };
}

export function listeningTasks(db: Admin, now: Date): Task[] {
  return [handoffTask(db, now), afterLinksTask(db, now), excerptsTask(db), clearEmailsTask(db), purgeReminderTask(db, now), digestTask(db, now)];
}
