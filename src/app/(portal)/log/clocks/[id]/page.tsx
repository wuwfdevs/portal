import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, Th } from "@/components/ui/table";
import { ClockFace } from "@/components/log/clock-face";
import { requireLogAccess } from "@/lib/log/access";
import { getClockTemplateDetail, type LogLocalOpportunityWithSlot } from "@/lib/log/queries";
import { PERMITTED_CONTENT_TYPE_OPTIONS } from "@/lib/log/content-library";
import {
  addClockSlot,
  addLocalOpportunity,
  createClockVersion,
  deactivateLocalOpportunity,
  updateLocalOpportunity,
} from "../../clock-actions";

const VARIANT_LABEL: Record<string, string> = {
  weekday: "Weekday",
  weekend: "Weekend",
  program_specific: "Program-specific",
  holiday: "Holiday",
  special_event: "Special event",
};

function formatOffset(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}:00` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default async function ClockTemplateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; edit?: string; markEligible?: string }>;
}) {
  const { id } = await params;
  const { error, edit, markEligible } = await searchParams;
  const { isProducer } = await requireLogAccess();
  const template = await getClockTemplateDetail(id);
  if (!template) notFound();
  const basePath = `/log/clocks/${template.id}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/log/clocks" className="text-xs font-semibold text-brand-link">
          ← Back to clocks
        </Link>
        <h2 className="mt-2 font-serif text-xl font-bold text-ink-900">{template.name}</h2>
        {template.description && <p className="mt-1 text-sm text-ink-500">{template.description}</p>}
      </div>

      {error && <Alert>{error}</Alert>}

      {template.versions.length === 0 && (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No versions yet.{isProducer && " Start one below."}
        </div>
      )}

      {template.versions.map((version) => {
        const opportunityBySlotId = new Map(
          version.opportunities.map((opportunity) => [opportunity.slot_id, opportunity]),
        );

        return (
          <div key={version.id} className="rounded border border-line">
            <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
              <Badge variant="accent">{VARIANT_LABEL[version.variant] ?? version.variant}</Badge>
              <span className="text-sm font-bold text-ink-900">
                Effective {version.effective_from}
                {version.effective_to ? ` – ${version.effective_to}` : ""}
              </span>
            </div>

            {version.slots.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-500">No slots yet.</p>
            ) : (
              <div className="flex flex-col gap-6 p-5 xl:flex-row xl:items-start">
                <div className="mx-auto w-full max-w-[560px] xl:mx-0 xl:w-[560px] xl:shrink-0">
                  <ClockFace slots={version.slots} opportunities={version.opportunities} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
                    Network structure &amp; local eligibility
                  </h3>
                  <p className="mb-3 text-xs text-ink-500">
                    Every slot below is a fact about the network clock. A slot marked eligible is WUWF&apos;s
                    own local-substitution overlay on top of it — see{" "}
                    <span className="italic">mark eligible</span> on any slot, including a required one like a
                    newscast.
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <thead>
                        <HeaderRow>
                          <Th>#</Th>
                          <Th>Label</Th>
                          <Th>Start</Th>
                          <Th>Duration</Th>
                          <Th>Timing</Th>
                          <Th>Local eligibility</Th>
                          {isProducer && <Th>&nbsp;</Th>}
                        </HeaderRow>
                      </thead>
                      <tbody>
                        {version.slots.map((slot) => {
                          const opportunity = opportunityBySlotId.get(slot.id) ?? null;
                          const isEditing = isProducer && edit === opportunity?.id;
                          const isMarking = isProducer && markEligible === slot.id;
                          return (
                            <Fragment key={slot.id}>
                              <Row>
                                <Cell>{slot.position}</Cell>
                                <Cell className="font-semibold text-ink-900">{slot.label ?? "—"}</Cell>
                                <Cell>{formatOffset(slot.start_offset_seconds)}</Cell>
                                <Cell>{formatOffset(slot.duration_seconds)}</Cell>
                                <Cell className="text-ink-500">
                                  {slot.timing_mode === "float"
                                    ? `floats ${formatOffset(slot.earliest_start_offset_seconds)}–${formatOffset(slot.latest_start_offset_seconds)}`
                                    : "fixed"}
                                </Cell>
                                <Cell>
                                  {opportunity ? (
                                    <div className="flex flex-col gap-1">
                                      <Badge variant={opportunity.requirement === "required" ? "warning" : "neutral"}>
                                        {opportunity.requirement}
                                      </Badge>
                                      <span className="text-xs text-ink-500">
                                        {opportunity.permitted_content_types.length > 0
                                          ? opportunity.permitted_content_types
                                              .map(
                                                (value) =>
                                                  PERMITTED_CONTENT_TYPE_OPTIONS.find((o) => o.value === value)
                                                    ?.label ?? value,
                                              )
                                              .join(", ")
                                          : "anything"}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-ink-400">Not locally eligible</span>
                                  )}
                                </Cell>
                                {isProducer && (
                                  <Cell>
                                    <div className="flex items-center gap-3 whitespace-nowrap">
                                      {opportunity ? (
                                        <>
                                          <Link
                                            href={isEditing ? basePath : `${basePath}?edit=${opportunity.id}`}
                                            className="text-xs font-semibold text-brand-link hover:underline"
                                          >
                                            {isEditing ? "Cancel" : "Edit"}
                                          </Link>
                                          <form action={deactivateLocalOpportunity}>
                                            <input type="hidden" name="clock_template_id" value={template.id} />
                                            <input type="hidden" name="opportunity_id" value={opportunity.id} />
                                            <button
                                              type="submit"
                                              className="rounded text-xs font-semibold text-ink-500 hover:text-ink-900 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-surface"
                                            >
                                              Deactivate
                                            </button>
                                          </form>
                                        </>
                                      ) : (
                                        <Link
                                          href={isMarking ? basePath : `${basePath}?markEligible=${slot.id}`}
                                          className="text-xs font-semibold text-brand-link hover:underline"
                                        >
                                          {isMarking ? "Cancel" : "Mark eligible"}
                                        </Link>
                                      )}
                                    </div>
                                  </Cell>
                                )}
                              </Row>
                              {isEditing && opportunity && (
                                <Row key={`${slot.id}-edit`}>
                                  <Cell colSpan={isProducer ? 7 : 6} className="bg-panel-50/60">
                                    <OpportunityForm
                                      action={updateLocalOpportunity}
                                      templateId={template.id}
                                      opportunityId={opportunity.id}
                                      defaultRequirement={opportunity.requirement}
                                      defaultPermittedTypes={opportunity.permitted_content_types}
                                      defaultNotes={opportunity.notes}
                                      submitLabel="Save changes"
                                    />
                                  </Cell>
                                </Row>
                              )}
                              {isMarking && (
                                <Row key={`${slot.id}-mark`}>
                                  <Cell colSpan={isProducer ? 7 : 6} className="bg-panel-50/60">
                                    <OpportunityForm
                                      action={addLocalOpportunity}
                                      templateId={template.id}
                                      versionId={version.id}
                                      slotId={slot.id}
                                      defaultRequirement="optional"
                                      defaultPermittedTypes={[]}
                                      defaultNotes={null}
                                      submitLabel="Mark eligible"
                                    />
                                  </Cell>
                                </Row>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                </div>
              </div>
            )}

            {isProducer && (
              <details className="border-t border-line px-5 py-4">
                <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                  Add a network slot
                </summary>
                <form action={addClockSlot} className="mt-4 flex flex-col gap-4">
                  <input type="hidden" name="clock_template_id" value={template.id} />
                  <input type="hidden" name="clock_version_id" value={version.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`position-${version.id}`}>Position</Label>
                      <Input id={`position-${version.id}`} name="position" type="number" required min={1} />
                    </div>
                    <div>
                      <Label htmlFor={`duration-${version.id}`}>Duration (s)</Label>
                      <Input
                        id={`duration-${version.id}`}
                        name="duration_seconds"
                        type="number"
                        required
                        min={1}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`offset-${version.id}`}>Start offset (s)</Label>
                      <Input id={`offset-${version.id}`} name="start_offset_seconds" type="number" />
                    </div>
                    <div>
                      <Label htmlFor={`label-${version.id}`}>Label</Label>
                      <Input id={`label-${version.id}`} name="label" maxLength={120} />
                    </div>
                    <div>
                      <Label htmlFor={`segment-label-${version.id}`}>Segment letter</Label>
                      <Input id={`segment-label-${version.id}`} name="segment_label" maxLength={4} />
                    </div>
                    <div>
                      <Label htmlFor={`timing-mode-${version.id}`}>Timing</Label>
                      <Select id={`timing-mode-${version.id}`} name="timing_mode" defaultValue="fixed">
                        <option value="fixed">Fixed</option>
                        <option value="float">Float</option>
                      </Select>
                    </div>
                  </div>
                  <FieldHint>
                    This describes only the network&apos;s own structure. Mark a slot eligible for local
                    content from the table above once it exists.
                  </FieldHint>
                  <div className="flex justify-end">
                    <Button type="submit">Add slot</Button>
                  </div>
                </form>
              </details>
            )}
          </div>
        );
      })}

      {isProducer && (
        <div className="max-w-md rounded border border-line">
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
              A version is immutable once created — a correction is a new version, not an edit. Local
              eligibility is marked per slot, per version, above.
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
}) {
  const idPrefix = opportunityId ?? slotId ?? "new";
  return (
    <form action={action} className="flex flex-col gap-4 py-1">
      <input type="hidden" name="clock_template_id" value={templateId} />
      {opportunityId && <input type="hidden" name="opportunity_id" value={opportunityId} />}
      {versionId && <input type="hidden" name="clock_version_id" value={versionId} />}
      {slotId && <input type="hidden" name="slot_id" value={slotId} />}
      <div>
        <Label htmlFor={`opp-requirement-${idPrefix}`}>Requirement</Label>
        <Select id={`opp-requirement-${idPrefix}`} name="requirement" defaultValue={defaultRequirement}>
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
        <Input id={`opp-notes-${idPrefix}`} name="notes" maxLength={280} defaultValue={defaultNotes ?? undefined} />
      </div>
      <div className="flex justify-end">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
