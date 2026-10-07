import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listCopy, type CopyListRow } from "@/lib/underwriting/queries";
import { isPortalAssignedCut, needsRecording } from "@/lib/underwriting/dad-cut";
import { stationTodayISO } from "@/lib/log/timezone";
import { Button } from "@/components/ui/button";
import { setCopyRecorded } from "../copy-actions";
import { requireUnderwritingAccess } from "@/lib/underwriting/access";
import type { UwCopyApprovalStatus } from "@/lib/database.types";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { COPY_APPROVAL_STATUS } from "@/lib/underwriting/status";

const FILTERS = ["all", "approved", "draft", "to-record", "needs-cut", "inactive"] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(item: CopyListRow, filter: Filter, todayISO: string): boolean {
  const status: UwCopyApprovalStatus = item.approval_status;
  if (filter === "all") return true;
  if (filter === "to-record") return needsRecording(item, todayISO);
  if (filter === "needs-cut") return item.dad_cut === null;
  if (filter === "inactive") return status === "expired" || status === "retired";
  return status === filter;
}

/** The copy library (docs/ui-patterns.md): search, an approval filter, and "+ New copy" over a full-width table. */
export default async function CopyLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { isAdministrator, isProduction } = await requireUnderwritingAccess();
  const { q, status } = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(status ?? "")
    ? (status as Filter)
    : "all";
  const query = (q ?? "").trim().toLowerCase();
  const copy = await listCopy();
  const today = stationTodayISO();

  const matching = copy.filter(
    (item) =>
      query === "" ||
      item.label.toLowerCase().includes(query) ||
      (item.script ?? "").toLowerCase().includes(query) ||
      (item.underwriter_name ?? "").toLowerCase().includes(query) ||
      (item.dad_cut ?? "").toLowerCase().includes(query),
  );
  const count = (next: Filter) =>
    matching.filter((item) => matchesFilter(item, next, today)).length;
  const shown = matching.filter((item) => matchesFilter(item, filter, today));
  const hrefFor = (next: Filter) =>
    `/underwriting/copy?${new URLSearchParams({
      ...(query ? { q: q ?? "" } : {}),
      ...(next !== "all" ? { status: next } : {}),
    }).toString()}`.replace(/\?$/, "");

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={{
          placeholder: "Search underwriter, script, or DAD cut",
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
            label: "To record",
            count: count("to-record"),
            href: hrefFor("to-record"),
            active: filter === "to-record",
          },
          {
            label: "Needs a DAD cut",
            count: count("needs-cut"),
            href: hrefFor("needs-cut"),
            active: filter === "needs-cut",
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
          <TextLink href="/underwriting/setup/migration/copy">Import from RadioTraffic</TextLink>
        )}
        <PrimaryLink href="/underwriting/copy/new">
          <span>
            + New<span className="max-sm:sr-only"> copy</span>
          </span>
        </PrimaryLink>
      </ListToolbar>

      {shown.length === 0 ? (
        <EmptyState>
          {copy.length === 0
            ? "No copy yet — usually created from a contract's own page."
            : filter === "to-record"
              ? "Nothing to record. Every message that can air has its recording in DAD."
              : "No copy matches."}
        </EmptyState>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Copy</Th>
                <Th>Script</Th>
                <Th>Length</Th>
                <Th>Airs as</Th>
                <Th>DAD cut</Th>
                <Th>Approval</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {shown.map((item) => (
                <Row key={item.id}>
                  <Cell stack="title">
                    <TextLink href={`/underwriting/copy/${item.id}`}>{item.label}</TextLink>
                    {item.underwriter_name && (
                      <div className="text-xs text-ink-500">{item.underwriter_name}</div>
                    )}
                  </Cell>
                  <Cell stack="full" className="text-ink-500">
                    <div className="max-w-xs truncate max-md:line-clamp-2 max-md:max-w-none max-md:whitespace-normal">
                      {item.script ?? "—"}
                    </div>
                  </Cell>
                  <Cell label="Length" className="whitespace-nowrap text-ink-500">
                    {item.duration_seconds ? `${item.duration_seconds}s` : "—"}
                  </Cell>
                  <Cell label="Airs as" className="text-ink-500">
                    {item.execution_kind === "recorded" ? "Recorded spot" : "Live read"}
                  </Cell>
                  <Cell label="DAD cut" className="whitespace-nowrap">
                    {item.dad_cut ? (
                      <>
                        <span className="font-mono font-bold text-ink-900">{item.dad_cut}</span>
                        {!isPortalAssignedCut(item.dad_cut) ? (
                          <div className="text-xs text-ink-500">Existing DAD spot</div>
                        ) : item.dad_recorded_at ? (
                          <div className="text-xs text-ink-500">Recorded</div>
                        ) : needsRecording(item, today) ? (
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <Badge variant="warning">To record</Badge>
                            {isProduction && filter === "to-record" && (
                              <form action={setCopyRecorded}>
                                <input type="hidden" name="copy_id" value={item.id} />
                                <input type="hidden" name="recorded" value="1" />
                                <input type="hidden" name="return_to" value="to-record" />
                                <Button
                                  type="submit"
                                  variant="secondary"
                                  className="px-2.5 py-1.5 text-xs"
                                >
                                  Mark recorded
                                </Button>
                              </form>
                            )}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <Link href={`/underwriting/copy/${item.id}/edit`}>
                        <Badge variant="warning">Pick a DAD spot</Badge>
                      </Link>
                    )}
                  </Cell>
                  <Cell stack="aside">
                    <StatusBadge map={COPY_APPROVAL_STATUS} value={item.approval_status} />
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
