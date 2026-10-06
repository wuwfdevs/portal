import type { ProjectEvent } from "@/lib/bookings/queries";

const EVENT_VERB: Record<string, string> = {
  created: "Created",
  edited: "Scope edited",
  owner_changed: "Owner changed",
  note: "Note",
  pricing: "Pricing",
  line_added: "Estimate line added",
  line_changed: "Estimate line changed",
  line_removed: "Estimate line removed",
  date_added: "Date planned",
  date_removed: "Date removed",
  date_released: "Date released",
  estimate_sent: "Estimate sent",
  estimate_approved: "Estimate approved",
  delivered: "Delivered",
  disposition: "Closed",
  reopened: "Reopened",
  commitment_added: "Airtime commitment added",
  commitment_changed: "Airtime commitment changed",
  commitment_removed: "Airtime commitment removed",
};

/** The chronological, staff-visible timeline — bk_project_events, not audit_events. */
export function ActivityLog({ events }: { events: ProjectEvent[] }) {
  if (events.length === 0) return <p className="text-xs text-ink-400">Nothing recorded yet.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id} className="border-l-2 border-line pl-3 text-xs">
          <p className="font-semibold text-ink-700">
            {EVENT_VERB[event.kind] ?? event.kind}
            <span className="ml-1.5 font-normal text-ink-400">
              {event.actor_name ?? "The request form"} ·{" "}
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
