import { ImportClient } from "./import-client";

// Program-log import (see docs/log-design.md's "Importing the daily program
// log"): upload the station's existing DAD/traffic-system Word export,
// preview exactly what would be created — rundowns with their breaks and
// items, underwriting copy reused versus new, anything unresolvable — and
// confirm. Access is the layout's requireLogAccess(); both Server Actions
// re-assert it.
export default function ImportPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-bold text-ink-900">Import a program log</h1>
      <p className="mt-1 mb-5 text-sm text-ink-500">
        Upload a daily WUWF-FM program log exported from the traffic system, as a Word (.docx) or
        PDF (.pdf) file. Nothing is written until you review the plan and confirm — underwriting
        credits already in the library are reused, and only genuinely new underwriters and copy
        are created. An AI reading step identifies each credit and its underwriter (even when two
        or more run together with no separating marker in the export) and reproduces every
        script verbatim from the source document.
      </p>
      <ImportClient />
    </div>
  );
}
