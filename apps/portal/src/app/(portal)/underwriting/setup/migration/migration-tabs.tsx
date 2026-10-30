import { SubNav } from "@/components/ui/sub-nav";
import { MIGRATION_PATH } from "./paths";

/** The migration area's two kinds of legacy record: signed agreements, and the copy that runs on them. */
export function MigrationTabs({ active }: { active: "agreements" | "copy" }) {
  return (
    <SubNav
      label="Migration sections"
      items={[
        { href: MIGRATION_PATH, label: "Agreements", active: active === "agreements" },
        { href: `${MIGRATION_PATH}/copy`, label: "Copy", active: active === "copy" },
      ]}
    />
  );
}
