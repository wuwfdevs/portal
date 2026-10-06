import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { TREATMENT_SHORT_LABEL } from "@/lib/bookings/labels";
import { REQUESTS_PATH, requestHref } from "@/lib/bookings/paths";
import {
  DISPOSITION_BADGE,
  DISPOSITION_LABEL,
  REQUESTED_LABEL,
  STAGES,
  STAGE_LABEL,
  estimateState,
} from "@/lib/bookings/projects";
import { countProjects, listProjectsPage, type ProjectListView } from "@/lib/bookings/queries";
import { isPastLastPage, pageHref, pageInfo, parsePage } from "@/lib/pagination";
import { formatDateShort } from "@/lib/log/program-status";

const VIEWS: readonly ProjectListView[] = ["open", ...STAGES, "closed"];

/**
 * The Requests list (docs/bookings-design.md §4): every project with stage
 * chips, searched, filtered and paged in the query (docs/ui-patterns.md).
 */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; page?: string }>;
}) {
  const [params, context] = await Promise.all([searchParams, requireBookingsAccess()]);
  const view: ProjectListView = (VIEWS as readonly string[]).includes(params.view ?? "")
    ? (params.view as ProjectListView)
    : "open";
  const q = params.q?.trim() || null;
  const page = parsePage(params.page);
  const nowISO = new Date().toISOString();

  const [{ rows, total }, ...counts] = await Promise.all([
    listProjectsPage({ view, q, page }),
    ...VIEWS.map((candidate) => countProjects(candidate, q)),
  ]);
  const info = pageInfo(page, total);
  const listParams = { view: view === "open" ? null : view, q };
  if (isPastLastPage(info)) redirect(pageHref(REQUESTS_PATH, listParams, info.pageCount));
  const canCreate = context.isProduction || context.isDirector || context.isExecutive;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-serif text-[17px] font-bold text-ink-900">Requests</h2>
      <ListToolbar
        search={{
          placeholder: "Search by title",
          label: "Search requests",
          defaultValue: q ?? "",
          hidden: view === "open" ? {} : { view },
        }}
        filters={[
          {
            label: "Stage",
            chips: VIEWS.map((candidate, index) => ({
              label:
                candidate === "open"
                  ? "Open"
                  : candidate === "closed"
                    ? "Closed"
                    : STAGE_LABEL[candidate],
              count: counts[index],
              href: pageHref(
                REQUESTS_PATH,
                { view: candidate === "open" ? null : candidate, q },
                1,
              ),
              active: candidate === view,
            })),
          },
        ]}
      >
        {canCreate && (
          <PrimaryLink href={`${REQUESTS_PATH}/new`}>
            <span>
              + New<span className="max-sm:sr-only"> request</span>
            </span>
          </PrimaryLink>
        )}
      </ListToolbar>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-line bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink-900">
            {q ? "No requests match." : view === "open" ? "No open requests." : "Nothing here."}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-ink-500">
            A request arrives from a partner or is entered by production staff, gets an estimate,
            and is booked once the partner approves.
          </p>
        </div>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Request</Th>
                <Th>Partner</Th>
                <Th>Event</Th>
                <Th>Priced as</Th>
                <Th>Stage</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {rows.map((project) => {
                const estimate = estimateState(project, nowISO);
                return (
                  <Row key={project.id}>
                    <Cell stack="title">
                      <Link
                        href={requestHref(project.id)}
                        className="font-semibold text-brand-link hover:underline"
                      >
                        {project.title}
                      </Link>
                      <span className="block text-xs text-ink-500">
                        {REQUESTED_LABEL[project.requested]}
                      </span>
                    </Cell>
                    <Cell label="Partner">{project.partner_name}</Cell>
                    <Cell label="Event">
                      {project.event_starts_on
                        ? `${formatDateShort(project.event_starts_on)}${
                            project.event_ends_on &&
                            project.event_ends_on !== project.event_starts_on
                              ? ` – ${formatDateShort(project.event_ends_on)}`
                              : ""
                          }`
                        : "—"}
                    </Cell>
                    <Cell label="Priced as">
                      {project.priced_as ? TREATMENT_SHORT_LABEL[project.priced_as] : "—"}
                    </Cell>
                    <Cell stack="aside">
                      {project.disposition ? (
                        <Badge variant={DISPOSITION_BADGE[project.disposition]}>
                          {DISPOSITION_LABEL[project.disposition]}
                        </Badge>
                      ) : (
                        <Badge variant={estimate.kind === "expired" ? "warning" : "accent"}>
                          {estimate.kind === "expired"
                            ? "Estimate expired"
                            : STAGE_LABEL[project.stage]}
                        </Badge>
                      )}
                    </Cell>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}
      <Pagination info={info} path={REQUESTS_PATH} params={listParams} noun="requests" />
    </div>
  );
}
