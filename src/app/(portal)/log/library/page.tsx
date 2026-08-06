import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { CONTENT_TYPE_LABEL } from "@/lib/log/content-library";
import { listContentItems } from "@/lib/log/queries";
import type { LogApprovalStatus, LogContentType } from "@/lib/database.types";

const CONTENT_TYPES = Object.keys(CONTENT_TYPE_LABEL) as LogContentType[];
const APPROVAL_STATUS_VARIANT: Record<LogApprovalStatus, BadgeVariant> = {
  draft: "neutral",
  approved: "success",
  retired: "muted",
};

export default async function ContentLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ content_type?: string; approval_status?: string }>;
}) {
  const { content_type: contentTypeParam, approval_status: approvalStatusParam } = await searchParams;
  const contentType = CONTENT_TYPES.includes(contentTypeParam as LogContentType)
    ? (contentTypeParam as LogContentType)
    : undefined;
  const approvalStatus = (["draft", "approved", "retired"] as const).includes(
    approvalStatusParam as LogApprovalStatus,
  )
    ? (approvalStatusParam as LogApprovalStatus)
    : undefined;

  const items = await listContentItems({ contentType, approvalStatus });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <div>
            <Select name="content_type" defaultValue={contentType ?? ""} className="w-56">
              <option value="">All content types</option>
              {CONTENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CONTENT_TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Select name="approval_status" defaultValue={approvalStatus ?? ""} className="w-40">
              <option value="">Any status</option>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="retired">Retired</option>
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
        <Link href="/log/library/new">
          <Button type="button">+ New content item</Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No content items match these filters.
        </div>
      ) : (
        <TableFrame>
          <Table>
            <thead>
              <HeaderRow>
                <Th>Title</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Expected duration</Th>
                <Th>Effective from</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {items.map((item) => (
                <Row key={item.id}>
                  <Cell className="font-semibold text-ink-900">
                    <Link href={`/log/library/${item.id}`} className="text-brand-link">
                      {item.title}
                    </Link>
                  </Cell>
                  <Cell>{CONTENT_TYPE_LABEL[item.content_type]}</Cell>
                  <Cell>
                    <Badge variant={APPROVAL_STATUS_VARIANT[item.approval_status]}>
                      {item.approval_status}
                    </Badge>
                  </Cell>
                  <Cell>
                    {item.expected_duration_seconds ? `${item.expected_duration_seconds}s` : "—"}
                  </Cell>
                  <Cell className="text-ink-500">{item.effective_from}</Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
