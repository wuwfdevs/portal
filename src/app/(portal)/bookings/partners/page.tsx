import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { PARTNERS_PATH, partnerHref } from "@/lib/bookings/paths";
import { PARTNER_KIND_LABEL } from "@/lib/bookings/projects";
import { countPartners, listPartnersPage, type PartnerListView } from "@/lib/bookings/queries";
import { isPastLastPage, pageHref, pageInfo, parsePage } from "@/lib/pagination";

const VIEWS: readonly PartnerListView[] = ["all", "uwf_unit", "external"];

/**
 * The Partners tab (docs/bookings-design.md §4): every unit or outside
 * organization WUWF produces for, with its agreements and open requests,
 * searched, filtered and paged in the query (docs/ui-patterns.md).
 */
export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; page?: string }>;
}) {
  const [params, context] = await Promise.all([searchParams, requireBookingsAccess()]);
  const view: PartnerListView = (VIEWS as readonly string[]).includes(params.view ?? "")
    ? (params.view as PartnerListView)
    : "all";
  const q = params.q?.trim() || null;
  const page = parsePage(params.page);

  const [{ rows, total }, ...counts] = await Promise.all([
    listPartnersPage({ view, q, page }),
    ...VIEWS.map((candidate) => countPartners(candidate, q)),
  ]);
  const info = pageInfo(page, total);
  const listParams = { view: view === "all" ? null : view, q };
  if (isPastLastPage(info)) redirect(pageHref(PARTNERS_PATH, listParams, info.pageCount));
  const canCreate = context.isProduction || context.isDirector || context.isExecutive;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-serif text-[17px] font-bold text-ink-900">Partners</h2>
      <ListToolbar
        search={{
          placeholder: "Search by name",
          label: "Search partners",
          defaultValue: q ?? "",
          hidden: view === "all" ? {} : { view },
        }}
        filters={[
          {
            label: "Kind",
            chips: VIEWS.map((candidate, index) => ({
              label: candidate === "all" ? "All" : PARTNER_KIND_LABEL[candidate],
              count: counts[index],
              href: pageHref(PARTNERS_PATH, { view: candidate === "all" ? null : candidate, q }, 1),
              active: candidate === view,
            })),
          },
        ]}
      >
        {canCreate && (
          <PrimaryLink href={`${PARTNERS_PATH}/new`}>
            <span>
              + New<span className="max-sm:sr-only"> partner</span>
            </span>
          </PrimaryLink>
        )}
      </ListToolbar>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-line bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink-900">
            {q ? "No partners match." : "No partners yet."}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-ink-500">
            A partner is a UWF unit or an outside organization WUWF produces for. One is added here,
            or named on a request; an agreement — a standing arrangement with a reserve share and
            reserved blocks — is drafted on the partner&apos;s page.
          </p>
        </div>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Partner</Th>
                <Th>Contact</Th>
                <Th>Agreements</Th>
                <Th>Open requests</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {rows.map((partner) => (
                <Row key={partner.id}>
                  <Cell stack="title">
                    <Link
                      href={partnerHref(partner.id)}
                      className="font-semibold text-brand-link hover:underline"
                    >
                      {partner.name}
                    </Link>
                    <span className="block text-xs text-ink-500">
                      {PARTNER_KIND_LABEL[partner.kind]}
                    </span>
                  </Cell>
                  <Cell label="Contact" className="text-xs text-ink-700">
                    {[partner.contact_name, partner.contact_email].filter(Boolean).join(" · ") ||
                      "—"}
                  </Cell>
                  <Cell label="Agreements">
                    {partner.agreement_count === 0 ? (
                      <span className="text-ink-400">—</span>
                    ) : (
                      <Badge variant={partner.active_agreement_count > 0 ? "success" : "warning"}>
                        {partner.active_agreement_count > 0
                          ? `${partner.active_agreement_count} active`
                          : `${partner.agreement_count} draft${partner.agreement_count === 1 ? "" : "s"}`}
                      </Badge>
                    )}
                  </Cell>
                  <Cell label="Open requests" stack="aside">
                    {partner.open_project_count}
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
      <Pagination info={info} path={PARTNERS_PATH} params={listParams} noun="partners" />
    </div>
  );
}
