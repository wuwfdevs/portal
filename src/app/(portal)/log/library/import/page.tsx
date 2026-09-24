import { ImportClient } from "./import-client";

// DAD library import: bring WUWF's existing cut library into the content
// library. Upload the DAD Library screen's "Generate Reports -> Standard
// Library" export (required) plus the companion Groups report (optional,
// used only for display labels) and preview exactly what would be created
// or updated before confirming — nothing is written until then. Access is
// the layout's requireLogAccess(); both Server Actions re-assert it.
export default function DadLibraryImportPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-bold text-ink-900">Import the DAD library</h1>
      <p className="mt-1 mb-5 text-sm text-ink-500">
        Upload DAD&apos;s Standard Library export (Library screen &rarr; Generate Reports &rarr; Standard
        Library) and, optionally, its Groups report. Most groups become ordinary content items; program
        promos scattered across GENERIC/DAILY/WEEKLY are collapsed into one evergreen promo per matched
        program instead. Re-uploading later reuses items already imported (matched by DAD cart number)
        rather than duplicating them.
      </p>
      <ImportClient />
    </div>
  );
}
