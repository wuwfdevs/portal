import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { getRundownForProgramOnDate, listClockSlotsForVersion, listPrograms } from "@/lib/log/queries";
import { getNprEpisodeForProgramOnDate } from "@/lib/log/npr";
import {
  buildSegmentWindows,
  episodeHourOffset,
  estimateStoryOffsets,
  excludeBlockLengthRollups,
  firstAiringByStory,
  packedHourCount,
  projectStoriesOntoShift,
} from "@/lib/log/npr-story-times";
import { stationTodayISO, formatStationTimeHM, formatStationTimestamp } from "@/lib/log/timezone";
import { refreshNprEpisodeAction } from "../npr-actions";
import { LogPoller } from "../log-poller";

const POLL_INTERVAL_MS = 20_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export default async function NprPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; date?: string; error?: string }>;
}) {
  const { program: programParam, date: dateParam, error } = await searchParams;
  const programs = await listPrograms();

  if (programs.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No programs yet. Set up a{" "}
        <Link href="/log/programs" className="font-semibold text-brand-link">
          program
        </Link>{" "}
        before looking up its NPR episode.
      </div>
    );
  }

  const matchedProgram = programs.find((program) => program.id === programParam);
  const selectedProgram = matchedProgram ?? programs[0]!;
  const selectedDate = dateParam && DATE_ONLY.test(dateParam) ? dateParam : stationTodayISO();

  const result = await getNprEpisodeForProgramOnDate(selectedProgram.id, selectedDate);
  const canRefresh = result.kind === "error" || result.kind === "not_found" || result.kind === "found";

  // Estimated per-story air times (lib/log/npr-story-times.ts), anchored to
  // this program's generated rundown for the selected date — the rundown is
  // what pins the shift's start time and clock version. Without one there's
  // nothing to anchor to, so the column shows durations only.
  const estimateLabelByNprItemId = new Map<string, string>();
  if (result.kind === "found" && result.items.length > 0) {
    const rundownForDate = await getRundownForProgramOnDate(selectedProgram.id, selectedDate);
    if (rundownForDate) {
      const slots = await listClockSlotsForVersion(rundownForDate.clock_version_id);
      const shiftStartMs = new Date(rundownForDate.shift_start_at).getTime();
      const hourCount = Math.max(
        1,
        Math.round((new Date(rundownForDate.shift_end_at).getTime() - shiftStartMs) / 3_600_000),
      );
      const windows = buildSegmentWindows(slots, hourCount);
      const estimates = estimateStoryOffsets(
        excludeBlockLengthRollups(
          result.items.map((item) => ({
            npr_item_id: item.npr_item_id,
            duration_seconds: item.duration_seconds,
          })),
          windows,
        ),
        windows,
      );
      const airings = projectStoriesOntoShift(
        estimates,
        hourCount,
        episodeHourOffset(
          rundownForDate.shift_start_at,
          selectedProgram.npr_feed_start_hour_et,
          packedHourCount(estimates),
        ),
      );
      for (const [nprItemId, airing] of firstAiringByStory(airings)) {
        estimateLabelByNprItemId.set(
          nprItemId,
          `~${formatStationTimeHM(new Date(shiftStartMs + airing.offsetSeconds * 1000).toISOString())}${airing.segmentLabel ? ` (Seg ${airing.segmentLabel})` : ""}`,
        );
      }
    }
  }
  const formatLength = (seconds: number): string =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div>
      <LogPoller intervalMs={POLL_INTERVAL_MS} />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <div>
            <Label htmlFor="npr-program">Program</Label>
            <Select id="npr-program" name="program" defaultValue={selectedProgram.id} className="w-64">
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                  {program.npr_collection_id === null ? " (no NPR mapping)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="npr-date">Show date</Label>
            <Input id="npr-date" type="date" name="date" defaultValue={selectedDate} className="w-40" />
          </div>
          <Button type="submit" variant="secondary" className="shrink-0">
            Switch
          </Button>
        </form>
        {canRefresh && (
          <form action={refreshNprEpisodeAction} className="shrink-0">
            <input type="hidden" name="program_id" value={selectedProgram.id} />
            <input type="hidden" name="show_date" value={selectedDate} />
            <Button type="submit">Refresh</Button>
          </form>
        )}
      </div>

      {error && (
        <Alert className="mb-4" variant="danger">
          {error}
        </Alert>
      )}

      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-bold text-ink-900">
          {selectedProgram.name} — {selectedDate}
        </h2>
        {(result.kind === "found" || result.kind === "not_found") && result.stale && (
          <Badge variant="warning">Stale</Badge>
        )}
      </div>

      {result.kind === "unmapped" && (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          This program has no NPR CDS mapping. It&apos;s either a local program or a network program
          WUWF hasn&apos;t linked to an NPR collection yet — see{" "}
          <code className="rounded bg-panel-100 px-1 py-0.5 text-xs">log_programs.npr_collection_id</code>.
        </div>
      )}

      {result.kind === "not_configured" && (
        <Alert variant="note">
          NPR CDS access isn&apos;t configured yet — set <code>NPR_CDS_TOKEN</code> to enable this. See{" "}
          <code>.env.example</code>.
        </Alert>
      )}

      {result.kind === "error" && (
        <Alert variant="danger">Could not reach NPR CDS. ({result.message})</Alert>
      )}

      {result.kind === "not_found" && (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No matching NPR episode was returned for this program on this date.
          {result.refreshError && ` A refresh attempt just now also failed (${result.refreshError}).`}
          <div className="mt-2 text-xs text-ink-400">
            Last checked {formatStationTimestamp(result.retrievedAt)}
          </div>
        </div>
      )}

      {result.kind === "found" && (
        <>
          {result.refreshError && (
            <Alert className="mb-3" variant="note">
              Couldn&apos;t refresh just now — showing the last cached episode. ({result.refreshError})
            </Alert>
          )}
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-ink-400">
            {result.title && <span className="text-sm font-semibold text-ink-900">{result.title}</span>}
            <span>NPR episode id: {result.nprEpisodeId}</span>
            <span>Retrieved {formatStationTimestamp(result.retrievedAt)}</span>
          </div>

          {result.items.length === 0 ? (
            <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
              CDS returned this episode with no story items yet.
            </div>
          ) : (
            <>
              <TableFrame>
                <Table>
                  <thead>
                    <HeaderRow>
                      <Th>#</Th>
                      <Th>Est. air</Th>
                      <Th>Story</Th>
                      <Th>Length</Th>
                    </HeaderRow>
                  </thead>
                  <tbody>
                    {result.items.map((item) => (
                      <Row key={item.id}>
                        <Cell className="text-ink-500">{item.position}</Cell>
                        <Cell className="whitespace-nowrap font-mono text-xs text-ink-500 tabular-nums">
                          {estimateLabelByNprItemId.get(item.npr_item_id) ?? "—"}
                        </Cell>
                        <Cell>
                          <div className="font-semibold text-ink-900">{item.title}</div>
                          {item.teaser && <div className="mt-0.5 text-xs text-ink-500">{item.teaser}</div>}
                        </Cell>
                        <Cell className="whitespace-nowrap font-mono text-xs text-ink-500 tabular-nums">
                          {item.duration_seconds !== null ? formatLength(item.duration_seconds) : "—"}
                        </Cell>
                      </Row>
                    ))}
                  </tbody>
                </Table>
              </TableFrame>
              <p className="mt-2 text-xs text-ink-400">
                Air times are estimates, derived by laying the episode&apos;s stories into this
                program&apos;s clock segments by duration — NPR&apos;s feed carries no explicit story
                times.{" "}
                {estimateLabelByNprItemId.size === 0 &&
                  "None shown here because no rundown exists for this program and date yet (the rundown anchors the shift's start time)."}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
