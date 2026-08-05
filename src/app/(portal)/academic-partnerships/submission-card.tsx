import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { daysSince, formatDays } from "@/lib/academic-partnerships/pipeline";
import { PARTNERSHIP_TYPE_LABEL } from "@/lib/academic-partnerships/partnership-types";
import type { SubmissionListItem } from "@/lib/academic-partnerships/queries";

/**
 * The presentational card, shared by the draggable kanban tile and its
 * keyboard-accessible "Move to…" wrapper — enough for triage without
 * crowding: faculty name, department, course (when applicable), a
 * partnership-type badge, requested timeframe, assigned owner, time in
 * stage, and a next-action date when one is set.
 */
export function SubmissionCard({ submission }: { submission: SubmissionListItem }) {
  return (
    <Link
      href={`/academic-partnerships/${submission.id}`}
      className="block rounded border border-line bg-white p-3 text-left shadow-sm hover:border-brand-primary"
    >
      <p className="text-[13px] font-bold text-ink-900">{submission.faculty_name}</p>
      <p className="text-xs text-ink-500">
        {submission.department}
        {submission.course_title ? ` · ${submission.course_title}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="accent">{PARTNERSHIP_TYPE_LABEL[submission.partnership_type]}</Badge>
        {submission.timeframe && <Badge variant="neutral">{submission.timeframe}</Badge>}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-400">
        <span>{submission.ownerName ?? "Unassigned"}</span>
        <span>{formatDays(daysSince(submission.stage_changed_at))} in stage</span>
      </div>
      {submission.next_action_date && (
        <p className="mt-1.5 text-[11px] font-semibold text-warning-fg">
          Next: {new Date(submission.next_action_date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </p>
      )}
    </Link>
  );
}
