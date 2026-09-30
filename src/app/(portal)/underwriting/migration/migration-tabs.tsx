import { TabNav } from "@/components/ui/tab-nav";
import { MIGRATION_PATH } from "./paths";

/** The migration area's two kinds of legacy record: signed agreements, and the copy that runs on them. */
export function MigrationTabs({ active }: { active: "agreements" | "copy" }) {
  return (
    <TabNav
      tabs={[
        { href: MIGRATION_PATH, label: "Agreements", active: active === "agreements" },
        { href: `${MIGRATION_PATH}/copy`, label: "Copy", active: active === "copy" },
      ]}
    />
  );
}
