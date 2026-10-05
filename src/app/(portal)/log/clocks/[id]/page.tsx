import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import { ClockViewer, type ClockViewerForm } from "@/components/log/clock-viewer";
import { VersionSelect } from "@/components/log/version-select";
import { requireLogAccess } from "@/lib/log/access";
import {
  getClockTemplateDetail,
  getProgram,
  listContentItems,
  listOpportunityAssignmentsForVersion,
  listScheduleEntriesForClock,
  type LogContentItemRow,
  type LogLocalOpportunityWithSlot,
} from "@/lib/log/queries";
import { PERMITTED_CONTENT_TYPE_OPTIONS } from "@/lib/log/content-library";
import { clampHour, shiftInfoFromEntries } from "@/lib/log/clock-view";
import { formatDateShort, isPlaceholderClockName } from "@/lib/log/program-status";
import { resolveCurrentVersion } from "@/lib/log/clock-versions";
import { stationTodayISO } from "@/lib/log/timezone";
import {
  describeGap,
  stationIdCoverage,
  type StationIdPin,
  type StationIdPosition,
} from "@/lib/log/station-ids";
import {
  addClockSlot,
  addLocalOpportunity,
  assignOpportunityContent,
  createClockVersion,
  deactivateLocalOpportunity,
  deactivateOpportunityAssignment,
  updateLocalOpportunity,
} from "../../clock-actions";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const FORM_TITLE = {
  edit: "Edit eligibility",
  mark: "Mark eligible for local content",
  pin: "Pin content",
} as const;

function pickParam(raw: string | undefined): string | undefined {
  return raw && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : undefined;
}

/**
 * A clock's page. It leads with who airs on the clock (a program's schedule is
 * where a clock is reached from), then the diagram — Timeline or Ring, one hour
 * at a time, stepping through the hours of a multi-hour shift — with the slot
 * list and the selected slot's panel (`components/log/clock-viewer.tsx`).
 * `?version=` picks a version (default: the one in effect today); `?view=`,
 * `?hour=` and `?slot=` are the viewer's own state, mirrored into the URL;
 * `?mode=edit|pin|mark` (producers) renders that form for the selected slot
 * inside the panel. The record is immutable per version — a correction is a
 * new version — but a slot's local eligibility and pins are editable in place.
 */
