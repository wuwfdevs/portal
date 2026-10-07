import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { formatUpdatedDate } from "@/lib/resources/articles";
import { requireResourcesAccess } from "@/lib/resources/access";
import { isPastLastPage, pageHref, pageInfo, parsePage } from "@/lib/pagination";
import {
  articleHref,
  countProcedures,
  listProcedureAreaCounts,
  listProcedures,
} from "@/lib/resources/queries";

/**
 * The full, filterable, paginated procedures list — split out of the
 * Resources home page (docs/ui-patterns.md's pagination reference
 * implementation lives here now) so the home page can stay a short preview.
 * Area chips come from listProcedureAreaCounts(), the real areas in use, not
 * a fixed list — see that function's comment.
 */
export default async function ProceduresListPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; page?: string }>;
}) {
  const [{ area, page }, { isEditor }] = await Promise.all([
    searchParams,
    requireResourcesAccess(),
  ]);
  const activeArea = area?.trim() || null;
  const pageNum = parsePage(page);

  const [{ rows, total }, allCount, areaCounts] = await Promise.all([
    listProcedures({ area: activeArea, page: pageNum }),
    countProcedures(null),
    listProcedureAreaCounts(),
  ]);

  const listParams = { area: activeArea };
  const info = pageInfo(pageNum, total);
  if (isPastLastPage(info)) redirect(pageHref("/resources/procedures", listParams, info.pageCount));
  const areaHref = (value: string | null) => pageHref("/resources/procedures", { area: value }, 1);

  return (
    <>
      <PageHeader
        size="page"
        className="mb-6"
        back={{ href: "/resources", label: "Back to resources" }}
        title="Station procedures"
        description="SOPs written and kept current by designated editors, grouped by area."
      />

      <ListToolbar
        chips={[
          { label: "All", count: allCount, href: areaHref(null), active: !activeArea },
          ...areaCounts.map((entry) => ({
            label: entry.area,
            count: entry.count,
            href: areaHref(entry.area),
            active: activeArea === entry.area,
          })),
        ]}
        chipsLabel="Area"
        className="mb-4"
      >
        {isEditor && (
          <PrimaryLink href="/resources/procedures/new">
            <span>
              + New<span className="max-sm:sr-only"> procedure</span>
            </span>
          </PrimaryLink>
        )}
      </ListToolbar>

      {rows.length === 0 ? (
        <EmptyState>
          {activeArea ? `No procedures in ${activeArea} yet.` : "No procedures yet."}
        </EmptyState>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Procedure</Th>
                <Th>Area</Th>
                <Th>Owner</Th>
                <Th>Updated</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {rows.map((procedure) => (
                // The title link stretches over the row, so the whole row opens it.
                <Row key={procedure.id} className="relative">
                  <Cell stack="title">
                    <Link
                      href={articleHref(procedure, null)}
                      className="font-semibold text-brand-link after:absolute after:inset-0 hover:underline"
                    >
                      {procedure.title}
                    </Link>
                    {procedure.summary && (
                      <p className="mt-0.5 text-xs text-ink-400">{procedure.summary}</p>
                    )}
                  </Cell>
                  <Cell label="Area" className="whitespace-nowrap text-ink-500">
                    {procedure.area}
                  </Cell>
                  <Cell label="Owner" className="whitespace-nowrap text-ink-500">
                    {procedure.owner_role ?? "—"}
                  </Cell>
                  <Cell label="Updated" className="whitespace-nowrap text-ink-500">
                    {formatUpdatedDate(procedure.updated_at, true)}
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
      <Pagination info={info} path="/resources/procedures" params={listParams} noun="procedures" />
    </>
  );
}
