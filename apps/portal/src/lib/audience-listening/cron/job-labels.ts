// What each scheduled task is called on the staff page, and how its summary reads. Pure, so the wording is tested.

export const JOB_LABELS: Record<string, string> = {
  "send-to-sourcework": "Send finished recordings to Sourcework",
  "email-after-links": "Email facilitators their links",
  "excerpts-from-marks": "Make excerpts from marked lines",
  "clear-facilitator-emails": "Clear facilitator emails after thirty days",
  "purge-reminder": "Remind about recordings past thirty days",
  "ask-digest": "Email the waiting questions and requests",
};

/** Tasks the page does not list as runs: they are the record of an email, read to decide whether another is due. */
export const JOB_RECORD_ONLY = new Set(["purge-reminder-sent", "ask-digest-sent"]);

const SUMMARY_WORDS: Record<string, string> = {
  waiting: "waiting",
  sent: "sent",
  failed: "failed",
  needs_a_person: "need a person",
  ready: "ready",
  conversations: "conversations",
  excerpts: "excerpts made",
  tables: "tables cleared",
  emailed: "emailed",
  questions: "questions",
  hostRequests: "requests",
  hostRequestsLate: "late",
};

/** "2 sent, 1 failed". Zero counts are left out; text values (a reason a run did nothing) read as they are. */
export function describeSummary(summary: Record<string, unknown> | null): string {
  if (!summary) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(summary)) {
    if (typeof value === "number") {
      if (value > 0) parts.push(`${value} ${SUMMARY_WORDS[key] ?? key.replace(/_/g, " ")}`);
    } else if (value === true) {
      parts.push(SUMMARY_WORDS[key] ?? key.replace(/_/g, " "));
    } else if (typeof value === "string" && value.length <= 80) {
      parts.push(value);
    }
  }
  return parts.join(", ");
}

/** Whether the latest run of each listed task went wrong, or nothing has run lately, for the page's one-line state. */
export function scheduleState(runs: { task: string; started_at: string; ok: boolean | null }[], now: Date): "never" | "stale" | "failing" | "ok" {
  const listed = runs.filter((r) => !JOB_RECORD_ONLY.has(r.task));
  if (listed.length === 0) return "never";
  const newest = Math.max(...listed.map((r) => new Date(r.started_at).getTime()));
  if (now.getTime() - newest > 3 * 60 * 60 * 1000) return "stale";
  const latest = new Map<string, boolean | null>();
  for (const r of [...listed].sort((a, b) => a.started_at.localeCompare(b.started_at))) latest.set(r.task, r.ok);
  return [...latest.values()].some((ok) => ok === false) ? "failing" : "ok";
}
