import { requireToolAccess } from "@/lib/auth/authz";
import { createClient } from "@/lib/supabase/server";
import { JOB_LABELS, JOB_RECORD_ONLY, describeSummary, scheduleState } from "@/lib/audience-listening/cron/job-labels";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatShortDateTime } from "@/lib/format";
import { ListeningNav } from "../listening-nav";

export default async function JobsPage() {
  await requireToolAccess("audience-listening");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("al_job_runs")
    .select("id, task, started_at, finished_at, ok, summary, error")
    .order("started_at", { ascending: false })
    .limit(120);
  const runs = (data ?? []).filter((r) => !JOB_RECORD_ONLY.has(r.task));
  const state = error ? null : scheduleState(runs, new Date());

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        className="mb-6"
        title="Scheduled work"
        description="Once an hour the Portal sends finished recordings to Sourcework, emails facilitators their links, makes excerpts from the lines they marked, clears old emails and sends two reminders. Deleting a conversation is never on this list: a coordinator does that at Purge."
      />
      <ListeningNav current="jobs" />
      {error && <Alert className="mb-4">Could not read the job log. Try again in a moment.</Alert>}
      {state === "never" && (
        <Alert variant="warning" className="mb-4">
          Nothing has run yet. The schedule is in <code>vercel.json</code> and needs <code>CRON_SECRET</code> set on this deployment; until then recordings are
          sent by hand from each table&apos;s page.
        </Alert>
      )}
      {state === "stale" && (
        <Alert variant="warning" className="mb-4">
          Nothing has run for more than three hours. Check that <code>CRON_SECRET</code> is set and that the deployment&apos;s plan allows an hourly schedule.
        </Alert>
      )}
      {state === "failing" && (
        <Alert variant="warning" className="mb-4">
          A task&apos;s latest run failed. The reason is in the list below; the other tasks ran anyway.
        </Alert>
      )}
      <Card className="max-w-4xl p-5">
        <SectionHeading className="mb-3">Recent runs</SectionHeading>
        {runs.length === 0 ? (
          <EmptyState title="No runs yet">Each task of each hourly run is listed here with what it did.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {runs.slice(0, 60).map((run) => (
              <li key={run.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="w-44 shrink-0 text-meta text-ink-500">{formatShortDateTime(run.started_at)}</span>
                <span className="min-w-0 flex-1 text-sm text-ink-900">
                  {JOB_LABELS[run.task] ?? run.task}
                  <span className="block text-meta text-ink-500">{run.error ?? (describeSummary(run.summary) || "Nothing to do")}</span>
                </span>
                <Badge variant={run.ok === false ? "danger" : run.ok === null ? "neutral" : "success"}>{run.ok === false ? "Failed" : run.ok === null ? "Running" : "Done"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
