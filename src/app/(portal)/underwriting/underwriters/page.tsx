import Link from "next/link";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import {
  listIndustryCategories,
  listUnderwriterContractCounts,
  listUnderwriters,
  type UnderwriterContractCounts,
} from "@/lib/underwriting/queries";

const FILTERS = ["all", "active", "none"] as const;
type Filter = (typeof FILTERS)[number];

/** "2 active · 1 other", "1 inactive", or "—". */
function describeContracts(counts: UnderwriterContractCounts | undefined): string {
  if (!counts || (counts.active === 0 && counts.other === 0)) return "—";
  if (counts.active === 0) return `${counts.other} inactive`;
  return counts.other > 0
    ? `${counts.active} active · ${counts.other} other`
    : `${counts.active} active`;
}

/**
 * The underwriters list (docs/ui-patterns.md): a toolbar — search, a
 * has-an-active-contract filter, the Industries lookup, "+ New underwriter"
 * — over a full-width table. Creating one has its own page at /new, and
 * the industry list its own view at /industries.
 */
export default async function UnderwritersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; contracts?: string }>;
}) {
  const { q, contracts } = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(contracts ?? "")
    ? (contracts as Filter)
    : "all";
  const query = (q ?? "").trim().toLowerCase();
  const [underwriters, categories, counts] = await Promise.all([
    listUnderwriters(),
    listIndustryCategories(),
    listUnderwriterContractCounts(),
  ]);
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

  const matching = underwriters.filter(
    (underwriter) =>
      query === "" ||
      underwriter.name.toLowerCase().includes(query) ||
      (underwriter.contact_name ?? "").toLowerCase().includes(query) ||
      (underwriter.email ?? "").toLowerCase().includes(query),
  );
  const hasActive = (id: string) => (counts.get(id)?.active ?? 0) > 0;
  const chipCounts = {
    all: matching.length,
    active: matching.filter((underwriter) => hasActive(underwriter.id)).length,
    none: matching.filter((underwriter) => !hasActive(underwriter.id)).length,
  };
  const shown = matching.filter((underwriter) =>
    filter === "all" ? true : hasActive(underwriter.id) === (filter === "active"),
  );
  const hrefFor = (next: Filter) =>
    `/underwriting/underwriters?${new URLSearchParams({
      ...(query ? { q: q ?? "" } : {}),
      ...(next !== "all" ? { contracts: next } : {}),
    }).toString()}`.replace(/\?$/, "");

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={{
          placeholder: "Search underwriter or contact",
          label: "Search underwriters",
          defaultValue: q,
          hidden: filter !== "all" ? { contracts: filter } : undefined,
        }}
        chipsLabel="Filter by contracts"
        chips={[
          { label: "All", count: chipCounts.all, href: hrefFor("all"), active: filter === "all" },
          {
            label: "Active contract",
            count: chipCounts.active,
            href: hrefFor("active"),
            active: filter === "active",
          },
          {
            label: "No active contract",
            count: chipCounts.none,
            href: hrefFor("none"),
            active: filter === "none",
          },
        ]}
      >
        <Link
          href="/underwriting/setup/industries"
          className="px-1 text-sm font-bold text-brand-link hover:underline"
        >
          Industries
        </Link>
        <PrimaryLink href="/underwriting/underwriters/new">
          <span>
            + New<span className="max-sm:sr-only"> underwriter</span>
          </span>
        </PrimaryLink>
      </ListToolbar>

      {shown.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          {underwriters.length === 0 ? "No underwriters yet." : "No underwriters match."}
        </div>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Name</Th>
                <Th>Industry</Th>
                <Th>Contact</Th>
                <Th>Contracts</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {shown.map((underwriter) => (
                <Row key={underwriter.id}>
                  <Cell stack="title">
                    <Link
                      href={`/underwriting/underwriters/${underwriter.id}`}
                      className="font-bold text-brand-link"
                    >
                      {underwriter.name}
                    </Link>
                  </Cell>
                  <Cell label="Industry" className="text-ink-500">
                    {underwriter.category_id
                      ? (categoryNameById.get(underwriter.category_id) ?? "—")
                      : "—"}
                  </Cell>
                  <Cell label="Contact" className="break-words text-ink-500">
                    {underwriter.contact_name ?? (underwriter.email ? "" : "—")}
                    {underwriter.email
                      ? `${underwriter.contact_name ? " · " : ""}${underwriter.email}`
                      : ""}
                  </Cell>
                  <Cell label="Contracts" className="whitespace-nowrap text-ink-700">
                    {describeContracts(counts.get(underwriter.id))}
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
