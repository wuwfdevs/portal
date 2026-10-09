import { redirect } from "next/navigation";
import { trimToNull } from "@/lib/validation";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { ActionMenu } from "@/components/ui/action-menu";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { BADGE_LABEL, BADGE_TITLE, badgesFor, projectBadgeFacts } from "@/lib/bookings/badges";
import { PRODUCTION_RATE_LABEL } from "@/lib/bookings/labels";
import { INTAKE_PATH, REQUESTS_PATH, requestHref } from "@/lib/bookings/paths";
import {
  DISPOSITION_STATUS,
  REQUESTED_LABEL,
  STAGES,
  STAGE_LABEL,
  estimateState,
} from "@/lib/bookings/projects";
import {
  countProjects,
  listProjectDateFacts,
  listProjectsPage,
  type ProjectListView,
} from "@/lib/bookings/queries";
import { isPastLastPage, pageHref, pageInfo, parsePage } from "@/lib/pagination";
import { formatDateShort } from "@/lib/log/program-status";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";

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
  const q = trimToNull(params.q);
  const page = parsePage(params.page);
  const nowISO = new Date().toISOString();

  const [{ rows, total }, ...counts] = await Promise.all([
    listProjectsPage({ view, q, page }),
    ...VIEWS.map((candidate) => countProjects(candidate, q)),
  ]);
  const dateFacts = await listProjectDateFacts(rows.map((row) => row.id));
  const info = pageInfo(page, total);
  const listParams = { view: view === "open" ? null : view, q };
  if (isPastLastPage(info)) redirect(pageHref(REQUESTS_PATH, listParams, info.pageCount));
  const canCreate = context.isProduction || context.isDirector || context.isExecutive;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading>Requests</SectionHeading>
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
        <ActionMenu
          label="More"
          items={[{ label: "Public request form settings", href: INTAKE_PATH }]}
        />
        {canCreate && (
          <PrimaryLink href={`${REQUESTS_PATH}/new`}>
            <span>
              + New<span className="max-sm:sr-only"> request</span>
            </span>
          </PrimaryLink>
        )}
      </ListToolbar>

      {rows.length === 0 ? (
        <EmptyState
          title={q ? "No requests match." : view === "open" ? "No open requests." : "Nothing here."}
        >
          A request arrives from a partner or is entered by production staff, gets an estimate, and
          is booked once the partner approves.
        </EmptyState>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Request</Th>
                <Th>Partner</Th>
                <Th>Event</Th>
                <Th>Rate</Th>
                <Th>Stage</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {rows.map((project) => {
                const estimate = estimateState(project, nowISO);
                const badges = badgesFor(
                  projectBadgeFacts(
                    project,
                    dateFacts.get(project.id) ?? {
                      hasPackageLine: false,
                      openBookings: 0,
                      bookingException: false,
                    },
                  ),
                );
                return (
                  <Row key={project.id}>
                    <Cell stack="title">
                      <TextLink href={requestHref(project.id)}>{project.title}</TextLink>
                      <span className="block text-xs text-ink-500">
                        {REQUESTED_LABEL[project.requested]}
                      </span>
                      {badges.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {badges.map((key) => (
                            <Badge key={key} variant="warning" title={BADGE_TITLE[key]}>
                              {BADGE_LABEL[key]}
                            </Badge>
                          ))}
                        </span>
                      )}
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
                    <Cell label="Rate">
                      {project.priced_as ? PRODUCTION_RATE_LABEL[project.priced_as] : "—"}
                    </Cell>
                    <Cell stack="aside">
                      {project.disposition ? (
                        <StatusBadge map={DISPOSITION_STATUS} value={project.disposition} />
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
