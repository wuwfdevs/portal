import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { requireUnderwritingAccess } from "@/lib/underwriting/access";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import {
  listContractDeliveryRollups,
  listContracts,
  listExceptions,
  listIndustryCategories,
} from "@/lib/underwriting/queries";
import type { UwContractStatus } from "@/lib/database.types";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { CONTRACT_STATUS } from "@/lib/underwriting/status";
import { pluralize } from "@/lib/format";
import { countBy } from "@/lib/collections";

const FILTERS = ["all", "active", "draft", "attention"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * The contracts list (docs/underwriting-traffic-redesign.md §11): search by
 * underwriter or order number, a status filter, and a delivery bar per
 * contract — aired and scheduled credits against the current revision's
 * compiled demand. Creating a contract moved to its own four-step setup at
 * /underwriting/contracts/new.
 */
export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(status ?? "")
    ? (status as Filter)
    : "all";
  const query = (q ?? "").trim().toLowerCase();
  const { isAdministrator } = await requireUnderwritingAccess();

  const [contracts, exceptions, categories] = await Promise.all([
    listContracts(),
    listExceptions(),
    listIndustryCategories(),
  ]);
  const rollups = await listContractDeliveryRollups(contracts.map((contract) => contract.id));
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  const openExceptionsByContract = countBy(
    exceptions.filter((exception) => exception.resolution_status === "open"),
    (exception) => exception.contract.id,
  );

  const needsAttention = (contractId: string, contractStatus: UwContractStatus): boolean =>
    (openExceptionsByContract.get(contractId) ?? 0) > 0 || contractStatus === "draft";

  const matching = contracts.filter(
    (contract) =>
      query === "" ||
      contract.underwriter.name.toLowerCase().includes(query) ||
      (contract.contract_identifier ?? "").toLowerCase().includes(query),
  );
  const counts = {
    all: matching.length,
    active: matching.filter((contract) => contract.status === "active").length,
    draft: matching.filter((contract) => contract.status === "draft").length,
    attention: matching.filter((contract) => needsAttention(contract.id, contract.status)).length,
  };
  const shown = matching.filter((contract) =>
    filter === "all"
      ? true
      : filter === "attention"
        ? needsAttention(contract.id, contract.status)
        : contract.status === filter,
  );
  const hrefFor = (next: Filter) =>
    `/underwriting/contracts?${new URLSearchParams({
      ...(query ? { q: q ?? "" } : {}),
      ...(next !== "all" ? { status: next } : {}),
    }).toString()}`.replace(/\?$/, "");

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={{
          placeholder: "Search underwriter or order number",
          label: "Search contracts",
          defaultValue: q,
          hidden: filter !== "all" ? { status: filter } : undefined,
        }}
        chipsLabel="Filter by status"
        chips={[
          { label: "All", count: counts.all, href: hrefFor("all"), active: filter === "all" },
          {
            label: "Active",
            count: counts.active,
            href: hrefFor("active"),
            active: filter === "active",
          },
          {
            label: "Draft",
            count: counts.draft,
            href: hrefFor("draft"),
            active: filter === "draft",
          },
          {
            label: "Needs attention",
            count: counts.attention,
            href: hrefFor("attention"),
            active: filter === "attention",
          },
        ]}
      >
        {isAdministrator && (
          <TextLink href="/underwriting/setup/migration">Migrate legacy records</TextLink>
        )}
        <PrimaryLink href="/underwriting/contracts/new">
          <span>
            + New<span className="max-sm:sr-only"> contract</span>
          </span>
        </PrimaryLink>
      </ListToolbar>

      {shown.length === 0 ? (
        <EmptyState>
          {contracts.length === 0 ? "No contracts yet." : "No contracts match."}
        </EmptyState>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Underwriter · order</Th>
                <Th>Runs</Th>
                <Th>Delivery</Th>
                <Th>Attention</Th>
                <Th>Status</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {shown.map((contract) => {
                const rollup = rollups.get(contract.id);
                const openExceptions = openExceptionsByContract.get(contract.id) ?? 0;
                const industry = contract.underwriter.category_id
                  ? categoryNameById.get(contract.underwriter.category_id)
                  : null;
                const fulfilled =
                  rollup != null && rollup.expected > 0 && rollup.delivered >= rollup.expected;
                return (
                  <Row key={contract.id}>
                    <Cell stack="title">
                      <TextLink href={`/underwriting/contracts/${contract.id}`}>
                        {contract.underwriter.name}
                      </TextLink>
                      <div className="mt-0.5 text-xs text-ink-500">
                        {orderNumberLabel(contract.contract_identifier)}
                        {industry ? ` · ${industry}` : ""}
                      </div>
                    </Cell>
                    <Cell label="Runs" className="whitespace-nowrap">
                      <div className="text-ink-900">
                        {contract.effective_from}
                        {contract.effective_to ? ` – ${contract.effective_to}` : ""}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">
                        {rollup?.scheduleSummary ?? "No current revision"}
                      </div>
                    </Cell>
                    <Cell label="Delivery">
                      {contract.status === "draft" ? (
                        <span className="text-[13px] text-ink-500">Setup in progress</span>
                      ) : rollup && rollup.expected > 0 ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <ProgressBar
                            label="Spots delivered"
                            done={rollup.delivered}
                            pending={rollup.scheduled}
                            total={rollup.expected}
                            complete={fulfilled}
                            className="w-36"
                          />
                          <span className="whitespace-nowrap text-[13px] text-ink-700">
                            {fulfilled
                              ? `${rollup.delivered} aired of ${rollup.expected} · fulfilled`
                              : `${rollup.delivered} aired · ${rollup.scheduled} scheduled of ${rollup.expected}`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[13px] text-ink-500">No demand</span>
                      )}
                    </Cell>
                    <Cell label="Attention">
                      {openExceptions > 0 ? (
                        <Badge variant="warning">
                          {pluralize(openExceptions, "exception")} open
                        </Badge>
                      ) : contract.status === "draft" ? (
                        <Badge variant="warning">Finish setup</Badge>
                      ) : (
                        <span className="text-[13px] text-ink-500">—</span>
                      )}
                    </Cell>
                    <Cell stack="aside">
                      <StatusBadge map={CONTRACT_STATUS} value={contract.status} />
                    </Cell>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}
      <p className="text-xs text-ink-500">
        Delivery counts aired and scheduled credits against the current revision&apos;s compiled
        demand. Bonus lines report but never read as behind.
      </p>
    </div>
  );
}
