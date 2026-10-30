import Link from "next/link";
import { isValidDateISO } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { formatStationDateLong } from "@/lib/log/timezone";
import { ImportClient } from "./import-client";

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
  const fromDate = isValidDateISO(date) ? date : null;
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
      <PageHeader
        title="Import a program log"
        className="mb-5"
        description={
          <>
            Upload a daily WUWF-FM program log exported from the traffic system as a PDF. The AI
            reading step turns it into a plan — every break and item, each credit&apos;s underwriter
            and script copied from the document — which you review below. Nothing is written until
            you confirm; underwriting credits already in the library are reused, and only genuinely
            new underwriters and copy are created.
          </>
        }
      />
      <ImportClient fromDate={fromDate} />
    </div>
  );
}
