import { SubNav } from "@/components/ui/sub-nav";

/** Prompts | Piece formats: the two pages editors maintain (docs/sourcework-analysis-design.md §8). */
export function EditorsSubNav({
  active,
  className,
}: {
  active: "prompts" | "formats";
  className?: string;
}) {
  return (
    <SubNav
      label="What editors maintain"
      className={className}
      items={[
        { href: "/sourcework/editors", label: "Prompts", active: active === "prompts" },
        {
          href: "/sourcework/editors/formats",
          label: "Piece formats",
          active: active === "formats",
        },
      ]}
    />
  );
}
