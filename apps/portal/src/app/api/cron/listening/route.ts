import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/audience-listening/cron/auth";
import { runTasks } from "@/lib/audience-listening/cron/run-task";
import { jobLog, listeningTasks } from "@/lib/audience-listening/cron/tasks";

// Joining a recording is an ffmpeg job; the route has the longest run the plan allows.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Audience Listening's scheduled work (vercel.json calls it hourly). Vercel sends `Authorization: Bearer <CRON_SECRET>`; with no secret
 * set the route answers 401, so it is never an open door. Each task is its own step and its result is a row in `al_job_runs`, which
 * staff read at Audience Listening → Scheduled work. The response carries counts only: nothing a person said or an address.
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
  const results = await runTasks(listeningTasks(db, now), jobLog(db));
  const ok = results.every((r) => r.outcome.ok);
  return NextResponse.json(
    { ok, tasks: results.map((r) => ({ task: r.task, ok: r.outcome.ok, summary: r.outcome.summary, ...(r.outcome.error ? { error: r.outcome.error } : {}) })) },
    { status: ok ? 200 : 500 },
  );
}
