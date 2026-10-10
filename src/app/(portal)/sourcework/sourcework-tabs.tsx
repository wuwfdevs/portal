import { TabNav } from "@/components/ui/tab-nav";

export type SourceworkSection = "projects" | "sources" | "clips" | "setup";

/**
 * Sourcework's top-level tabs. Setup (the research prompts and piece formats editors maintain)
 * sits at the right edge like every other tool's utility tab, and is shown to editors only;
 * its pages show this row too, with Setup lit and a SubNav for Prompts | Piece formats under it
 * (docs/ui-patterns.md, "Navigation shapes").
 */
export function SourceworkTabs({
  active,
  isEditor,
  className,
}: {
  active: SourceworkSection;
  isEditor: boolean;
  className?: string;
}) {
  return (
    <TabNav
      className={className}
      tabs={[
        { href: "/sourcework", label: "Projects", active: active === "projects" },
        { href: "/sourcework?tab=sources", label: "Sources", active: active === "sources" },
        { href: "/sourcework?tab=clips", label: "Excerpts", active: active === "clips" },
        ...(isEditor
          ? [{ href: "/sourcework/editors", label: "Setup", active: active === "setup", end: true }]
          : []),
      ]}
    />
  );
}
