import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/audience-listening/cron/auth";
import { runTasks, type TaskLog } from "@/lib/audience-listening/cron/run-task";
import { purgeOldNotifications, sendQueuedEmails } from "@/lib/notifications/cron/send-queued";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// A run that leaves no row: it fires every five minutes and usually finds nothing, so a log row per run would be most of the table. A failure is in the response (and
// Vercel's log) and the next run retries; the queue itself records each email's state.
const noLog: TaskLog = { begin: async () => null, end: async () => {} };

/**
 * The notification layer's scheduled work (vercel.json calls it every five minutes): sweeps up queued email that did not go out when its event happened (a failed send waiting to retry, or an event raised with no request to send from) and clears what is 90 days old.
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; with no secret set the route answers 401, so it is never an open door. The
 * response carries counts only: no address, title or body (docs/notifications-design.md §5).
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const now = new Date();
  const tasks = [
    { name: "send_queued_email", run: () => sendQueuedEmails(db) },
    // Housekeeping needs no minute-by-minute run; the first run of each hour is plenty.
    ...(now.getUTCMinutes() === 0
      ? [{ name: "purge_old", run: () => purgeOldNotifications(db, now) }]
      : []),
  ];
  const results = await runTasks(tasks, noLog);
  const ok = results.every((r) => r.outcome.ok);
  return NextResponse.json(
    {
      ok,
      tasks: results.map((r) => ({
        task: r.task,
        ok: r.outcome.ok,
        summary: r.outcome.summary,
        ...(r.outcome.error ? { error: r.outcome.error } : {}),
      })),
    },
    { status: ok ? 200 : 500 },
  );
}
