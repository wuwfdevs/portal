import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, Th } from "@/components/ui/table";
import { ClockFace } from "@/components/log/clock-face";
import { requireLogAccess } from "@/lib/log/access";
import { getClockTemplateDetail } from "@/lib/log/queries";
import { addClockSlot, addLocalOpportunity, createClockVersion, deactivateLocalOpportunity } from "../../clock-actions";

const VARIANT_LABEL: Record<string, string> = {
  weekday: "Weekday",
  weekend: "Weekend",
  program_specific: "Program-specific",
  holiday: "Holiday",
  special_event: "Special event",
};

export default async function ClockTemplateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { isProducer } = await requireLogAccess();
  const template = await getClockTemplateDetail(id);
  if (!template) notFound();

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

      {template.versions.map((version) => (
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
              <div className="min-w-0 flex-1 space-y-6">
                <div className="overflow-x-auto">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
                    Network structure
                  </h3>
                  <Table>
                    <thead>
                      <HeaderRow>
                        <Th>#</Th>
                        <Th>Label</Th>
                        <Th>Start</Th>
                        <Th>Duration</Th>
                        <Th>Timing</Th>
                      </HeaderRow>
                    </thead>
                    <tbody>
                      {version.slots.map((slot) => (
                        <Row key={slot.id}>
                          <Cell>{slot.position}</Cell>
                          <Cell className="font-semibold text-ink-900">{slot.label ?? "—"}</Cell>
                          <Cell>{slot.start_offset_seconds ?? "—"}s</Cell>
                          <Cell>{slot.duration_seconds}s</Cell>
                          <Cell className="text-ink-500">
                            {slot.timing_mode === "float"
                              ? `floats ${slot.earliest_start_offset_seconds}–${slot.latest_start_offset_seconds}s`
                              : "fixed"}
                          </Cell>
                        </Row>
                      ))}
                    </tbody>
                  </Table>
                </div>

                <div className="overflow-x-auto">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
                    WUWF local opportunities
                  </h3>
                  {version.opportunities.length === 0 ? (
                    <p className="text-sm text-ink-500">
                      None yet — this clock is currently all network feed, no local substitution windows.
                    </p>
                  ) : (
                    <Table>
                      <thead>
                        <HeaderRow>
                          <Th>Label</Th>
                          <Th>Requirement</Th>
                          <Th>Window</Th>
                          <Th>Permits</Th>
                          {isProducer && <Th>&nbsp;</Th>}
                        </HeaderRow>
                      </thead>
                      <tbody>
                        {version.opportunities.map((opportunity) => (
                          <Row key={opportunity.id}>
                            <Cell className="font-semibold text-ink-900">{opportunity.label}</Cell>
                            <Cell>
                              <Badge variant={opportunity.requirement === "required" ? "warning" : "neutral"}>
                                {opportunity.requirement}
                              </Badge>
                            </Cell>
                            <Cell>
                              {opportunity.timing_mode === "float"
                                ? `floats ${opportunity.earliest_start_offset_seconds}–${opportunity.latest_start_offset_seconds}s, ${opportunity.duration_seconds}s`
                                : `${opportunity.start_offset_seconds}s, ${opportunity.duration_seconds}s`}
                            </Cell>
                            <Cell className="text-ink-500">
                              {opportunity.permitted_content_types.length > 0
                                ? opportunity.permitted_content_types.join(", ")
                                : "anything"}
                            </Cell>
                            {isProducer && (
                              <Cell>
                                <form action={deactivateLocalOpportunity}>
                                  <input type="hidden" name="clock_template_id" value={template.id} />
                                  <input type="hidden" name="opportunity_id" value={opportunity.id} />
                                  <Button type="submit" variant="ghost" className="px-2.5 py-1.5 text-xs">
                                    Deactivate
                                  </Button>
                                </form>
                              </Cell>
                            )}
                          </Row>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </div>
              </div>
            </div>
          )}

          {isProducer && (
            <div className="grid grid-cols-1 gap-0 border-t border-line lg:grid-cols-2 lg:divide-x lg:divide-line">
              <details className="px-5 py-4">
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
                    This describes only the network&apos;s own structure — no fill/assignment mode anymore.
                    See &quot;Add a local opportunity&quot; for WUWF&apos;s own substitution windows.
                  </FieldHint>
                  <div className="flex justify-end">
                    <Button type="submit">Add slot</Button>
                  </div>
                </form>
              </details>

              <details className="px-5 py-4">
                <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                  Add a local opportunity
                </summary>
                <form action={addLocalOpportunity} className="mt-4 flex flex-col gap-4">
                  <input type="hidden" name="clock_template_id" value={template.id} />
                  <input type="hidden" name="clock_version_id" value={version.id} />
                  <div>
                    <Label htmlFor={`opp-label-${version.id}`}>Label</Label>
                    <Input id={`opp-label-${version.id}`} name="label" required maxLength={120} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`opp-position-${version.id}`}>Position</Label>
                      <Input id={`opp-position-${version.id}`} name="position" type="number" required min={1} />
                    </div>
                    <div>
                      <Label htmlFor={`opp-requirement-${version.id}`}>Requirement</Label>
                      <Select id={`opp-requirement-${version.id}`} name="requirement" defaultValue="optional">
                        <option value="optional">Optional — network continues if unused</option>
                        <option value="required">Required — a genuine local obligation</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`opp-start-${version.id}`}>Start offset (s)</Label>
                      <Input id={`opp-start-${version.id}`} name="start_offset_seconds" type="number" required min={0} />
                    </div>
                    <div>
                      <Label htmlFor={`opp-duration-${version.id}`}>Duration (s)</Label>
                      <Input id={`opp-duration-${version.id}`} name="duration_seconds" type="number" required min={1} />
                    </div>
                    <div>
                      <Label htmlFor={`opp-timing-${version.id}`}>Timing</Label>
                      <Select id={`opp-timing-${version.id}`} name="timing_mode" defaultValue="fixed">
                        <option value="fixed">Fixed</option>
                        <option value="float">Floating window</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`opp-multiple-${version.id}`}>Multiple items?</Label>
                      <label className="mt-2 flex items-center gap-2 text-sm text-ink-700">
                        <input id={`opp-multiple-${version.id}`} type="checkbox" name="allow_multiple" defaultChecked className="h-4 w-4" />
                        Allow more than one item
                      </label>
                    </div>
                    <div>
                      <Label htmlFor={`opp-earliest-${version.id}`}>Earliest start (s, float only)</Label>
                      <Input id={`opp-earliest-${version.id}`} name="earliest_start_offset_seconds" type="number" />
                    </div>
                    <div>
                      <Label htmlFor={`opp-latest-${version.id}`}>Latest start (s, float only)</Label>
                      <Input id={`opp-latest-${version.id}`} name="latest_start_offset_seconds" type="number" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor={`opp-types-${version.id}`}>Permitted content types</Label>
                    <Input
                      id={`opp-types-${version.id}`}
                      name="permitted_content_types"
                      placeholder="legal_id, psa, underwriting_credit"
                    />
                    <FieldHint>Comma-separated. Leave blank to permit anything.</FieldHint>
                  </div>
                  <div>
                    <Label htmlFor={`opp-notes-${version.id}`}>Notes</Label>
                    <Input id={`opp-notes-${version.id}`} name="notes" maxLength={280} />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit">Add opportunity</Button>
                  </div>
                </form>
              </details>
            </div>
          )}
        </div>
      ))}

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
              opportunities are defined separately, per version, above.
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
