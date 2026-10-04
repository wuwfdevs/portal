import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { isPlaceholderClockName } from "./program-status";
import { listClockSummaries, listScheduleEntries, type LogContentItemRow } from "./queries";
import {
  stationIdCoverage,
  type StationIdHourGap,
  type StationIdPin,
  type StationIdPosition,
  type StationIdStatus,
} from "./station-ids";

export interface StationIdClock {
  templateId: string;
  name: string;
  isPlaceholder: boolean;
  versionId: string | null;
  programNames: string[];
  shiftHours: number;
  positions: StationIdPosition[];
  pins: StationIdPin[];
  status: StationIdStatus;
  gaps: StationIdHourGap[];
}

/**
 * Every clock a current or future schedule entry airs on, with its version
 * in effect today, the positions that take a legal ID, and the legal IDs
 * pinned there. Only legal_id content counts as a station ID pin.
 */
export async function loadStationIdClocks(todayISO: string): Promise<{
  clocks: StationIdClock[];
  legalIds: Pick<LogContentItemRow, "id" | "title">[];
}> {
  const supabase = await createClient();
  const [entries, summaries, legalIdRows] = await Promise.all([
    listScheduleEntries(),
    listClockSummaries(todayISO),
    supabase
      .from("log_content_items")
      .select("id, title, approval_status")
      .eq("content_type", "legal_id")
      .order("title"),
  ]);
  const legalIdItems = unwrapRead(legalIdRows, "the legal IDs") ?? [];
  const legalIdTitle = new Map(legalIdItems.map((item) => [item.id, item.title]));

  const live = entries.filter((entry) => entry.end_date === null || entry.end_date >= todayISO);
  const byTemplate = new Map<string, typeof live>();
  for (const entry of live) {
    const list = byTemplate.get(entry.clock_template_id);
    if (list) list.push(entry);
    else byTemplate.set(entry.clock_template_id, [entry]);
  }

  const versionIds = [...byTemplate.keys()].flatMap((templateId) => {
    const current = summaries.get(templateId)?.current;
    return current ? [current.id] : [];
  });
  const opportunities =
    versionIds.length === 0
      ? []
      : (unwrapRead(
          await supabase
            .from("log_local_opportunities")
            .select("id, clock_version_id, slot_id, requirement, permitted_content_types")
            .in("clock_version_id", versionIds)
            .eq("active", true),
          "the clocks' local opportunities",
        ) ?? []);
  const idOpportunities = opportunities.filter((opportunity) =>
    opportunity.permitted_content_types.includes("legal_id"),
  );
  const assignments =
    idOpportunities.length === 0
      ? []
      : (unwrapRead(
          await supabase
            .from("log_opportunity_assignments")
            .select("id, local_opportunity_id, content_item_id, hour_index, days_of_week")
            .in(
              "local_opportunity_id",
              idOpportunities.map((opportunity) => opportunity.id),
            )
            .eq("active", true),
          "the station ID pins",
        ) ?? []);

  const clocks: StationIdClock[] = [];
  for (const [templateId, templateEntries] of byTemplate) {
    const summary = summaries.get(templateId);
    const version = summary?.current ?? null;
    const slotById = new Map((summary?.slots ?? []).map((slot) => [slot.id, slot]));
    const positions: StationIdPosition[] = idOpportunities
      .filter((opportunity) => opportunity.clock_version_id === version?.id)
      .flatMap((opportunity) => {
        const slot = slotById.get(opportunity.slot_id);
        return slot
          ? [
              {
                opportunityId: opportunity.id,
                label: slot.label ?? "Local break",
                startOffsetSeconds: slot.start_offset_seconds ?? 0,
                requirement: opportunity.requirement,
              },
            ]
          : [];
      })
      .sort((a, b) => a.startOffsetSeconds - b.startOffsetSeconds);
    const positionIds = new Set(positions.map((position) => position.opportunityId));
    const pins: StationIdPin[] = assignments
      .filter(
        (assignment) =>
          positionIds.has(assignment.local_opportunity_id) &&
          legalIdTitle.has(assignment.content_item_id),
      )
      .map((assignment) => ({
        id: assignment.id,
        opportunityId: assignment.local_opportunity_id,
        contentTitle: legalIdTitle.get(assignment.content_item_id) ?? "Legal ID",
        hourIndex: assignment.hour_index,
        daysOfWeek: assignment.days_of_week,
      }));
    const shiftHours = Math.max(
      1,
      ...templateEntries.map((entry) => Math.ceil(entry.duration_minutes / 60)),
    );
    const airDays = [...new Set(templateEntries.flatMap((entry) => entry.days_of_week))];
    const name = templateEntries[0]!.clockTemplateName;
    clocks.push({
      templateId,
      name,
      isPlaceholder: isPlaceholderClockName(name),
      versionId: version?.id ?? null,
      programNames: [...new Set(templateEntries.map((entry) => entry.programName))].sort(),
      shiftHours,
      positions,
      pins,
      ...stationIdCoverage({ shiftHours, airDays, positions, pins }),
    });
  }

  const order: Record<StationIdStatus, number> = {
    not_pinned: 0,
    partial: 1,
    no_position: 2,
    covered: 3,
  };
  clocks.sort(
    (a, b) =>
      Number(a.isPlaceholder) - Number(b.isPlaceholder) ||
      order[a.status] - order[b.status] ||
      a.name.localeCompare(b.name),
  );

  return {
    clocks,
    legalIds: legalIdItems
      .filter((item) => item.approval_status === "approved")
      .map(({ id, title }) => ({ id, title })),
  };
}
