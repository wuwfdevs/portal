import { ImportClient } from "./import-client";

// Program-log import (see docs/log-design.md's "Importing the daily program
// log"): upload the station's traffic-system daily log as a PDF, preview
// exactly what would be created — rundowns with their breaks and items,
// underwriting copy reused versus new, anything unresolvable — and
// confirm. Access is the layout's requireLogAccess(); both Server Actions
// re-assert it.
export default function ImportPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-bold text-ink-900">Import a program log</h1>
      <p className="mt-1 mb-5 text-sm text-ink-500">
        Upload a daily WUWF-FM program log exported from the traffic system as a PDF. The AI reading
        step turns it into a plan — every break and item, each credit&apos;s underwriter and script
        copied from the document — which you review below. Nothing is written until you confirm;
        underwriting credits already in the library are reused, and only genuinely new underwriters
        and copy are created.
      </p>
      <ImportClient />
    </div>
  );
}
