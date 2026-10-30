import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/description-list";
import { PageHeader } from "@/components/ui/page-header";
import { TextLink } from "@/components/ui/primary-link";
import { CardHeader, SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { FieldHint, Label, Select } from "@/components/ui/input";
import {
  COMPONENT_TYPE_LABEL,
  CONTENT_TYPE_LABEL,
  computeTotalDurationSeconds,
} from "@/lib/log/content-library";
import { getContentItemDetail } from "@/lib/log/queries";
import { APPROVAL_STATUS } from "@/lib/log/status-badges";
import {
  addComponent,
  setApprovalStatus,
  updateComponent,
  updateContentItem,
} from "../../library-actions";
import { ComponentForm } from "../component-form";
import { ContentItemForm } from "../content-item-form";

export default async function ContentItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; edit?: string; editComponent?: string }>;
}) {
  const { id } = await params;
  const { error, edit, editComponent } = await searchParams;
  const item = await getContentItemDetail(id);
  if (!item) notFound();

  const detailPath = `/log/library/${item.id}`;
  const isEditingItem = edit === "item";
  const editingComponentId = editComponent ?? null;

  const totalDuration = computeTotalDurationSeconds(
    item.components,
    item.expected_duration_seconds,
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <PageHeader
          as="h2"
          back={{ href: "/log/library", label: "Back to library" }}
          title={item.title}
          badge={<StatusBadge map={APPROVAL_STATUS} value={item.approval_status} />}
          actions={
            <TextLink
              href={isEditingItem ? detailPath : `${detailPath}?edit=item`}
              className="text-xs hover:underline"
            >
              {isEditingItem ? "Cancel" : "Edit"}
            </TextLink>
          }
          className="mb-4"
        />

        {error && <Alert className="mb-4">{error}</Alert>}

        {isEditingItem ? (
          <ContentItemForm
            action={updateContentItem}
            submitLabel="Save changes"
            item={item}
            cancelHref={detailPath}
          />
        ) : (
          <Card>
            <CardHeader>{CONTENT_TYPE_LABEL[item.content_type]}</CardHeader>
            <div className="flex flex-col gap-3 p-5 text-sm text-ink-700">
              {item.summary && <p>{item.summary}</p>}
              {item.script && (
                <div>
                  <SectionHeading level="eyebrow" as="h3" className="mb-1">
                    Script
                  </SectionHeading>
                  <p className="whitespace-pre-wrap">{item.script}</p>
                </div>
              )}
              <DescriptionList
                columns={3}
                items={[
                  {
                    label: "Total duration",
                    value: totalDuration ? `${totalDuration}s` : "—",
                  },
                  {
                    label: "Effective",
                    value: `${item.effective_from}${item.effective_to ? ` – ${item.effective_to}` : ""}`,
                  },
                ]}
              />
              {item.community_issue_tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.community_issue_tags.map((tag) => (
                    <Badge key={tag} variant="accent">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        <Card className="mt-6">
          <CardHeader>Components</CardHeader>
          {item.components.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">
              No components yet. A simple single-file item doesn&apos;t need any — attach audio
              above instead.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {item.components.map((component) => (
                <li key={component.id} className="flex flex-col gap-2 px-5 py-4">
                  {editingComponentId === component.id ? (
                    <ComponentForm
                      action={updateComponent}
                      contentItemId={item.id}
                      component={component}
                      submitLabel="Save changes"
                      cancelHref={detailPath}
                    />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-ink-900">
                          {component.sequence}. {COMPONENT_TYPE_LABEL[component.component_type]}
                        </span>
                        <Badge variant={component.required ? "warning" : "muted"}>
                          {component.required ? "required" : "optional"}
                        </Badge>
                        <span className="text-ink-500">{component.duration_seconds}s</span>
                        <TextLink
                          href={`${detailPath}?editComponent=${component.id}`}
                          className="ml-auto text-xs hover:underline"
                        >
                          Edit
                        </TextLink>
                      </div>
                      {component.script && (
                        <p className="text-xs text-ink-700">{component.script}</p>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <details className="border-t border-line px-5 py-4">
            <summary className="cursor-pointer text-xs font-semibold text-brand-link">
              Add a component
            </summary>
            <div className="mt-4">
              <ComponentForm
                action={addComponent}
                contentItemId={item.id}
                defaultSequence={item.components.length + 1}
                submitLabel="Add component"
              />
            </div>
          </details>
        </Card>
      </div>

      <Card className="w-full shrink-0 lg:w-72">
        <CardHeader>Status</CardHeader>
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
      </Card>
    </div>
  );
}
