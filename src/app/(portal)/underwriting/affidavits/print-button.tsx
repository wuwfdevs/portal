"use client";

import { Button } from "@/components/ui/button";

/** Milestone 1's affidavit is a browser-print document, not a generated PDF (docs/underwriting-design.md §6) — this is the whole delivery mechanism. */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()} className="print:hidden">
      Print
    </Button>
  );
}
