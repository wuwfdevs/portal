import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DayPicker } from "@/components/ui/day-picker";
import { FieldHint, Label, Select } from "@/components/ui/input";
import { requireLogAccess } from "@/lib/log/access";
import { stationTodayISO } from "@/lib/log/timezone";
import { loadStationIdClocks, type StationIdClock } from "@/lib/log/station-ids-queries";
import {
  describeGap,
  describePinScope,
  formatOffset,
  type StationIdStatus,
} from "@/lib/log/station-ids";
import { assignOpportunityContent, deactivateOpportunityAssignment } from "../clock-actions";

const STATUS: Record<StationIdStatus, { label: string; variant: BadgeVariant }> = {
  covered: { label: "Every hour has an ID", variant: "success" },
  partial: { label: "Some hours have no ID", variant: "warning" },
  not_pinned: { label: "No ID pinned", variant: "danger" },
  no_position: { label: "No ID position", variant: "neutral" },
};

/**
 * Station IDs (docs/broadcast-roles.md §5): every clock a program airs on,
 * the positions that take a legal ID, and the IDs pinned there. Pins are
 * ordinary clock pins (log_opportunity_assignments); the program director or
 * traffic manages them here without opening each clock. Where a clock's ID
 * position goes is the program director's, on the clock page.
 */
export default async function StationIdsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ isProgramDirector, isTraffic }, { error }] = await Promise.all([
    requireLogAccess(),
    searchParams,
  ]);
  const canPin = isProgramDirector || isTraffic;
  const { clocks, legalIds } = await loadStationIdClocks(stationTodayISO());
  const real = clocks.filter((clock) => !clock.isPlaceholder);
  const placeholder = clocks.filter((clock) => clock.isPlaceholder);
  const needAttention = real.filter((clock) => clock.status !== "covered").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/log/programs"
          className="text-sm font-semibold text-brand-link hover:underline"
        >
          ← Programs
        </Link>
        <h1 className="text-xl font-bold text-ink-900">Station IDs</h1>
        <p className="max-w-3xl text-sm text-ink-500">
          The station identifies itself every hour, as close to the top of the hour as it can, at a
          natural break. A legal ID pinned to a clock&apos;s ID position goes into every rundown
          made from that clock from then on.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      <p className="text-sm text-ink-700">
        {needAttention === 0
          ? "Every clock in use has an ID in every hour."
          : `${needAttention} of ${real.length} clocks in use need attention.`}
      </p>

      {canPin && legalIds.length === 0 && (
        <Alert variant="warning">
          There is no approved legal ID in the content library to pin.{" "}
          <Link href="/log/library" className="font-semibold underline">
            Add one in the library
          </Link>
          .
        </Alert>
      )}

      <ul className="flex flex-col gap-4">
        {real.map((clock) => (
          <li key={clock.templateId}>
            <ClockCard
              clock={clock}
              canPin={canPin}
              canMarkPositions={isProgramDirector}
              legalIds={legalIds}
            />
          </li>
        ))}
      </ul>

      {placeholder.length > 0 && (
        <p className="text-sm text-ink-500">
          {placeholder.flatMap((clock) => clock.programNames).length} programs are on the
          placeholder clock, which has no ID position until each gets its network clock.
        </p>
      )}
    </div>
  );
}

function ClockCard({
  clock,
  canPin,
  canMarkPositions,
  legalIds,
}: {
  clock: StationIdClock;
  canPin: boolean;
  canMarkPositions: boolean;
  legalIds: { id: string; title: string }[];
}) {
  const status = STATUS[clock.status];
  const clockHref = `/log/clocks/${clock.templateId}`;
  return (
    <section className="rounded border border-line">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <Link href={clockHref} className="font-bold text-brand-link hover:underline">
            {clock.name}
          </Link>
          <div className="text-xs text-ink-500">
            {clock.programNames.join(", ")} ·{" "}
            {clock.shiftHours === 1 ? "1 hour" : `${clock.shiftHours} hours`}
          </div>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      {clock.status === "no_position" ? (
        <p className="px-5 py-4 text-sm text-ink-700">
          No position on this clock takes a legal ID.{" "}
          {canMarkPositions ? (
            <>
              Mark one on the{" "}
              <Link href={clockHref} className="font-semibold text-brand-link hover:underline">
                clock page
              </Link>
              , usually the last break before the top of the hour.
            </>
          ) : (
            "The program director marks one on the clock page."
          )}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {clock.gaps.length > 0 && clock.status === "partial" && (
            <p className="px-5 py-3 text-sm text-ink-700">
              No ID in {clock.gaps.map(describeGap).join(", ")}.
            </p>
          )}
          {clock.positions.map((position) => {
            const pins = clock.pins.filter((pin) => pin.opportunityId === position.opportunityId);
            return (
              <div key={position.opportunityId} className="flex flex-col gap-3 px-5 py-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-sm font-bold text-ink-900">
                    :{formatOffset(position.startOffsetSeconds)}
                  </span>
                  <span className="text-sm text-ink-900">{position.label}</span>
                  {position.requirement === "required" && <Badge variant="neutral">Required</Badge>}
                </div>
                {pins.length === 0 ? (
                  <p className="text-sm text-ink-500">Nothing pinned here.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {pins.map((pin) => (
                      <li
                        key={pin.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                      >
                        <span className="font-semibold text-ink-900">{pin.contentTitle}</span>
                        <span className="text-ink-500">{describePinScope(pin)}</span>
                        {canPin && (
                          <form action={deactivateOpportunityAssignment}>
                            <input
                              type="hidden"
                              name="clock_template_id"
                              value={clock.templateId}
                            />
                            <input type="hidden" name="assignment_id" value={pin.id} />
                            <input type="hidden" name="return_to" value="station-ids" />
                            <Button type="submit" variant="ghost" className="text-xs">
                              Remove
                            </Button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canPin && legalIds.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-brand-link">
                      Pin a legal ID
                    </summary>
                    <form
                      action={assignOpportunityContent}
                      className="mt-3 flex max-w-xl flex-col gap-3"
                    >
                      <input type="hidden" name="clock_template_id" value={clock.templateId} />
                      <input type="hidden" name="opportunity_id" value={position.opportunityId} />
                      <input type="hidden" name="return_to" value="station-ids" />
                      <div>
                        <Label htmlFor={`id-${position.opportunityId}`}>Legal ID</Label>
                        <Select
                          id={`id-${position.opportunityId}`}
                          name="content_item_id"
                          required
                          defaultValue={legalIds.length === 1 ? legalIds[0]!.id : ""}
                        >
                          {legalIds.length > 1 && <option value="">Choose a legal ID</option>}
                          {legalIds.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor={`hour-${position.opportunityId}`}>Hour</Label>
                        <Select
                          id={`hour-${position.opportunityId}`}
                          name="hour_index"
                          defaultValue=""
                        >
                          <option value="">Every hour</option>
                          {Array.from({ length: clock.shiftHours }, (_, index) => (
                            <option key={index} value={index}>
                              Hour {index + 1}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label>Days</Label>
                        <DayPicker name="days_of_week" />
                        <FieldHint>Leave every day unselected to pin it for every day.</FieldHint>
                      </div>
                      <div>
                        <Button type="submit">Pin</Button>
                      </div>
                    </form>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
