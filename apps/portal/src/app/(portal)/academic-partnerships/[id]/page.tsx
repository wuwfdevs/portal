import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DescriptionList, type DescriptionItem } from "@/components/ui/description-list";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { Textarea } from "@/components/ui/input";
import { requireAcademicPartnershipsAccess } from "@/lib/academic-partnerships/access";
import {
  getSettings,
  getSubmissionDetail,
  listEmailTemplates,
  listToolMembers,
  type SubmissionDetail,
} from "@/lib/academic-partnerships/queries";
import { DISPOSITION_STATUS, STAGE_STATUS } from "@/lib/academic-partnerships/pipeline";
import {
  PARTNERSHIP_TYPE_LABEL,
  hasResearchTrack,
} from "@/lib/academic-partnerships/partnership-types";
import { isEmailSendingConfigured } from "@/lib/email";
import { addNote } from "../actions";
import { ActivityLog } from "./activity-log";
import { InternalPanel } from "./internal-panel";
import { EmailPanel } from "./email-panel";
import { DeleteSubmissionControl } from "./delete-submission-control";

export default async function SubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [{ isCoordinator }, submission, members, settings, templates] = await Promise.all([
    requireAcademicPartnershipsAccess(),
    getSubmissionDetail(id),
    listToolMembers(),
    getSettings(),
    listEmailTemplates(),
  ]);

  if (!submission) notFound();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <PageHeader
          title={submission.faculty_name}
          badge={
            submission.disposition ? (
              <StatusBadge map={DISPOSITION_STATUS} value={submission.disposition} />
            ) : (
              <StatusBadge map={STAGE_STATUS} value={submission.stage} />
            )
          }
          description={
            <>
              Submitted{" "}
              {new Date(submission.created_at).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </>
          }
        />

        <OriginalResponse submission={submission} />

        <EmailPanel
          submission={submission}
          templates={templates}
          appointmentsUrl={settings.google_appointments_url}
          sendingConfigured={isEmailSendingConfigured()}
        />

        <section>
          <SectionHeading level="eyebrow" className="mb-2">
            Add a note
          </SectionHeading>
          <form action={addNote} className="flex flex-col gap-2">
            <input type="hidden" name="submission_id" value={submission.id} />
            <Textarea
              name="note"
              rows={3}
              placeholder="Internal note — visible to Academic Partnerships staff only"
            />
            <Button type="submit" variant="secondary" className="self-start">
              Add note
            </Button>
          </form>
        </section>

        <section>
          <SectionHeading level="eyebrow" className="mb-2">
            Activity
          </SectionHeading>
          <ActivityLog events={submission.events} />
        </section>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-6 lg:w-80">
        {error && (
          <Alert variant="danger" className="mb-4">
            {error}
          </Alert>
        )}
        <InternalPanel submission={submission} members={members} />
        {isCoordinator && (
          <DeleteSubmissionControl
            submissionId={submission.id}
            facultyName={submission.faculty_name}
          />
        )}
      </aside>
    </div>
  );
}

function present(items: DescriptionItem[]): DescriptionItem[] {
  return items.filter(
    (item) => item.value !== null && item.value !== undefined && item.value !== "",
  );
}

function OriginalResponse({ submission }: { submission: SubmissionDetail }) {
  const research = hasResearchTrack(submission.partnership_types);
  const course = [submission.course_title, submission.course_number].filter(Boolean).join(" · ");
  return (
    <Card className="bg-panel-50 p-4">
      <SectionHeading level="eyebrow" className="mb-3">
        Original response
      </SectionHeading>
      <DescriptionList
        columns={2}
        className="gap-y-3"
        items={present([
          { label: "Email", value: submission.email },
          { label: "Phone", value: submission.phone },
          { label: "Department or program", value: submission.department },
          {
            label: "Collaboration track(s)",
            value: submission.partnership_types
              .map((type) => PARTNERSHIP_TYPE_LABEL[type])
              .join(", "),
          },
          { label: "Course", value: course },
          { label: "Semester or timeframe", value: submission.timeframe },
          {
            label: "Estimated students reached",
            value: submission.estimated_students_reached?.toString() ?? null,
          },
          {
            label: "May WUWF publish or distribute resulting work?",
            value: submission.may_publish ? "Yes" : "No",
          },
        ])}
      />
      <DescriptionList
        columns={2}
        className="mt-3 gap-y-3 sm:grid-cols-1"
        items={present([
          { label: "Description", value: submission.description, preserveLines: true },
          {
            label: "What students should experience, practice, or produce",
            value: submission.student_experience,
            preserveLines: true,
          },
          {
            label: "Support requested from WUWF",
            value: submission.support_requested,
            preserveLines: true,
          },
          {
            label: "Anticipated deliverables",
            value: submission.deliverables,
            preserveLines: true,
          },
          {
            label: "Relevant dates, deadlines, or embargoes",
            value: submission.relevant_dates,
            preserveLines: true,
          },
          {
            label: "Additional context",
            value: submission.additional_context,
            preserveLines: true,
          },
        ])}
      />
      {research && (
        <>
          <SectionHeading level="eyebrow" as="h3" className="mt-5 mb-3">
            Research &amp; expertise
          </SectionHeading>
          <DescriptionList
            columns={2}
            className="gap-y-3 sm:grid-cols-1"
            items={present([
              {
                label: "Topic or area of expertise",
                value: submission.research_topic,
                preserveLines: true,
              },
              {
                label: "Regional or public relevance",
                value: submission.research_relevance,
                preserveLines: true,
              },
              {
                label: "Status of the work",
                value: submission.research_status,
                preserveLines: true,
              },
              {
                label: "Availability",
                value: submission.research_availability,
                preserveLines: true,
              },
            ])}
          />
        </>
      )}
    </Card>
  );
}
