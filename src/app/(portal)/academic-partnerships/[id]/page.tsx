import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  getSettings,
  getSubmissionDetail,
  listEmailTemplates,
  listToolMembers,
  type SubmissionDetail,
} from "@/lib/academic-partnerships/queries";
import { DISPOSITION_BADGE, DISPOSITION_LABEL, STAGE_LABEL } from "@/lib/academic-partnerships/pipeline";
import { PARTNERSHIP_TYPE_LABEL, hasResearchTrack } from "@/lib/academic-partnerships/partnership-types";
import { isEmailSendingConfigured } from "@/lib/email";
import { addNote } from "../actions";
import { ActivityLog } from "./activity-log";
import { InternalPanel } from "./internal-panel";
import { EmailPanel } from "./email-panel";

export default async function SubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [submission, members, settings, templates] = await Promise.all([
    getSubmissionDetail(id),
    listToolMembers(),
    getSettings(),
    listEmailTemplates(),
  ]);

  if (!submission) notFound();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-xl font-bold text-ink-900">{submission.faculty_name}</h1>
            {submission.disposition ? (
              <Badge variant={DISPOSITION_BADGE[submission.disposition]}>
                {DISPOSITION_LABEL[submission.disposition]}
              </Badge>
            ) : (
              <Badge variant="accent">{STAGE_LABEL[submission.stage]}</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-400">
            Submitted {new Date(submission.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </header>

        <OriginalResponse submission={submission} />

        <EmailPanel
          submission={submission}
          templates={templates}
          appointmentsUrl={settings.google_appointments_url}
          sendingConfigured={isEmailSendingConfigured()}
        />

        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Add a note</h2>
          <form action={addNote} className="flex flex-col gap-2">
            <input type="hidden" name="submission_id" value={submission.id} />
            <Textarea name="note" rows={3} placeholder="Internal note — visible to Academic Partnerships staff only" />
            <Button type="submit" variant="secondary" className="self-start">
              Add note
            </Button>
          </form>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">
            Activity
          </h2>
          <ActivityLog events={submission.events} />
        </section>
      </div>

      <aside className="w-full shrink-0 lg:w-80">
        {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
        <InternalPanel submission={submission} members={members} />
      </aside>
    </div>
  );
}

function OriginalResponse({ submission }: { submission: SubmissionDetail }) {
  const research = hasResearchTrack(submission.partnership_types);
  return (
    <section className="rounded border border-line bg-panel-50 p-4">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-400">
        Original response
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label="Email" value={submission.email} />
        <Field label="Phone" value={submission.phone} />
        <Field label="Department or program" value={submission.department} />
        <Field
          label="Collaboration track(s)"
          value={submission.partnership_types.map((type) => PARTNERSHIP_TYPE_LABEL[type]).join(", ")}
        />
        {(submission.course_title || submission.course_number) && (
          <Field
            label="Course"
            value={[submission.course_title, submission.course_number].filter(Boolean).join(" · ")}
          />
        )}
        <Field label="Semester or timeframe" value={submission.timeframe} />
        <Field
          label="Estimated students reached"
          value={submission.estimated_students_reached?.toString() ?? null}
        />
        <Field label="May WUWF publish or distribute resulting work?" value={submission.may_publish ? "Yes" : "No"} />
      </dl>
      <div className="mt-3 flex flex-col gap-3">
        <LongField label="Description" value={submission.description} />
        <LongField label="Learning objectives" value={submission.learning_objectives} />
        <LongField
          label="What students should experience, practice, or produce"
          value={submission.student_experience}
        />
        <LongField label="Support requested from WUWF" value={submission.support_requested} />
        <LongField label="Anticipated deliverables" value={submission.deliverables} />
        <LongField label="Relevant dates or deadlines" value={submission.relevant_dates} />
        <LongField label="Additional context" value={submission.additional_context} />
        {research && (
          <>
            <h3 className="mt-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">
              Research &amp; expertise
            </h3>
            <LongField label="Topic or area of expertise" value={submission.research_topic} />
            <LongField label="Plain-language summary" value={submission.research_summary} />
            <LongField label="Regional or public relevance" value={submission.research_relevance} />
            <LongField label="Status of the work" value={submission.research_status} />
            <LongField label="Supporting links or materials" value={submission.research_links} />
            <LongField label="Relevant dates or embargoes" value={submission.research_dates} />
            <LongField label="Availability" value={submission.research_availability} />
          </>
        )}
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="text-sm text-ink-800">{value}</dd>
    </div>
  );
}

function LongField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{label}</p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{value}</p>
    </div>
  );
}
