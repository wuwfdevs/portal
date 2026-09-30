import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listCopy } from "@/lib/underwriting/queries";
import { requireUnderwritingAccess } from "@/lib/underwriting/access";
import type { UwCopyApprovalStatus } from "@/lib/database.types";

const APPROVAL_VARIANT: Record<UwCopyApprovalStatus, BadgeVariant> = {
  draft: "neutral",
  approved: "success",
  expired: "muted",
  retired: "muted",
};

const FILTERS = ["all", "approved", "draft", "inactive"] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(status: UwCopyApprovalStatus, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "inactive") return status === "expired" || status === "retired";
  return status === filter;
}

/** The copy library (docs/ui-patterns.md): search, an approval filter, and "+ New copy" over a full-width table. */
export default async function CopyLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { isAdministrator } = await requireUnderwritingAccess();
  const { q, status } = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(status ?? "")
    ? (status as Filter)
    : "all";
  const query = (q ?? "").trim().toLowerCase();
  const copy = await listCopy();

  const matching = copy.filter(
    (item) =>
      query === "" ||
      item.label.toLowerCase().includes(query) ||
      (item.script ?? "").toLowerCase().includes(query) ||
      (item.cart_identifier ?? "").toLowerCase().includes(query),
  );
  const count = (next: Filter) =>
    matching.filter((item) => matchesFilter(item.approval_status, next)).length;
  const shown = matching.filter((item) => matchesFilter(item.approval_status, filter));
  const hrefFor = (next: Filter) =>
    `/underwriting/copy?${new URLSearchParams({
      ...(query ? { q: q ?? "" } : {}),
      ...(next !== "all" ? { status: next } : {}),
    }).toString()}`.replace(/\?$/, "");

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={{
          placeholder: "Search label, script, or cart",
          label: "Search copy",
          defaultValue: q,
          hidden: filter !== "all" ? { status: filter } : undefined,
        }}
        chipsLabel="Filter by approval"
        chips={[
          { label: "All", count: count("all"), href: hrefFor("all"), active: filter === "all" },
          {
            label: "Approved",
            count: count("approved"),
            href: hrefFor("approved"),
            active: filter === "approved",
          },
          {
            label: "Draft",
            count: count("draft"),
            href: hrefFor("draft"),
            active: filter === "draft",
          },
          {
            label: "Expired or retired",
            count: count("inactive"),
            href: hrefFor("inactive"),
            active: filter === "inactive",
          },
        ]}
      >
        {isAdministrator && (
          <Link
            href="/underwriting/migration/copy"
            className="px-1 text-sm font-bold text-brand-link hover:underline"
          >
            Import from RadioTraffic
          </Link>
        )}
        <PrimaryLink href="/underwriting/copy/new">+ New copy</PrimaryLink>
      </ListToolbar>

      {shown.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          {copy.length === 0
            ? "No copy yet — usually created from a contract's own page."
            : "No copy matches."}
        </div>
      ) : (
        <TableFrame>
          <Table>
            <thead>
              <HeaderRow>
                <Th>Label</Th>
                <Th>Script</Th>
                <Th>Duration</Th>
                <Th>Execution</Th>
                <Th>Approval</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {shown.map((item) => (
                <Row key={item.id}>
                  <Cell>
                    <Link
                      href={`/underwriting/copy/${item.id}`}
                      className="font-bold text-brand-link"
                    >
                      {item.label}
                    </Link>
                  </Cell>
                  <Cell className="max-w-xs truncate text-ink-500">{item.script ?? "—"}</Cell>
                  <Cell className="whitespace-nowrap text-ink-500">
                    {item.duration_seconds ? `${item.duration_seconds}s` : "—"}
                  </Cell>
                  <Cell className="text-ink-500">
                    {item.execution_kind === "recorded" ? "Recorded" : "Live read"}
                  </Cell>
                  <Cell>
                    <Badge variant={APPROVAL_VARIANT[item.approval_status]}>
                      {item.approval_status}
                    </Badge>
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
      <p className="text-xs text-ink-500">
        Copy is usually created from a contract&apos;s own setup, which links it to the contract in
        the same step; copy created here is linked from the contract afterward.
      </p>
    </div>
  );
}
