import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateTime as formatTimestamp } from "@/lib/format";

export default async function AdminAuditPage() {
  const supabase = await createClient();
  const [{ data: events }, { data: actors }] = await Promise.all([
    supabase
      .from("audit_events")
      .select("id, action, target_type, target_id, metadata, created_at, actor_id")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const actorNameById = new Map((actors ?? []).map((actor) => [actor.id, actor.display_name]));

  return (
    <TableFrame>
      <Table stack className="md:min-w-[720px]">
        <thead>
          <HeaderRow>
            <Th>When</Th>
            <Th>Actor</Th>
            <Th>Action</Th>
            <Th>Target</Th>
          </HeaderRow>
        </thead>
        <tbody>
          {(!events || events.length === 0) && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-ink-400">
                No privileged actions have been recorded yet.
              </td>
            </tr>
          )}
          {events?.map((event) => (
            <Row key={event.id}>
              <Cell label="When" className="whitespace-nowrap text-ink-500">
                {formatTimestamp(event.created_at)}
              </Cell>
              <Cell stack="title" className="text-ink-900">
                {(event.actor_id && actorNameById.get(event.actor_id)) ?? "System"}
              </Cell>
              <Cell label="Action" className="font-mono text-xs text-ink-700">
                {event.action}
              </Cell>
              <Cell label="Target" className="text-ink-500">
                {event.target_type}
                {event.target_id ? ` · ${event.target_id.slice(0, 8)}` : ""}
              </Cell>
            </Row>
          ))}
        </tbody>
      </Table>
    </TableFrame>
  );
}
