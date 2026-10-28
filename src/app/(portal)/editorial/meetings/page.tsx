import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireEditorialAccess } from "@/lib/editorial/access";
import { unwrapRead } from "@/lib/editorial/data";
import { formatDate } from "@/lib/editorial/format";
import { MeetingStatusBadge } from "@/components/editorial/outcome-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { createMeeting } from "./actions";
import { pluralize } from "@/lib/format";

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { role } = await requireEditorialAccess();
  const { error } = await searchParams;
  const supabase = await createClient();

  const meetingRows =
    unwrapRead(
      await supabase.from("ep_meetings").select("*").order("meeting_date", { ascending: false }),
      "meetings",
    ) ?? [];

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
        <Card className="mb-5">
          <div className="border-b border-line px-4 py-3 text-sm font-bold text-ink-900">
            New meeting
          </div>
          <form action={createMeeting} className="flex flex-wrap items-end gap-3 px-4 py-4">
            <Field label="Meeting date" htmlFor="meeting_date">
              <Input id="meeting_date" name="meeting_date" type="date" required className="w-44" />
            </Field>
            <Button type="submit">Create meeting</Button>
            <p className="basis-full text-xs leading-relaxed text-ink-400">
              A new meeting opens for slate building and independent scoring. Nobody sees anyone
              else&apos;s scores until you close scoring.
            </p>
          </form>
        </Card>
      )}

      {error && <Alert className="mb-4">{error}</Alert>}

      {meetingRows.length === 0 ? (
        <EmptyState className="leading-relaxed">
          No meetings yet.{" "}
          {role === "editor"
            ? "Create one above and pick a slate from the backlog."
            : "An editor will create the first one."}
        </EmptyState>
      ) : (
        <Card>
          {meetingRows.map((meeting) => {
            const stats = slateStats.get(meeting.id) ?? { total: 0, assigned: 0 };
            const slateLine =
              stats.total === 0 ? "Empty" : pluralize(stats.total, "pitch", "pitches");
            return (
              <Link
                key={meeting.id}
                href={`/editorial/meetings/${meeting.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-4 last:border-b-0 hover:bg-panel-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-body font-bold text-ink-900">
                    {formatDate(meeting.meeting_date)}
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
        </Card>
      )}
    </div>
  );
}
