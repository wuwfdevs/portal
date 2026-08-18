import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireEditorialAccess } from "@/lib/editorial/access";
import { listRubricProfiles, unwrapRead } from "@/lib/editorial/data";
import { formatDate } from "@/lib/editorial/format";
import { MeetingStatusBadge } from "@/components/editorial/outcome-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { createMeeting } from "./actions";

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { role } = await requireEditorialAccess();
  const { error } = await searchParams;
  const supabase = await createClient();

  const [meetingRows, profiles] = await Promise.all([
    supabase
      .from("ep_meetings")
      .select("*")
      .order("meeting_date", { ascending: false })
      .then((result) => unwrapRead(result, "meetings") ?? []),
    listRubricProfiles({ activeOnly: true }),
  ]);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const slateRows =
    meetingRows.length > 0
      ? (unwrapRead(
          await supabase
            .from("ep_meeting_pitches")
            .select("meeting_id, outcome")
            .in(
              "meeting_id",
              meetingRows.map((meeting) => meeting.id),
            ),
          "the slates",
        ) ?? [])
      : [];

  const slateStats = new Map<string, { total: number; assigned: number }>();
  for (const row of slateRows) {
    const stats = slateStats.get(row.meeting_id) ?? { total: 0, assigned: 0 };
    stats.total += 1;
    if (row.outcome === "assigned") stats.assigned += 1;
    slateStats.set(row.meeting_id, stats);
  }

  return (
    <div>
      {role === "editor" && (
        <div className="mb-5 rounded border border-line">
          <div className="border-b border-line px-4 py-3 text-sm font-bold text-ink-900">
            New meeting
          </div>
          <form action={createMeeting} className="flex flex-wrap items-end gap-3 px-4 py-4">
            <div>
              <Label htmlFor="meeting_date">Meeting date</Label>
              <Input id="meeting_date" name="meeting_date" type="date" required className="w-44" />
            </div>
            <div>
              <Label htmlFor="rubric_profile_id">Rubric profile</Label>
              <Select
                id="rubric_profile_id"
                name="rubric_profile_id"
                className="w-56"
                defaultValue={profiles.find((p) => p.is_default)?.id ?? profiles[0]?.id ?? ""}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit">Create meeting</Button>
            <p className="basis-full text-xs leading-relaxed text-ink-400">
              A new meeting opens for slate building and independent scoring. Nobody sees anyone
              else&apos;s scores until you close scoring. Pick Immediate / Emerging News when the
              slate is dominated by urgent coverage — pillar fit won&apos;t gate those pitches.
            </p>
          </form>
        </div>
      )}

      {error && <Alert className="mb-4">{error}</Alert>}

      {meetingRows.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm leading-relaxed text-ink-500">
          No meetings yet.{" "}
          {role === "editor"
            ? "Create one above and pick a slate from the backlog."
            : "An editor will create the first one."}
        </div>
      ) : (
        <div className="rounded border border-line">
          {meetingRows.map((meeting) => {
            const stats = slateStats.get(meeting.id) ?? { total: 0, assigned: 0 };
            const slateLine =
              stats.total === 0
                ? "Empty"
                : `${stats.total} ${stats.total === 1 ? "pitch" : "pitches"}`;
            return (
              <Link
                key={meeting.id}
                href={`/editorial/meetings/${meeting.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-4 last:border-b-0 hover:bg-panel-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-[15px] font-bold text-ink-900">
                    {formatDate(meeting.meeting_date)}
                  </div>
                  <div className="mt-1 text-xs text-ink-400">
                    {profileById.get(meeting.rubric_profile_id)?.name ?? "—"}
                  </div>
                </div>
                <MeetingStatusBadge status={meeting.status} />
                <div className="w-32 shrink-0 text-right text-xs text-ink-500">
                  {slateLine}
                  {meeting.status === "concluded" && stats.assigned > 0 && (
                    <> · {stats.assigned} assigned</>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
