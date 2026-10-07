import { Card } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DetailSummary } from "@/components/ui/detail-summary";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { AGREEMENT_STATUS_BADGE, AGREEMENT_STATUS_SHORT_LABEL } from "@/lib/bookings/agreements";
import { PRODUCTION_RATE_LABEL } from "@/lib/bookings/labels";
import {
  PARTNERS_PATH,
  agreementHref,
  agreementNewHref,
  partnerEditHref,
  requestHref,
} from "@/lib/bookings/paths";
import {
  DISPOSITION_BADGE,
  DISPOSITION_LABEL,
  PARTNER_KIND_LABEL,
  REQUESTED_LABEL,
  STAGE_LABEL,
} from "@/lib/bookings/projects";
import {
  getPartner,
  listAgreementsForPartner,
  listProjectsForPartner,
} from "@/lib/bookings/queries";
import { formatHours } from "@/lib/bookings/scheduling";
import { formatDateShort } from "@/lib/log/program-status";

const SAVED_LABEL: Record<string, string> = {
  created: "Created",
  "1": "Saved",
  deleted: "Draft agreement deleted",
};

/**
 * A partner's page (docs/bookings-design.md §4): its agreements with their
 * status and terms, every request it has made, and the contact details in
 * the aside.
 */
export default async function PartnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [{ id }, query, context] = await Promise.all([
    params,
    searchParams,
    requireBookingsAccess(),
  ]);
  const partner = await getPartner(id);
  if (!partner) notFound();
  const [agreements, projects] = await Promise.all([
    listAgreementsForPartner(id),
    listProjectsForPartner(id),
  ]);
  const canEdit = context.isProduction || context.isDirector || context.isExecutive;
  const open = projects.filter((p) => p.disposition === null && p.stage !== "settled");

  return (
    <div className="flex flex-col gap-5">
      <Link href={PARTNERS_PATH} className="inline-block text-xs font-semibold text-brand-link">
        ← Partners
      </Link>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-xl font-bold text-ink-900">{partner.name}</h2>
          <Badge variant={partner.kind === "external" ? "warning" : "accent"}>
            {PARTNER_KIND_LABEL[partner.kind]}
          </Badge>
          {query.saved && SAVED_LABEL[query.saved] && (
            <Badge variant="success">{SAVED_LABEL[query.saved]}</Badge>
          )}
        </div>
        <p className="text-xs text-ink-500">
          {open.length} open request{open.length === 1 ? "" : "s"} ·{" "}
          {agreements.filter((a) => a.status === "active").length} active agreement
          {agreements.filter((a) => a.status === "active").length === 1 ? "" : "s"}
        </p>
      </header>
      {query.error && <Alert>{query.error}</Alert>}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-sm font-bold text-ink-900">Agreements</h3>
              <span className="text-xs text-ink-500">
                A standing arrangement: a reserve share, funded student hours, reserved blocks, an
                airtime allowance. The Executive Director approves one after seeing its draw.
              </span>
              <span className="flex-1" />
              {canEdit && <PrimaryLink href={agreementNewHref(id)}>+ Agreement</PrimaryLink>}
            </div>
            {agreements.length === 0 ? (
              <p className="rounded border border-dashed border-line px-4 py-3 text-sm text-ink-500">
                No agreement. Requests from this partner are priced from the facts on each one.
              </p>
            ) : (
              <TableFrame>
                <Table stack>
                  <thead>
                    <HeaderRow>
                      <Th>Agreement</Th>
                      <Th>Dates</Th>
                      <Th>Reserve share</Th>
                      <Th>Airtime</Th>
                      <Th>Status</Th>
                    </HeaderRow>
                  </thead>
                  <tbody>
                    {agreements.map((agreement) => (
                      <Row key={agreement.id}>
                        <Cell stack="title">
                          <Link
                            href={agreementHref(id, agreement.id)}
                            className="font-semibold text-brand-link hover:underline"
                          >
                            {agreement.label}
                          </Link>
                        </Cell>
                        <Cell label="Dates">
                          {formatDateShort(agreement.starts_on)} –{" "}
                          {formatDateShort(agreement.ends_on)}
                        </Cell>
                        <Cell label="Reserve share">
                          {formatHours(Number(agreement.reserve_hours_allocated))}
                        </Cell>
                        <Cell label="Airtime">
                          {agreement.airtime_minutes_per_week > 0
                            ? `${agreement.airtime_minutes_per_week} min a week`
                            : "—"}
                        </Cell>
                        <Cell stack="aside">
                          <Badge variant={AGREEMENT_STATUS_BADGE[agreement.status]}>
                            {AGREEMENT_STATUS_SHORT_LABEL[agreement.status]}
                          </Badge>
                        </Cell>
                      </Row>
                    ))}
                  </tbody>
                </Table>
              </TableFrame>
            )}
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-sm font-bold text-ink-900">Requests</h3>
              <span className="text-xs text-ink-500">Every request from this partner.</span>
            </div>
            {projects.length === 0 ? (
              <p className="rounded border border-dashed border-line px-4 py-3 text-sm text-ink-500">
                No requests yet.
              </p>
            ) : (
              <TableFrame>
                <Table stack>
                  <thead>
                    <HeaderRow>
                      <Th>Request</Th>
                      <Th>Event</Th>
                      <Th>Rate</Th>
                      <Th>Stage</Th>
                    </HeaderRow>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
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
                        <Cell label="Event">
                          {project.event_starts_on ? formatDateShort(project.event_starts_on) : "—"}
                        </Cell>
                        <Cell label="Rate">
                          {project.priced_as ? PRODUCTION_RATE_LABEL[project.priced_as] : "—"}
                        </Cell>
                        <Cell stack="aside">
                          {project.disposition ? (
                            <Badge variant={DISPOSITION_BADGE[project.disposition]}>
                              {DISPOSITION_LABEL[project.disposition]}
                            </Badge>
                          ) : (
                            <Badge variant="accent">{STAGE_LABEL[project.stage]}</Badge>
                          )}
                        </Cell>
                      </Row>
                    ))}
                  </tbody>
                </Table>
              </TableFrame>
            )}
          </Card>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-80">
          <DetailSummary
            title="Details"
            editHref={canEdit ? partnerEditHref(id) : undefined}
            items={[
              { label: "Kind", value: PARTNER_KIND_LABEL[partner.kind] },
              {
                label: "Contact",
                value: [partner.contact_name, partner.contact_email, partner.contact_phone]
                  .filter(Boolean)
                  .join("\n"),
                preserveLines: true,
              },
              { label: "Index", value: partner.default_funding_index },
              { label: "Notes", value: partner.notes, preserveLines: true },
              { label: "On file since", value: formatDateShort(partner.created_at.slice(0, 10)) },
            ]}
          />
        </aside>
      </div>
    </div>
  );
}
