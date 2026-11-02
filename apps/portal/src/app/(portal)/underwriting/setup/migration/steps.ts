import type { StepItem } from "@/components/ui/steps";

/** The four steps of a migration batch: load, match, run, check. */
export const MIGRATION_STEPS: StepItem[] = [
  { label: "Manifest" },
  { label: "Documents" },
  { label: "Import" },
  { label: "Review" },
];
