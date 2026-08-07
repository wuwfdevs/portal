import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listPrograms } from "@/lib/log/queries";
import { getNprRundownForProgram } from "@/lib/log/npr";
import { refreshNprRundownAction } from "../npr-actions";
import { LogPoller } from "../log-poller";
import { formatStationTimestamp } from "@/lib/log/timezone";
import type { LogNprStatus } from "@/lib/database.types";

const POLL_INTERVAL_MS = 20_000;

const STATUS_VARIANT: Record<LogNprStatus, BadgeVariant> = {
  draft: "neutral",
  edited: "accent",
  revised: "warning",
  withdrawn: "danger",
};

export default async function NprPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; error?: string }>;
}) {
  const { program: programParam, error } = await searchParams;
  const programs = await listPrograms();

  if (programs.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No programs yet. Set up a{" "}
        <Link href="/log/programs" className="font-semibold text-brand-link">
          program
        </Link>{" "}
        before pulling its NPR rundown.
      </div>
    );
  }

  const matchedProgram = programs.find((program) => program.id === programParam);
  const selectedProgram = matchedProgram ?? programs[0]!;
  const selectedProgramId = selectedProgram.id;

  const { segments, retrievedAt, stale, refreshError } = await getNprRundownForProgram(selectedProgramId);

  return (
    <div>
      <LogPoller intervalMs={POLL_INTERVAL_MS} />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <Select name="program" defaultValue={selectedProgramId} className="w-64">
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Switch
          </Button>
        </form>
        <form action={refreshNprRundownAction}>
          <input type="hidden" name="program_id" value={selectedProgramId} />
          <Button type="submit">Refresh</Button>
        </form>
      </div>

      {error && (
        <Alert className="mb-4" variant="danger">
          {error}
        </Alert>
      )}
      {!error && refreshError && (
        <Alert className="mb-4" variant="note">
          Couldn&apos;t refresh just now — showing the last cached rundown, if any. ({refreshError})
        </Alert>
      )}

      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-bold text-ink-900">{selectedProgram.name}</h2>
        {stale && <Badge variant="warning">Stale</Badge>}
        {retrievedAt && (
          <span className="text-xs text-ink-400">Retrieved {formatStationTimestamp(retrievedAt)}</span>
        )}
      </div>

      {segments.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No NPR rundown cached yet for this program. Click Refresh to fetch it.
        </div>
      ) : (
        <TableFrame>
          <Table>
            <thead>
              <HeaderRow>
                <Th>#</Th>
                <Th>Story</Th>
                <Th>Forward promo</Th>
                <Th>Status</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {segments.map((segment) => (
                <Row key={segment.id}>
                  <Cell className="text-ink-500">{segment.segment_order}</Cell>
                  <Cell>
                    <div className="font-semibold text-ink-900">{segment.story_title}</div>
                    {segment.story_description && (
                      <div className="mt-0.5 text-xs text-ink-500">{segment.story_description}</div>
                    )}
                    {segment.advisory_text && (
                      <Alert variant="note" className="mt-1.5">
                        {segment.advisory_text}
                      </Alert>
                    )}
                  </Cell>
                  <Cell className="text-ink-700">{segment.forward_promo_copy ?? "—"}</Cell>
                  <Cell>
                    <Badge variant={STATUS_VARIANT[segment.status]}>{segment.status}</Badge>
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
