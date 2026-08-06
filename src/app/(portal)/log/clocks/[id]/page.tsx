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
import { addClockSlot, createClockVersion } from "../../clock-actions";

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
            <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start">
              <div className="mx-auto shrink-0 lg:mx-0">
                <ClockFace slots={version.slots} />
              </div>
              <div className="min-w-0 flex-1 overflow-x-auto">
                <Table>
                  <thead>
                    <HeaderRow>
                      <Th>#</Th>
                      <Th>Label</Th>
                      <Th>Duration</Th>
                      <Th>Fill</Th>
                      <Th>Assignment</Th>
                      <Th>Content types</Th>
                    </HeaderRow>
                  </thead>
                  <tbody>
                    {version.slots.map((slot) => (
                      <Row key={slot.id}>
                        <Cell>{slot.position}</Cell>
                        <Cell className="font-semibold text-ink-900">{slot.label ?? "—"}</Cell>
                        <Cell>{slot.duration_seconds}s</Cell>
                        <Cell>{slot.fill_mode}</Cell>
                        <Cell>{slot.assignment_mode}</Cell>
                        <Cell className="text-ink-500">
                          {slot.permitted_content_types.length > 0
                            ? slot.permitted_content_types.join(", ")
                            : "—"}
                        </Cell>
                      </Row>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          )}

          {isProducer && (
            <details className="border-t border-line px-5 py-4">
              <summary className="cursor-pointer text-xs font-semibold text-brand-link">
                Add a slot
              </summary>
              <form action={addClockSlot} className="mt-4 flex flex-col gap-4">
                <input type="hidden" name="clock_template_id" value={template.id} />
                <input type="hidden" name="clock_version_id" value={version.id} />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                </div>
                <div>
                  <Label htmlFor={`content-types-${version.id}`}>Permitted content types</Label>
                  <Input
                    id={`content-types-${version.id}`}
                    name="permitted_content_types"
                    placeholder="news, station_promo, psa"
                  />
                  <FieldHint>Comma-separated.</FieldHint>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor={`fill-mode-${version.id}`}>Fill mode</Label>
                    <Select id={`fill-mode-${version.id}`} name="fill_mode" defaultValue="host_fillable">
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                      <option value="host_fillable">Host-fillable</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`assignment-mode-${version.id}`}>Assignment mode</Label>
                    <Select
                      id={`assignment-mode-${version.id}`}
                      name="assignment_mode"
                      defaultValue="host_selected"
                    >
                      <option value="automatic">Automatic</option>
                      <option value="preassigned">Preassigned</option>
                      <option value="host_selected">Host-selected</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`timing-mode-${version.id}`}>Timing</Label>
                    <Select id={`timing-mode-${version.id}`} name="timing_mode" defaultValue="fixed">
                      <option value="fixed">Fixed</option>
                      <option value="float">Float</option>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-ink-700">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="replaceable" defaultChecked className="h-4 w-4" />
                    Replaceable
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="shortenable" className="h-4 w-4" />
                    Shortenable
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="allow_empty" className="h-4 w-4" />
                    Allow empty
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="allow_multiple" className="h-4 w-4" />
                    Allow multiple
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="lock_on_air" className="h-4 w-4" />
                    Lock on air
                  </label>
                </div>
                <div className="flex justify-end">
                  <Button type="submit">Add slot</Button>
                </div>
              </form>
            </details>
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
              A version is immutable once created — a correction is a new version, not an edit.
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
