"use client";

import { Button } from "@/components/ui/button";
import { PrintIcon } from "@/components/ui/icons";

/** Prints the page; the card's print stylesheet hides the portal chrome. */
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      phoneIcon={<PrintIcon className="size-4" />}
      onClick={() => window.print()}
    >
      Print rate card
    </Button>
  );
}
