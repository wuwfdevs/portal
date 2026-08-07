import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import {
  COMPONENT_TYPE_LABEL,
  CONTENT_TYPE_LABEL,
  computeTotalDurationSeconds,
} from "@/lib/log/content-library";
import { getContentItemDetail } from "@/lib/log/queries";
import { addComponent, setApprovalStatus, setItemDadCartNumber } from "../../library-actions";
import type { LogApprovalStatus } from "@/lib/database.types";

const APPROVAL_STATUS_VARIANT: Record<LogApprovalStatus, BadgeVariant> = {
  draft: "neutral",
  approved: "success",
  retired: "muted",
};

export default async function ContentItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const item = await getContentItemDetail(id);
  if (!item) notFound();

  const totalDuration = computeTotalDurationSeconds(item.components, item.expected_duration_seconds);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Link href="/log/library" className="text-xs font-semibold text-brand-link">
          ← Back to library
        </Link>
        <div className="mt-2 mb-4 flex flex-wrap items-center gap-2.5">
          <h2 className="font-serif text-xl font-bold text-ink-900">{item.title}</h2>
          <Badge variant={APPROVAL_STATUS_VARIANT[item.approval_status]}>{item.approval_status}</Badge>
        </div>

        {error && <Alert className="mb-4">{error}</Alert>}

        <div className="rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            {CONTENT_TYPE_LABEL[item.content_type]}
          </div>
          <div className="flex flex-col gap-3 p-5 text-sm text-ink-700">
            {item.summary && <p>{item.summary}</p>}
            {item.script && (
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">Script</div>
                <p className="whitespace-pre-wrap">{item.script}</p>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-ink-400">Total duration</dt>
                <dd className="font-semibold text-ink-900">
                  {totalDuration ? `${totalDuration}s` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-400">Effective</dt>
                <dd>
                  {item.effective_from}
                  {item.effective_to ? ` – ${item.effective_to}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-ink-400">Priority</dt>
                <dd>{item.priority ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Reusable</dt>
                <dd>{item.reusable ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Reporter / editor</dt>
                <dd>{item.reporter_or_editor ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Frequency guidance</dt>
                <dd>{item.frequency_guidance ?? "—"}</dd>
              </div>
            </dl>
            {(item.geography_tags.length > 0 ||
              item.subject_tags.length > 0 ||
              item.community_issue_tags.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {[...item.geography_tags, ...item.subject_tags, ...item.community_issue_tags].map(
                  (tag) => (
                    <Badge key={tag} variant="accent">
                      {tag}
                    </Badge>
                  ),
                )}
              </div>
            )}
          </div>

          <div className="border-t border-line px-5 py-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">ENCO/DAD</div>
            <form action={setItemDadCartNumber} className="flex items-end gap-3">
              <input type="hidden" name="content_item_id" value={item.id} />
              <div className="flex-1">
                <Label htmlFor="dad_cart_number">Cart number</Label>
                <Input id="dad_cart_number" name="dad_cart_number" defaultValue={item.dad_cart_number ?? ""} placeholder="e.g. 4021" />
                <FieldHint>
                  ENCO/DAD is WUWF&apos;s audio playback system of record — hosts play this item from there,
                  not the portal. This is just a reference identifier.
                </FieldHint>
              </div>
              <Button type="submit" variant="secondary">
                Save
              </Button>
            </form>
          </div>
        </div>

        <div className="mt-6 rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Components</div>
          {item.components.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">
              No components yet. A simple single-file item doesn&apos;t need any — attach audio above
              instead.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {item.components.map((component) => (
                <li key={component.id} className="flex flex-col gap-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-ink-900">
                      {component.sequence}. {COMPONENT_TYPE_LABEL[component.component_type]}
                    </span>
                    <Badge variant={component.required ? "warning" : "muted"}>
                      {component.required ? "required" : "optional"}
                    </Badge>
                    <span className="text-ink-500">{component.duration_seconds}s</span>
                  </div>
                  {component.script && <p className="text-xs text-ink-700">{component.script}</p>}
                  {component.dad_cart_number && (
                    <p className="text-xs text-ink-500">ENCO/DAD cart: {component.dad_cart_number}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <details className="border-t border-line px-5 py-4">
            <summary className="cursor-pointer text-xs font-semibold text-brand-link">
              Add a component
            </summary>
            <form action={addComponent} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="content_item_id" value={item.id} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="component_type">Type</Label>
                  <Select id="component_type" name="component_type" defaultValue="recorded_audio">
                    {Object.entries(COMPONENT_TYPE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="sequence">Sequence</Label>
                  <Input
                    id="sequence"
                    name="sequence"
                    type="number"
                    required
                    min={1}
                    defaultValue={item.components.length + 1}
                  />
                </div>
                <div>
                  <Label htmlFor="duration_seconds">Duration (s)</Label>
                  <Input id="duration_seconds" name="duration_seconds" type="number" required min={1} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="component_script">Script</Label>
                  <Input id="component_script" name="script" />
                </div>
                <div>
                  <Label htmlFor="component_dad_cart_number">ENCO/DAD cart</Label>
                  <Input id="component_dad_cart_number" name="dad_cart_number" placeholder="e.g. 4021" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" name="required" defaultChecked className="h-4 w-4" />
                Required (counts toward total occupied time)
              </label>
              <div className="flex justify-end">
                <Button type="submit">Add component</Button>
              </div>
            </form>
          </details>
        </div>
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-72">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Status</div>
        <form action={setApprovalStatus} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="content_item_id" value={item.id} />
          <div>
            <Label htmlFor="approval_status">Approval status</Label>
            <Select id="approval_status" name="approval_status" defaultValue={item.approval_status}>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="retired">Retired</option>
            </Select>
            <FieldHint>Retiring keeps the item&apos;s history — it&apos;s never deleted.</FieldHint>
          </div>
          <Button type="submit">Update status</Button>
        </form>
      </div>
    </div>
  );
}
