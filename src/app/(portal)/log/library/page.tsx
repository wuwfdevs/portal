import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { computeTotalDurationSeconds, CONTENT_TYPE_LABEL } from "@/lib/log/content-library";
import { APPROVAL_STATUS } from "@/lib/log/status-badges";
import { countContentItems, listContentLibraryPage } from "@/lib/log/queries";
import { isPastLastPage, pageHref, pageInfo, parsePage } from "@/lib/pagination";
import type { LogApprovalStatus, LogContentType } from "@/lib/database.types";

const PATH = "/log/library";
const CONTENT_TYPES = Object.keys(CONTENT_TYPE_LABEL) as LogContentType[];
const APPROVAL_STATUSES = ["approved", "draft", "retired"] as const;
const APPROVAL_STATUS_LABEL: Record<LogApprovalStatus, string> = {
  approved: "Approved",
  draft: "Draft",
  retired: "Retired",
};

/**
 * The content library (docs/ui-patterns.md): search, approval-status chips
 * with counts, content-type chips, and a paginated table. Everything is
 * filtered in the query — the library is close to PostgREST's 1000-row cap,
 * past which an unpaginated select silently drops rows.
 */
export default async function ContentLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    content_type?: string;
    approval_status?: string;
    page?: string;
  }>;
}) {
  const {
    q,
    content_type: contentTypeParam,
    approval_status: approvalStatusParam,
    page,
  } = await searchParams;
  const search = q?.trim() || undefined;
  const contentType = CONTENT_TYPES.includes(contentTypeParam as LogContentType)
    ? (contentTypeParam as LogContentType)
    : undefined;
  const approvalStatus = (APPROVAL_STATUSES as readonly string[]).includes(
    approvalStatusParam ?? "",
  )
    ? (approvalStatusParam as LogApprovalStatus)
    : undefined;
  const pageNum = parsePage(page);

  // Status counts respect the search and the type filter, so each chip says
  // how many rows it would show.
  const [{ rows, total }, allCount, ...statusCounts] = await Promise.all([
    listContentLibraryPage({ search, contentType, approvalStatus, page: pageNum }),
    countContentItems({ search, contentType }),
    ...APPROVAL_STATUSES.map((status) =>
      countContentItems({ search, contentType, approvalStatus: status }),
    ),
  ]);

  const listParams = { q: search, content_type: contentType, approval_status: approvalStatus };
  const info = pageInfo(pageNum, total);
  if (isPastLastPage(info)) redirect(pageHref(PATH, listParams, info.pageCount));
  const hrefWith = (changes: Partial<typeof listParams>) =>
    pageHref(PATH, { ...listParams, ...changes }, 1);

  const filtered = Boolean(search || contentType || approvalStatus);

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={{
          placeholder: "Search title, cart, or script",
          label: "Search the content library",
          defaultValue: search,
          hidden: {
            ...(contentType ? { content_type: contentType } : {}),
            ...(approvalStatus ? { approval_status: approvalStatus } : {}),
          },
        }}
        filters={[
          {
            label: "Status",
            chips: [
              {
                label: "All",
                count: allCount,
                href: hrefWith({ approval_status: undefined }),
                active: !approvalStatus,
              },
              ...APPROVAL_STATUSES.map((status, index) => ({
                label: APPROVAL_STATUS_LABEL[status],
                count: statusCounts[index],
                href: hrefWith({ approval_status: status }),
                active: approvalStatus === status,
              })),
            ],
          },
          {
            label: "Type",
            chips: [
              {
                label: "All types",
                href: hrefWith({ content_type: undefined }),
                active: !contentType,
              },
              ...CONTENT_TYPES.map((type) => ({
                label: CONTENT_TYPE_LABEL[type],
                href: hrefWith({ content_type: type }),
                active: contentType === type,
              })),
            ],
          },
        ]}
      >
        <TextLink href="/log/library/import" className="hover:underline">
          Import from DAD
        </TextLink>
        <PrimaryLink href="/log/library/new">
          <span>
            + New<span className="max-sm:sr-only"> content item</span>
          </span>
        </PrimaryLink>
      </ListToolbar>

      {rows.length === 0 ? (
        <EmptyState>
          {filtered ? (
            <>
              No content items match.{" "}
              <Link href={PATH} className="font-semibold text-brand-link hover:underline">
                Clear search and filters
              </Link>
            </>
          ) : (
            "The content library is empty."
          )}
        </EmptyState>
      ) : (
        <div>
          <TableFrame>
            <Table stack>
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
                {rows.map((item) => {
                  const totalDurationSeconds = computeTotalDurationSeconds(
                    item.components,
                    item.expected_duration_seconds,
                  );
                  return (
                    <Row key={item.id}>
                      <Cell stack="title" className="font-semibold text-ink-900">
                        <Link href={`${PATH}/${item.id}`} className="text-brand-link">
                          {item.title}
                        </Link>
                      </Cell>
                      <Cell label="Type">{CONTENT_TYPE_LABEL[item.content_type]}</Cell>
                      <Cell stack="aside">
                        <StatusBadge map={APPROVAL_STATUS} value={item.approval_status} />
                      </Cell>
                      <Cell label="Duration">
                        {totalDurationSeconds ? `${totalDurationSeconds}s` : "—"}
                      </Cell>
                      <Cell label="Effective" className="text-ink-500">
                        {item.effective_from}
                      </Cell>
                    </Row>
                  );
                })}
              </tbody>
            </Table>
          </TableFrame>
          <Pagination info={info} path={PATH} params={listParams} noun="content items" />
        </div>
      )}
    </div>
  );
}
