"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { encodeQr, qrPath } from "@/lib/audience-listening/qr";
import { issueTableLinks, type IssueLinksState } from "../../event-actions";

const INITIAL: IssueLinksState = { ok: false };

function Qr({ url, label }: { url: string; label: string }) {
  const { path, viewBox } = qrPath(encodeQr(url));
  return (
    <svg role="img" aria-label={label} viewBox={viewBox} className="size-40 text-ink-900" shapeRendering="crispEdges">
      <rect width="100%" height="100%" className="fill-white" />
      <path d={path} fill="currentColor" />
    </svg>
  );
}

/**
 * Makes new links for an event's tables and draws a card for each: the table's number, a QR code and the words. A link is shown
 * only here, once; the database keeps a hash. Making links again replaces the old ones, so a card printed earlier stops working,
 * which is the point when a phone is lost, and a reason to print all the cards for a night together.
 */
export function TableCards({
  eventId,
  eventTitle,
  tables,
  canIssue,
}: {
  eventId: string;
  eventTitle: string;
  tables: { id: string; number: number; hasLink: boolean; used: boolean }[];
  canIssue: boolean;
}) {
  const [state, formAction, pending] = useActionState(issueTableLinks, INITIAL);
  const links = state.ok ? (state.links ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      {tables.length > 0 && (
        <form action={formAction} className="flex flex-col gap-3 print:hidden">
          <input type="hidden" name="event_id" value={eventId} />
          {canIssue && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Making links…" : "Make new links and cards for every table"}
              </Button>
              {links.length > 0 && (
                <Button type="button" variant="secondary" onClick={() => window.print()}>
                  Print the cards
                </Button>
              )}
            </div>
          )}
          {links.length === 0 && (
            <ul className="flex flex-col gap-2 text-sm text-ink-500">
              {tables.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3">
                  <span>
                    Table {t.number}: {t.hasLink ? (t.used ? "link used" : "link issued, not yet used") : "no link yet"}
                  </span>
                  {canIssue && (
                    <Button type="submit" name="table_id" value={t.id} variant="secondary" disabled={pending}>
                      New link for table {t.number}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
      {state.error && <Alert className="print:hidden">{state.error}</Alert>}
      {links.length > 0 && (
        <Alert variant="note" className="print:hidden">
          These links are shown once. Print the cards now: the Portal keeps only a scrambled copy, so a card cannot be reprinted later. Any card
          printed before is now replaced. The cards print at 7 by 5 inches, one to a page.
        </Alert>
      )}
      <div className="table-cards flex flex-wrap gap-4">
        {links.map((link) => (
          <Card key={link.tableId} className="table-card flex h-[5in] w-[7in] max-w-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-section font-semibold text-ink-500">{eventTitle}</p>
            <p className="font-serif text-display font-semibold text-ink-900">Table {link.number}</p>
            <Qr url={link.url} label={`QR code that opens table ${link.number}`} />
            <p className="text-body font-semibold text-ink-900">Scan to join this table</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
