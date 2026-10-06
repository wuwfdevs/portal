"use client";

import { Button } from "@/components/ui/button";

/** Prints the page; the card's print stylesheet hides the portal chrome. */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      Print rate card
    </Button>
  );
}
