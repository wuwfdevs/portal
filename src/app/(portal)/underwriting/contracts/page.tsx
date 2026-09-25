import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { FilterChips } from "@/components/ui/filter-chips";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import {
  listContractDeliveryRollups,
  listContracts,
  listExceptions,
  listIndustryCategories,
} from "@/lib/underwriting/queries";
import type { UwContractStatus } from "@/lib/database.types";

const STATUS_VARIANT: Record<UwContractStatus, BadgeVariant> = {
  draft: "neutral",
  active: "success",
  expired: "muted",
  terminated: "danger",
};

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

  const [contracts, exceptions, categories] = await Promise.all([
    listContracts(),
    listExceptions(),
    listIndustryCategories(),
  ]);
  const rollups = await listContractDeliveryRollups(contracts.map((contract) => contract.id));
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  const openExceptionsByContract = new Map<string, number>();
  for (const exception of exceptions) {
    if (exception.resolution_status !== "open") continue;
    openExceptionsByContract.set(
      exception.contract.id,
      (openExceptionsByContract.get(exception.contract.id) ?? 0) + 1,
    );
  }

  const needsAttention = (contractId: string, contractStatus: UwContractStatus): boolean =>
    (openExceptionsByContract.get(contractId) ?? 0) > 0 || contractStatus === "draft";

  const matching = contracts.filter(
    (contract) =>
      query === "" ||
      contract.underwriter.name.toLowerCase().includes(query) ||
      contract.contract_identifier.toLowerCase().includes(query),
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
      <div className="flex flex-wrap items-center gap-3">
        <form method="get" className="w-full sm:w-80">
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search underwriter or order number"
            aria-label="Search contracts"
          />
        </form>
        <FilterChips
          label="Filter by status"
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
        />
        <span className="flex-1" />
        <Link
          href="/underwriting/contracts/new"
          className="inline-flex items-center justify-center gap-1.5 rounded bg-brand-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2278B8]"
        >
          + New contract
        </Link>
      </div>

      {shown.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          {contracts.length === 0 ? "No contracts yet." : "No contracts match."}
        </div>
      ) : (
        <TableFrame>
          <Table>
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
                    <Cell>
                      <Link
                        href={`/underwriting/contracts/${contract.id}`}
                        className="font-bold text-brand-link"
                      >
                        {contract.underwriter.name}
                      </Link>
                      <div className="mt-0.5 text-xs text-ink-500">
                        {contract.contract_identifier}
                        {industry ? ` · ${industry}` : ""}
                      </div>
                    </Cell>
                    <Cell className="whitespace-nowrap">
                      <div className="text-ink-900">
                        {contract.effective_from}
                        {contract.effective_to ? ` – ${contract.effective_to}` : ""}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">
                        {rollup?.scheduleSummary ?? "No current revision"}
                      </div>
                    </Cell>
                    <Cell>
                      {contract.status === "draft" ? (
                        <span className="text-[13px] text-ink-500">Setup in progress</span>
                      ) : rollup && rollup.expected > 0 ? (
                        <div className="flex items-center gap-3">
                          <ProgressBar
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
                    <Cell>
                      {openExceptions > 0 ? (
                        <Badge variant="warning">
                          {openExceptions} exception{openExceptions === 1 ? "" : "s"} open
                        </Badge>
                      ) : contract.status === "draft" ? (
                        <Badge variant="warning">Finish setup</Badge>
                      ) : (
                        <span className="text-[13px] text-ink-500">—</span>
                      )}
                    </Cell>
                    <Cell>
                      <Badge variant={STATUS_VARIANT[contract.status]}>{contract.status}</Badge>
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