export default async function ClockTemplateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    from?: string;
    version?: string;
    view?: string;
    hour?: string;
    slot?: string;
    mode?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { isProgramDirector, isTraffic } = await requireLogAccess();
  // Pins (station IDs included) are the program director's or traffic's;
  // everything else about the clock is the program director's.
  const canPin = isProgramDirector || isTraffic;
  const template = await getClockTemplateDetail(id);
  if (!template) notFound();
  const basePath = `/log/clocks/${template.id}`;
  const today = stationTodayISO();

  const [usedByEntries, fromProgram] = await Promise.all([
    listScheduleEntriesForClock(template.id),
    query.from ? getProgram(query.from) : Promise.resolve(null),
  ]);
  const liveEntries = usedByEntries
    .filter((entry) => entry.end_date === null || entry.end_date >= today)
    .sort((a, b) => a.air_time.localeCompare(b.air_time));

  const currentVersion = resolveCurrentVersion(template.versions, today);
  const version =
    template.versions.find((candidate) => candidate.id === query.version) ??
    currentVersion ??
    template.versions[0] ??
    null;
  const shift = shiftInfoFromEntries(liveEntries);

  const keepParams: Record<string, string> = {
    ...(version ? { version: version.id } : {}),
    ...(fromProgram ? { from: fromProgram.id } : {}),
  };
  const view = query.view === "ring" ? "ring" : "timeline";
  const hour = clampHour(query.hour, shift.hours);
  const slotParam = pickParam(query.slot);
  const mode =
    query.mode === "edit" || query.mode === "pin" || query.mode === "mark" ? query.mode : null;
  const returnQuery = new URLSearchParams({
    ...keepParams,
    view,
    hour: String(hour),
    ...(slotParam ? { slot: slotParam } : {}),
  }).toString();

  const [assignments, contentItems] = version
    ? await Promise.all([
        listOpportunityAssignmentsForVersion(version.id),
        canPin && mode === "pin"
          ? listContentItems({ approvalStatus: "approved" })
          : Promise.resolve([]),
      ])
    : [[], [] as LogContentItemRow[]];

  // The form for the slot named in the URL, when a producer asked for one.
  let form: ClockViewerForm | null = null;
  if ((isProgramDirector || (canPin && mode === "pin")) && version && mode && slotParam) {
    const slot = version.slots.find((candidate) => candidate.id === slotParam);
    const opportunity =
      version.opportunities.find((candidate) => candidate.slot_id === slotParam) ?? null;
    const cancelHref = `${basePath}?${returnQuery}`;
    if (slot && mode === "edit" && opportunity) {
      form = {
        slotId: slot.id,
        title: FORM_TITLE.edit,
        cancelHref,
        node: (
          <OpportunityForm
            action={updateLocalOpportunity}
            templateId={template.id}
            opportunityId={opportunity.id}
            defaultRequirement={opportunity.requirement}
            defaultPermittedTypes={opportunity.permitted_content_types}
            defaultNotes={opportunity.notes}
            submitLabel="Save changes"
            returnQuery={returnQuery}
          />
        ),
      };
    } else if (slot && mode === "mark" && !opportunity) {
      form = {
        slotId: slot.id,
        title: FORM_TITLE.mark,
        cancelHref,
        node: (
          <OpportunityForm
            action={addLocalOpportunity}
            templateId={template.id}
            versionId={version.id}
            slotId={slot.id}
            defaultRequirement="optional"
            defaultPermittedTypes={[]}
            defaultNotes={null}
            submitLabel="Mark eligible"
            returnQuery={returnQuery}
          />
        ),
      };
    } else if (slot && mode === "pin" && opportunity) {
      form = {
        slotId: slot.id,
        title: FORM_TITLE.pin,
        cancelHref,
        node: (
          <AssignmentForm
            templateId={template.id}
            opportunityId={opportunity.id}
            contentItems={contentItems}
            shiftHours={shift.hours}
            returnQuery={returnQuery}
          />
        ),
      };
    }
  }

  // The hourly legal ID is an ordinary pin; warn when the version in effect
  // today leaves an hour without one. Only for a clock a program airs on, and
  // never the shared placeholder, which has no real breaks to put an ID in.
  const stationIds =
    version &&
    version.id === currentVersion?.id &&
    liveEntries.length > 0 &&
    !isPlaceholderClockName(template.name)
      ? stationIdStatusFor(
          version.opportunities,
          version.slots,
          assignments,
          liveEntries,
          shift.hours,
        )
      : null;

  const labelForType = (value: string) =>
    PERMITTED_CONTENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
  const versionLabel = (candidate: (typeof template.versions)[number]) =>
    `${formatDateShort(candidate.effective_from)}${
      candidate.id === currentVersion?.id
        ? " · In effect now"
        : candidate.effective_to && candidate.effective_to < today
          ? ` · Ended ${formatDateShort(candidate.effective_to)}`
          : candidate.effective_from > today
            ? " · Not yet in effect"
            : ""
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <Link
            href={fromProgram ? `/log/programs/${fromProgram.id}` : "/log/programs"}
            className="text-xs font-semibold text-brand-link"
          >
            ← {fromProgram ? fromProgram.name : "Programs"}
          </Link>
          <h2 className="mt-1.5 font-serif text-xl font-bold text-ink-900">{template.name}</h2>
          {template.description && (
            <p className="mt-1 text-sm text-ink-500">{template.description}</p>
          )}
        </div>
        {version && (
          <VersionSelect
            options={template.versions.map((candidate) => ({
              id: candidate.id,
              label: versionLabel(candidate),
            }))}
            currentId={version.id}
            basePath={basePath}
            keepParams={fromProgram ? { from: fromProgram.id } : {}}
          />
        )}
        {isProgramDirector && (
          <a
            href="#new-version"
            className="inline-flex h-[38px] items-center rounded border border-brand-link px-3.5 text-sm font-bold text-brand-link hover:bg-brand-surface"
          >
            + New version
          </a>
        )}
      </div>

      {query.error && <Alert>{query.error}</Alert>}

      {stationIds && stationIds.status !== "covered" && (
        <Alert variant="warning">
          {stationIds.status === "no_position"
            ? "No slot on this clock takes a legal ID, so its hours have no station ID. "
            : stationIds.status === "not_pinned"
              ? "No legal ID is pinned on this clock, so its hours have no station ID. "
              : `No legal ID is pinned for ${stationIds.gaps.map(describeGap).join(", ")}. `}
          {stationIds.status === "no_position"
            ? isProgramDirector
              ? "Mark the last break before the top of the hour eligible for a legal ID, then pin the station ID there."
              : "The program director marks a slot eligible for a legal ID."
            : canPin
              ? "Select the slot that takes the legal ID, then Pin content. Leave the hour on Every hour and no days checked to cover the whole shift."
              : "The program director or traffic pins it."}
        </Alert>
      )}

      {template.versions.length === 0 && (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No versions yet.{isProgramDirector && " Start one below."}
        </div>
      )}

      {version && (
        <ClockViewer
          key={version.id}
          templateId={template.id}
          slots={version.slots.map((slot) => ({
            id: slot.id,
            position: slot.position,
            label: slot.label,
            segment_label: slot.segment_label,
            timing_mode: slot.timing_mode,
            start_offset_seconds: slot.start_offset_seconds,
            duration_seconds: slot.duration_seconds,
            earliest_start_offset_seconds: slot.earliest_start_offset_seconds,
            latest_start_offset_seconds: slot.latest_start_offset_seconds,
          }))}
          opportunities={version.opportunities.map((opportunity) => ({
            id: opportunity.id,
            slot_id: opportunity.slot_id,
            requirement: opportunity.requirement,
            permittedTypeLabels: opportunity.permitted_content_types.map(labelForType),
            notes: opportunity.notes,
          }))}
          pins={assignments.map((assignment) => ({
            id: assignment.id,
            local_opportunity_id: assignment.local_opportunity_id,
            hour_index: assignment.hour_index,
            days_of_week: assignment.days_of_week,
            title: assignment.contentItemTitle,
          }))}
          shift={shift}
          canEdit={isProgramDirector}
          canPin={canPin}
          initial={{ view, hour, slotId: slotParam ?? null }}
          form={form}
          keepParams={keepParams}
          removeOpportunityAction={deactivateLocalOpportunity}
          removePinAction={deactivateOpportunityAssignment}
        />
      )}

      {isProgramDirector && version && (
        <details className="rounded border border-line px-5 py-4">
          <summary className="cursor-pointer text-sm font-semibold text-brand-link">
            Add a network slot to this version
          </summary>
          <form action={addClockSlot} className="mt-4 flex max-w-2xl flex-col gap-4">
            <input type="hidden" name="clock_template_id" value={template.id} />
            <input type="hidden" name="clock_version_id" value={version.id} />
            <input type="hidden" name="return_query" value={returnQuery} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="slot-position">Position</Label>
                <Input id="slot-position" name="position" type="number" required min={1} />
              </div>
              <div>
                <Label htmlFor="slot-duration">Duration (s)</Label>
                <Input id="slot-duration" name="duration_seconds" type="number" required min={1} />
              </div>
              <div>
                <Label htmlFor="slot-offset">Start offset (s)</Label>
                <Input id="slot-offset" name="start_offset_seconds" type="number" />
              </div>
              <div>
                <Label htmlFor="slot-label">Label</Label>
                <Input id="slot-label" name="label" maxLength={120} />
              </div>
              <div>
                <Label htmlFor="slot-segment">Segment letter</Label>
                <Input id="slot-segment" name="segment_label" maxLength={4} />
              </div>
              <div>
                <Label htmlFor="slot-timing">Timing</Label>
                <Select id="slot-timing" name="timing_mode" defaultValue="fixed">
                  <option value="fixed">Fixed</option>
                  <option value="float">Float</option>
                </Select>
              </div>
            </div>
            <FieldHint>
              This describes only the network&apos;s own structure. Mark a slot eligible for local
              content from its panel above once it exists.
            </FieldHint>
            <div className="flex justify-end">
              <Button type="submit">Add slot</Button>
            </div>
          </form>
        </details>
      )}

      {isProgramDirector && (
        <div id="new-version" className="max-w-md scroll-mt-24 rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Start a new version
          </div>
          <form action={createClockVersion} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="clock_template_id" value={template.id} />
            <div>
              <Label htmlFor="variant">Variant</Label>
              <Select id="variant" name="variant" defaultValue="weekday">
                <option value="weekday">Weekday</option>
                <option value="weekend">Weekend</option>
                <option value="program_specific">Program-specific</option>
                <option value="holiday">Holiday</option>
                <option value="special_event">Special event</option>
              </Select>
            </div>
            <div className="flex gap-3">
              <div>
                <Label htmlFor="effective_from">Effective from</Label>
                <Input id="effective_from" name="effective_from" type="date" required />
              </div>
              <div>
                <Label htmlFor="effective_to">Effective to</Label>
                <Input id="effective_to" name="effective_to" type="date" />
              </div>
            </div>
            <FieldHint>
              A version is immutable once created — a correction is a new version, not an edit.
              Local eligibility is marked per slot, per version, in the panel above.
            </FieldHint>
            <div className="flex justify-end border-t border-line pt-4">
              <Button type="submit">Start version</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function OpportunityForm({
  action,
  templateId,
  opportunityId,
  versionId,
  slotId,
  defaultRequirement,
  defaultPermittedTypes,
  defaultNotes,
  submitLabel,
  returnQuery,
}: {
  action: (formData: FormData) => Promise<void>;
  templateId: string;
  opportunityId?: string;
  versionId?: string;
  slotId?: string;
  defaultRequirement: LogLocalOpportunityWithSlot["requirement"];
  defaultPermittedTypes: string[];
  defaultNotes: string | null;
  submitLabel: string;
  returnQuery: string;
}) {
  const idPrefix = opportunityId ?? slotId ?? "new";
  return (
    <form action={action} className="flex flex-col gap-4 py-1">
      <input type="hidden" name="clock_template_id" value={templateId} />
      <input type="hidden" name="return_query" value={returnQuery} />
      {opportunityId && <input type="hidden" name="opportunity_id" value={opportunityId} />}
      {versionId && <input type="hidden" name="clock_version_id" value={versionId} />}
      {slotId && <input type="hidden" name="slot_id" value={slotId} />}
      <div>
        <Label htmlFor={`opp-requirement-${idPrefix}`}>Requirement</Label>
        <Select
          id={`opp-requirement-${idPrefix}`}
          name="requirement"
          defaultValue={defaultRequirement}
        >
          <option value="optional">Optional — network continues if unused</option>
          <option value="required">Required — a genuine local obligation</option>
        </Select>
      </div>
      <div>
        <Label>Permitted content types</Label>
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {PERMITTED_CONTENT_TYPE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                name="permitted_content_types"
                value={option.value}
                defaultChecked={defaultPermittedTypes.includes(option.value)}
                className="h-4 w-4"
              />
              {option.label}
            </label>
          ))}
        </div>
        <FieldHint>Leave every box unchecked to permit anything.</FieldHint>
      </div>
      <div>
        <Label htmlFor={`opp-notes-${idPrefix}`}>Notes</Label>
        <Input
          id={`opp-notes-${idPrefix}`}
          name="notes"
          maxLength={280}
          defaultValue={defaultNotes ?? undefined}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

function AssignmentForm({
  templateId,
  opportunityId,
  contentItems,
  shiftHours,
  returnQuery,
}: {
  templateId: string;
  opportunityId: string;
  contentItems: LogContentItemRow[];
  shiftHours: number;
  returnQuery: string;
}) {
  return (
    <form action={assignOpportunityContent} className="flex flex-col gap-4 py-1">
      <input type="hidden" name="clock_template_id" value={templateId} />
      <input type="hidden" name="return_query" value={returnQuery} />
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      <div>
        <Label htmlFor={`assign-content-${opportunityId}`}>Content item</Label>
        <Select
          id={`assign-content-${opportunityId}`}
          name="content_item_id"
          required
          defaultValue=""
        >
          <option value="" disabled>
            Choose an approved content item…
          </option>
          {contentItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={`assign-hour-${opportunityId}`}>Hour of the shift</Label>
        <Select id={`assign-hour-${opportunityId}`} name="hour_index" defaultValue="">
          <option value="">Every hour</option>
          {Array.from({ length: Math.max(1, shiftHours) }, (_, index) => (
            <option key={index} value={index}>
              Hour {index + 1}
            </option>
          ))}
        </Select>
        <FieldHint>Every hour is right for the station ID.</FieldHint>
      </div>
      <div>
        <Label>Days</Label>
        <div className="mt-1 grid grid-cols-4 gap-x-4 gap-y-1.5 sm:grid-cols-7">
          {DAY_LABELS.map((label, day) => (
            <label key={day} className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" name="days_of_week" value={day} className="h-4 w-4" />
              {label}
            </label>
          ))}
        </div>
        <FieldHint>Leave every box unchecked for every day.</FieldHint>
      </div>
      <div>
        <Label htmlFor={`assign-notes-${opportunityId}`}>Notes</Label>
        <Input id={`assign-notes-${opportunityId}`} name="notes" maxLength={280} />
      </div>
      <div className="flex justify-end">
        <Button type="submit">Pin content</Button>
      </div>
    </form>
  );
}

/**
 * Whether the clock's hourly legal ID is pinned (lib/log/station-ids.ts): the
 * positions are local slots that permit a legal ID, and only pinned legal IDs
 * count. The days are every day any live schedule entry airs.
 */
function stationIdStatusFor(
  opportunities: LogLocalOpportunityWithSlot[],
  slots: { id: string; label: string | null; start_offset_seconds: number | null }[],
  assignments: Awaited<ReturnType<typeof listOpportunityAssignmentsForVersion>>,
  entries: { days_of_week: number[] }[],
  shiftHours: number,
) {
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const positions: StationIdPosition[] = opportunities
    .filter((opportunity) => opportunity.permitted_content_types.includes("legal_id"))
    .map((opportunity) => {
      const slot = slotById.get(opportunity.slot_id);
      return {
        opportunityId: opportunity.id,
        label: slot?.label ?? "Local break",
        startOffsetSeconds: slot?.start_offset_seconds ?? 0,
        requirement: opportunity.requirement,
      };
    });
  const pins: StationIdPin[] = assignments
    .filter((assignment) => assignment.contentItemType === "legal_id")
    .map((assignment) => ({
      id: assignment.id,
      opportunityId: assignment.local_opportunity_id,
      contentTitle: assignment.contentItemTitle,
      hourIndex: assignment.hour_index,
      daysOfWeek: assignment.days_of_week,
    }));
  // An entry with no days airs every day.
  const airDays = entries.some((entry) => entry.days_of_week.length === 0)
    ? []
    : [...new Set(entries.flatMap((entry) => entry.days_of_week))];
  return stationIdCoverage({ shiftHours, airDays, positions, pins });
}
