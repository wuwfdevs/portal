import { TabNav } from "@/components/ui/tab-nav";
import { libraryPath } from "@/lib/transcription/links";

export type SourceworkSection = "projects" | "library" | "setup";

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
        { href: libraryPath(), label: "Library", active: active === "library" },
        ...(isEditor
          ? [{ href: "/sourcework/editors", label: "Setup", active: active === "setup", end: true }]
          : []),
      ]}
    />
  );
}
