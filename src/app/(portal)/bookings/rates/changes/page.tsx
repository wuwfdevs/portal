import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { listRateModelEvents } from "@/lib/bookings/queries";
import { RatesTabs } from "../rates-tabs";

export default async function ChangeLogPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  const params = await searchParams;
  await requireBookingsAccess();
  const events = await listRateModelEvents();

  return (
    <div className="flex flex-col gap-4">
      <RatesTabs active="changes" versionId={params.version ?? null} />
      <p className="text-xs text-ink-500">
        Every change to a version, who made it, and when. The log is kept as it was written; nothing
        here is edited or removed.
      </p>
      {events.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          Nothing has changed yet.
        </div>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>When</Th>
                <Th>Version</Th>
                <Th>What changed</Th>
                <Th>By</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {events.map((event) => (
                <Row key={event.id}>
                  <Cell stack="aside" className="whitespace-nowrap text-xs text-ink-500">
                    {new Date(event.created_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </Cell>
                  <Cell label="Version" className="font-semibold text-ink-900">
                    {event.version_label ?? "—"}
                  </Cell>
                  <Cell stack="title">{event.note}</Cell>
                  <Cell label="By" className="text-ink-500">
                    {event.actor_name ?? (event.kind === "seeded" ? "Migration" : "—")}
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
