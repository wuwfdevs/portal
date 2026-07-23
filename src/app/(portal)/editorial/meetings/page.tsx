import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireEditorialAccess } from "@/lib/editorial/access";
import { formatDate } from "@/lib/editorial/format";
import { MeetingStatusBadge } from "@/components/editorial/outcome-badge";
import { Button } from "@/components/ui/button";
import { createMeeting } from "./actions";

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { role } = await requireEditorialAccess();
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: meetings } = await supabase
    .from("ep_meetings")
    .select("*")
    .order("meeting_date", { ascending: false });
  const meetingRows = meetings ?? [];

  const { data: slateRows } =
    meetingRows.length > 0
      ? await supabase
          .from("ep_meeting_pitches")
          .select("meeting_id, outcome")
          .in(
            "meeting_id",
            meetingRows.map((meeting) => meeting.id),
          )
      : { data: [] };
  const slateStats = new Map<string, { total: number; assigned: number }>();
  for (const row of slateRows ?? []) {
    const stats = slateStats.get(row.meeting_id) ?? { total: 0, assigned: 0 };
    stats.total += 1;
    if (row.outcome === "assigned") stats.assigned += 1;
    slateStats.set(row.meeting_id, stats);
  }

  return (
    <div>
      {role === "editor" && (
        <form action={createMeeting} className="mb-4 flex flex-wrap items-end gap-2.5">
          <div>
            <label
              htmlFor="meeting_date"
              className="mb-1.5 block text-xs font-semibold text-ink-700"
            >
              Meeting date
            </label>
            <input
              id="meeting_date"
              name="meeting_date"
              type="date"
              required
              className="rounded border border-line px-3 py-2 text-sm text-ink-900"
            />
          </div>
          <Button type="submit">Create meeting</Button>
          {error && <p className="text-xs text-danger">{error}</p>}
        </form>
      )}

      {meetingRows.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No meetings yet.{" "}
          {role === "editor"
            ? "Create one and pick a slate from the backlog."
            : "An editor will create the first one."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line bg-panel-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2.5">Meeting</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Slate</th>
                <th className="px-4 py-2.5">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {meetingRows.map((meeting) => {
                const stats = slateStats.get(meeting.id) ?? { total: 0, assigned: 0 };
                return (
                  <tr key={meeting.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/editorial/meetings/${meeting.id}`}
                        className="font-semibold text-ink-900 hover:text-brand-link"
                      >
                        {formatDate(meeting.meeting_date)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <MeetingStatusBadge status={meeting.status} />
                    </td>
                    <td className="px-4 py-3 text-ink-500">
                      {stats.total} {stats.total === 1 ? "pitch" : "pitches"}
                    </td>
                    <td className="px-4 py-3 text-ink-500">
                      {meeting.status === "concluded" ? stats.assigned : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
