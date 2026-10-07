import { notFound } from "next/navigation";
import { requireAgreementMigrationAccess } from "@/lib/underwriting/access";
import { loadLegacyCopySnapshot } from "@/lib/underwriting/legacy-copy-import";
import { MigrationTabs } from "../migration-tabs";
import { CopyImportClient } from "./copy-import-client";
import { TextLink } from "@/components/ui/primary-link";

/**
 * Seeding active copy from RadioTraffic (docs/underwriting-traffic-
 * redesign.md §15): choose the export, answer what it can't decide, import.
 * An administrator's tool, beside the agreement migration.
 */
export default async function LegacyCopyMigrationPage() {
  const context = await requireAgreementMigrationAccess();
  if (!context) notFound();
  const snapshot = await loadLegacyCopySnapshot();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <TextLink href="/underwriting/setup" className="text-xs">
          ← Setup
        </TextLink>
        <h2 className="mt-2 text-xl font-bold text-ink-900">Migrate legacy records</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-700">
          Bring active copy in from RadioTraffic: each message is matched to its underwriter and,
          where exactly one agreement fits, linked to that contract’s rotation.
        </p>
      </div>
      <MigrationTabs active="copy" />
      <CopyImportClient snapshot={snapshot} />
    </div>
  );
}
