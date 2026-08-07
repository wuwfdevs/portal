import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listAffidavits } from "@/lib/underwriting/queries";
import type { UwAffidavitStatus } from "@/lib/database.types";

const STATUS_VARIANT: Record<UwAffidavitStatus, BadgeVariant> = {
  draft: "neutral",
  certified: "success",
};

/** Workflow G (docs/underwriting-design.md §3G, §4) — every generated affidavit, newest first. */
export default async function AffidavitsPage() {
  const affidavits = await listAffidavits();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Link href="/underwriting/affidavits/new">
          <Button type="button">Generate an affidavit</Button>
        </Link>
      </div>

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
                    <Link href={`/underwriting/affidavits/${affidavit.id}`} className="text-brand-link">
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
