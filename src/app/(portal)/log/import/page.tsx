import Link from "next/link";
import { formatStationDateLong } from "@/lib/log/timezone";
import { ImportClient } from "./import-client";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Program-log import (see docs/log-design.md's "Importing the daily program
// log"): upload the station's traffic-system daily log as a PDF, preview
// exactly what would be created — rundowns with their breaks and items,
// underwriting copy reused versus new, anything unresolvable — and
// confirm. It is started from the Today screen and returns there: `?date=`
// carries the day the host started from, so the preview can say when the
// log turns out to be for a different one. Access is the layout's
// requireLogAccess(); both Server Actions re-assert it.
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const fromDate = date && DATE_ONLY.test(date) ? date : null;
  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <Link
          href={fromDate ? `/log?date=${fromDate}` : "/log"}
          className="font-semibold text-brand-link"
        >
          ← Today
        </Link>
        {fromDate && (
          <>
            <span aria-hidden="true">·</span>
            <span>{formatStationDateLong(fromDate)}</span>
          </>
        )}
      </div>
      <h1 className="text-lg font-bold text-ink-900">Import a program log</h1>
      <p className="mt-1 mb-5 text-sm text-ink-500">
        Upload a daily WUWF-FM program log exported from the traffic system as a PDF. The AI reading
        step turns it into a plan — every break and item, each credit&apos;s underwriter and script
        copied from the document — which you review below. Nothing is written until you confirm;
        underwriting credits already in the library are reused, and only genuinely new underwriters
        and copy are created.
      </p>
      <ImportClient fromDate={fromDate} />
    </div>
  );
}
