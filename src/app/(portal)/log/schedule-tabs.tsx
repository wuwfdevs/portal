import { TabNav } from "@/components/ui/tab-nav";

/**
 * The Schedule section's second-level row (the shape of Setup's
 * MigrationTabs in Traffic): three weekly overlays on one axis, each with
 * its own page. Programs is what airs when; Automation is when nobody is
 * in the studio; Underwriting is the hours closed to underwriting
 * auto-fill. All three are the program director's, and all three draw the
 * same week.
 */
export function ScheduleTabs({ active }: { active: "programs" | "automation" | "underwriting" }) {
  return (
    <TabNav
      className="mb-4"
      tabs={[
        { href: "/log/programs", label: "Programs", active: active === "programs" },
        { href: "/log/automated-hours", label: "Automation", active: active === "automation" },
        {
          href: "/log/underwriting-hours",
          label: "Underwriting",
          active: active === "underwriting",
        },
      ]}
    />
  );
}
