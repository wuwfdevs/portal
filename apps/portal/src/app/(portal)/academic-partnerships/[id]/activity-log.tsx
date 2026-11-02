import type { SubmissionDetail } from "@/lib/academic-partnerships/queries";

const EVENT_VERB: Record<string, string> = {
  received: "Received",
  owner_changed: "Owner changed",
  stage_changed: "Stage changed",
  note: "Note",
  email_action: "Email",
  appointment_shared: "Appointment link shared",
  disposition_changed: "Disposition changed",
  assessment_updated: "Assessment updated",
  next_action_updated: "Next action updated",
  completed: "Completed",
};

/** The chronological, staff-visible activity log — distinct from audit_events (see design doc §4). */
export function ActivityLog({ events }: { events: SubmissionDetail["events"] }) {
  if (events.length === 0) {
    return <p className="text-xs text-ink-400">Nothing recorded yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id} className="border-l-2 border-line pl-3 text-xs">
          <p className="font-semibold text-ink-700">
            {EVENT_VERB[event.event_type] ?? event.event_type}
            <span className="ml-1.5 font-normal text-ink-400">
              {event.actorName ?? "The public form"} ·{" "}
              {new Date(event.created_at).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </p>
          {event.note && <p className="mt-0.5 whitespace-pre-wrap text-ink-500">{event.note}</p>}
        </li>
      ))}
    </ol>
  );
}
