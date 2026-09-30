import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listAffidavits, listAffidavitsDue } from "@/lib/underwriting/queries";
import { formatCalendarDate, newAffidavitHref } from "@/lib/underwriting/affidavits";
import type { UwAffidavitStatus } from "@/lib/database.types";

const STATUS_VARIANT: Record<UwAffidavitStatus, BadgeVariant> = {
  draft: "neutral",
  certified: "success",
};

/**
 * Workflow G (docs/underwriting-design.md §3G, §4) — contracts due their
 * next monthly affidavit (lib/underwriting/affidavits.ts's
 * nextAffidavitPeriod, only where something aired), then every generated
 * affidavit, newest first.
 */
export default async function AffidavitsPage() {
  const [affidavits, due] = await Promise.all([listAffidavits(), listAffidavitsDue()]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Link href="/underwriting/affidavits/new">
          <Button type="button">Generate an affidavit</Button>
        </Link>
      </div>

      {due.length > 0 && (
        <section className="rounded border border-line">
          <div className="border-b border-line px-5 py-3.5">
            <div className="text-sm font-bold text-ink-900">Due</div>
            <p className="text-xs text-ink-500">
              Aired credits not yet covered by an affidavit, through the end of last month or the
              contract&apos;s end. Contracts whose agreement requires affidavits come first.
            </p>
          </div>
          <TableFrame className="rounded-none border-0">
            <Table>
              <thead>
                <HeaderRow>
                  <Th>Underwriter</Th>
                  <Th>Order</Th>
                  <Th>Period</Th>
                  <Th className="text-right">Aired</Th>
                  <Th>
                    <span className="sr-only">Generate</span>
                  </Th>
                </HeaderRow>
              </thead>
              <tbody>
                {due.map((item) => (
                  <Row key={item.contract.id}>
                    <Cell className="font-semibold text-ink-900">
                      {item.contract.underwriter.name}
                      {item.contract.affidavit_required && (
                        <Badge variant="warning" className="ml-2">
                          required
                        </Badge>
                      )}
                    </Cell>
                    <Cell className="text-ink-500">
                      <Link
                        href={`/underwriting/contracts/${item.contract.id}`}
                        className="text-brand-link"
                      >
                        {orderNumberLabel(item.contract.contract_identifier)}
                      </Link>
                    </Cell>
                    <Cell className="whitespace-nowrap text-ink-500">
                      {formatCalendarDate(item.periodStart)} – {formatCalendarDate(item.periodEnd)}
                    </Cell>
                    <Cell className="text-right text-ink-700">{item.airedCount}</Cell>
                    <Cell className="text-right">
                      <Link
                        href={newAffidavitHref({
                          contractId: item.contract.id,
                          start: item.periodStart,
                          end: item.periodEnd,
                        })}
                        className="text-sm font-bold text-brand-link"
                      >
                        Generate
                      </Link>
                    </Cell>
                  </Row>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        </section>
      )}

      {affidavits.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No affidavits yet.
        </div>
      ) : (
        <TableFrame>
          <Table>
            <thead>
              <HeaderRow>
                <Th>Report #</Th>
                <Th>Underwriter</Th>
                <Th>Period</Th>
                <Th>Generated</Th>
                <Th>Status</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {affidavits.map((affidavit) => (
                <Row key={affidavit.id}>
                  <Cell className="font-semibold text-ink-900">
                    <Link
                      href={`/underwriting/affidavits/${affidavit.id}`}
                      className="text-brand-link"
                    >
                      {affidavit.report_identifier}
                    </Link>
                  </Cell>
                  <Cell className="text-ink-500">{affidavit.contract.underwriter.name}</Cell>
                  <Cell className="whitespace-nowrap text-ink-500">
                    {affidavit.campaign_period_start} – {affidavit.campaign_period_end}
                  </Cell>
                  <Cell className="whitespace-nowrap text-ink-500">
                    {new Date(affidavit.generated_at).toLocaleDateString("en-US")}
                  </Cell>
                  <Cell>
                    <Badge variant={STATUS_VARIANT[affidavit.status]}>{affidavit.status}</Badge>
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
