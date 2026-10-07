import { SegmentedLinks } from "@/components/ui/segmented";

export type ScheduleView = "line" | "date";

/** The Schedule tab's "By line | By date" switch; the view lives in the URL (`?view=date`). */
export function ViewToggle({ base, view }: { base: string; view: ScheduleView }) {
  return (
    <SegmentedLinks
      label="Schedule view"
      options={[
        { label: "By line", href: base, active: view === "line" },
        { label: "By date", href: `${base}?view=date`, active: view === "date" },
      ]}
    />
  );
}
