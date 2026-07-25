import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireEditorialAccess } from "@/lib/editorial/access";
import { unwrapRead } from "@/lib/editorial/data";
import { formatDate } from "@/lib/editorial/format";
import { MeetingStatusBadge } from "@/components/editorial/outcome-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { createMeeting } from "./actions";

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
        <div className="mb-5 rounded border border-line">
          <div className="border-b border-line px-4 py-3 text-sm font-bold text-ink-900">
            New meeting
          </div>
          <form action={createMeeting} className="flex flex-wrap items-end gap-3 px-4 py-4">
            <div>
              <Label htmlFor="meeting_date">Meeting date</Label>
              <Input id="meeting_date" name="meeting_date" type="date" required className="w-44" />
            </div>
            <Button type="submit">Create meeting</Button>
            <p className="basis-full text-xs leading-relaxed text-ink-400">
              A new meeting opens for slate building and independent scoring. Nobody sees anyone
              else&apos;s scores until you close scoring.
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
        <TableFrame>
          <Table className="min-w-[560px]">
            <thead>
              <HeaderRow>
                <Th>Meeting</Th>
                <Th>Status</Th>
                <Th>Slate</Th>
                <Th>Assigned</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {meetingRows.map((meeting) => {
                const stats = slateStats.get(meeting.id) ?? { total: 0, assigned: 0 };
                return (
                  <Row key={meeting.id}>
                    <Cell>
                      <Link
                        href={`/editorial/meetings/${meeting.id}`}
                        className="font-semibold text-ink-900 hover:text-brand-link hover:underline"
                      >
                        {formatDate(meeting.meeting_date)}
                      </Link>
                    </Cell>
                    <Cell>
                      <MeetingStatusBadge status={meeting.status} />
                    </Cell>
                    <Cell className="whitespace-nowrap text-ink-500">
                      {stats.total === 0
                        ? "Empty"
                        : `${stats.total} ${stats.total === 1 ? "pitch" : "pitches"}`}
                    </Cell>
                    <Cell className="tabular-nums text-ink-500">
                      {meeting.status === "concluded" ? stats.assigned : "—"}
                    </Cell>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
