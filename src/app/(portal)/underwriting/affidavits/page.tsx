import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { ActionMenu } from "@/components/ui/action-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireUnderwritingAccess } from "@/lib/underwriting/access";
import { getAffidavitMonth } from "@/lib/underwriting/queries";
import { newAffidavitHref } from "@/lib/underwriting/affidavits";
import {
  countAffidavitStates,
  defaultAffidavitMonth,
  isMonthKey,
  shiftMonth,
  signingQueue,
} from "@/lib/underwriting/affidavit-month";
import { monthLabel, shortDate } from "@/lib/underwriting/dates";
import { stationTodayISO } from "@/lib/log/timezone";
import { generateAffidavitsForMonth } from "../affidavit-actions";

/**
 * Workflow G as one list per month (docs/underwriting-traffic-redesign.md
 * §17): a row per contract whose action follows its state — Generate,
 * Sign, Signed. Opens on last month, the one being worked; earlier months
 * are the archive. Generating is any member's work; signing is a
 * manager's, enforced by uw_guard_affidavit_certification().
 */
export default async function AffidavitsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; q?: string; error?: string; signed?: string }>;
}) {
  const { month: monthParam, q, error, signed } = await searchParams;
  const today = stationTodayISO();
  const month = monthParam && isMonthKey(monthParam) ? monthParam : defaultAffidavitMonth(today);
  const [{ isManager }, { rows: allRows, otherMonths, openExceptionsByRow }] = await Promise.all([
    requireUnderwritingAccess(),
    getAffidavitMonth(month),
  ]);
  const query = (q ?? "").trim().toLowerCase();
  const rows =
    query === ""
      ? allRows
      : allRows.filter((row) => row.contract.underwriter.name.toLowerCase().includes(query));
  const counts = countAffidavitStates(allRows);
  const queue = signingQueue(allRows);
  const toGenerate = allRows.filter((row) => row.state === "generate");
  const monthHref = (next: string) => `/underwriting/affidavits?month=${next}`;
  const latestMonth = defaultAffidavitMonth(today);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Month" className="flex items-center gap-1">
          <Link
            href={monthHref(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="rounded px-2 py-1 text-lg font-bold text-brand-link hover:bg-panel-50"
          >
            ‹
          </Link>
          <h2 className="min-w-[11rem] text-center font-serif text-xl font-bold text-ink-900">
            {monthLabel(`${month}-01`)}
          </h2>
          {month < latestMonth ? (
            <Link
              href={monthHref(shiftMonth(month, 1))}
              aria-label="Next month"
              className="rounded px-2 py-1 text-lg font-bold text-brand-link hover:bg-panel-50"
            >
              ›
            </Link>
          ) : (
            <span className="px-2 py-1 text-lg text-ink-300" aria-hidden="true">
              ›
            </span>
          )}
        </nav>
        <span className="text-sm text-ink-500">
          {allRows.length === 0
            ? "Nothing aired for an affidavit this month."
            : `${allRows.length} contract${allRows.length === 1 ? "" : "s"} · ${counts.generate} to generate · ${counts.sign} to sign · ${counts.signed} signed`}
        </span>
        <span className="flex-1" />
        {toGenerate.length > 0 && (
          <form action={generateAffidavitsForMonth}>
            <input type="hidden" name="month" value={month} />
            {toGenerate.map((row) => (
              <input
                key={row.key}
                type="hidden"
                name="row"
                value={`${row.contract.id}|${row.periodStart}|${row.periodEnd}`}
              />
            ))}
            <Button type="submit" variant="secondary">
              Generate {toGenerate.length}
            </Button>
          </form>
        )}
        {isManager && queue.length > 0 && (
          <Link
            href={`/underwriting/affidavits/${queue[0]}?signing=1`}
            className="inline-flex items-center justify-center rounded bg-brand-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2278B8]"
          >
            Sign {queue.length} in order
          </Link>
        )}
      </div>

      {error && <Alert>{error}</Alert>}
      {signed && queue.length === 0 && counts.sign === 0 && (
        <Alert variant="info">Every affidavit for {monthLabel(`${month}-01`)} is signed.</Alert>
      )}
      {otherMonths.length > 0 && (
        <Alert variant="note">
          Also owed:{" "}
          {otherMonths.map((other, index) => (
            <span key={other.month}>
              {index > 0 && ", "}
              <Link href={monthHref(other.month)} className="font-semibold text-brand-link">
                {monthLabel(`${other.month}-01`)} ({other.count})
              </Link>
            </span>
          ))}
        </Alert>
      )}

      {allRows.length > 0 && (
        <ListToolbar
          search={{
            placeholder: "Search underwriter",
            label: "Search affidavits",
            defaultValue: q,
            hidden: { month },
          }}
        />
      )}

      {rows.length > 0 && (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Underwriter</Th>
                <Th>Order</Th>
                <Th>Period</Th>
                <Th className="text-right">Aired</Th>
                <Th>Notes</Th>
                <Th>Status</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.key}>
                  <Cell stack="title" className="font-semibold text-ink-900">
                    {row.contract.underwriter.name}
                    {row.earlier.length > 0 && (
                      <Badge variant="muted" className="ml-2">
                        correction
                      </Badge>
                    )}
                  </Cell>
                  <Cell label="Order" className="text-ink-500">
                    <Link
                      href={`/underwriting/contracts/${row.contract.id}?tab=agreement`}
                      className="text-brand-link"
                    >
                      {orderNumberLabel(row.contract.contract_identifier)}
                    </Link>
                  </Cell>
                  <Cell label="Period" className="whitespace-nowrap text-ink-500">
                    {shortDate(row.periodStart)} – {shortDate(row.periodEnd)}
                  </Cell>
                  <Cell label="Aired" className="text-right text-ink-700">
                    {row.airedCount}
                  </Cell>
                  <Cell label="Notes" className="text-xs text-ink-500">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.contract.affidavit_required && (
                        <Badge variant="warning">order requires</Badge>
                      )}
                      {(openExceptionsByRow.get(row.key) ?? 0) > 0 && (
                        <Link
                          href={`/underwriting/exceptions?q=${encodeURIComponent(row.contract.underwriter.name)}&status=all`}
                        >
                          <Badge variant="warning">
                            {openExceptionsByRow.get(row.key)} open exception
                            {openExceptionsByRow.get(row.key) === 1 ? "" : "s"}
                          </Badge>
                        </Link>
                      )}
                      {row.contract.effective_to &&
                        row.contract.effective_to <= row.periodEnd &&
                        row.contract.effective_to >= `${month}-01` && (
                          <span>Contract ended {shortDate(row.contract.effective_to)}</span>
                        )}
                    </div>
                  </Cell>
                  <Cell stack="aside">
                    {row.state === "generate" ? (
                      <form action={generateAffidavitsForMonth}>
                        <input type="hidden" name="month" value={month} />
                        <input
                          type="hidden"
                          name="row"
                          value={`${row.contract.id}|${row.periodStart}|${row.periodEnd}`}
                        />
                        <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs">
                          Generate
                        </Button>
                      </form>
                    ) : row.state === "sign" && row.affidavit ? (
                      isManager ? (
                        <Link
                          href={`/underwriting/affidavits/${row.affidavit.id}?signing=1`}
                          className="inline-flex items-center rounded bg-brand-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-[#2278B8]"
                        >
                          Sign
                        </Link>
                      ) : (
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge variant="accent">Waiting for signature</Badge>
                          <Link
                            href={`/underwriting/affidavits/${row.affidavit.id}`}
                            className="text-xs font-semibold text-brand-link"
                          >
                            Preview
                          </Link>
                        </span>
                      )
                    ) : row.affidavit ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant="success">
                          Signed
                          {row.affidavit.certifiedAt
                            ? ` ${shortDate(stationTodayISO(row.affidavit.certifiedAt))}`
                            : ""}
                        </Badge>
                        <a
                          href={`/api/underwriting/affidavits/${row.affidavit.id}/pdf`}
                          target="_blank"
                          rel="noopener"
                          className="text-xs font-semibold text-brand-link"
                        >
                          PDF
                        </a>
                        <form id={`correct-${row.key}`} action={generateAffidavitsForMonth}>
                          <input type="hidden" name="month" value={month} />
                          <input
                            type="hidden"
                            name="row"
                            value={`${row.contract.id}|${row.periodStart}|${row.periodEnd}`}
                          />
                        </form>
                        <ActionMenu
                          label={`More for ${row.contract.underwriter.name}`}
                          items={[
                            { label: "Open", href: `/underwriting/affidavits/${row.affidavit.id}` },
                            { label: "Generate a correction", formId: `correct-${row.key}` },
                          ]}
                        />
                      </span>
                    ) : null}
                    {row.earlier.length > 0 && (
                      <div className="mt-1 text-xs text-ink-500">
                        Earlier:{" "}
                        {row.earlier.map((earlier, index) => (
                          <span key={earlier.id}>
                            {index > 0 && ", "}
                            <Link
                              href={`/underwriting/affidavits/${earlier.id}`}
                              className="text-brand-link"
                            >
                              {earlier.status === "certified" ? "signed" : "draft"}{" "}
                              {shortDate(stationTodayISO(earlier.generatedAt))}
                            </Link>
                          </span>
                        ))}
                      </div>
                    )}
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
      {allRows.length > 0 && rows.length === 0 && (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No affidavits match.
        </div>
      )}

      <Link
        href={newAffidavitHref({})}
        className="self-start text-sm font-semibold text-brand-link"
      >
        Generate one by hand
      </Link>
    </div>
  );
}
