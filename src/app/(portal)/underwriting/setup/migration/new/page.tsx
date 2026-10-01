import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Steps } from "@/components/ui/steps";
import { requireAgreementMigrationAccess } from "@/lib/underwriting/access";
import { listUnderwriters } from "@/lib/underwriting/queries";
import { MIGRATION_PATH } from "../paths";
import { ManifestForm } from "./manifest-form";
import { MIGRATION_STEPS } from "../steps";

/**
 * A new migration batch, step 1 (docs/underwriting-traffic-redesign.md
 * §14.5): name it, say where its facts come from, and — for a manifest —
 * check the rows before anything is written.
 */
export default async function NewMigrationBatchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; b?: string }>;
}) {
  const context = await requireAgreementMigrationAccess();
  if (!context) notFound();
  const { error, b } = await searchParams;
  const underwriters = await listUnderwriters();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={MIGRATION_PATH} className="text-sm font-bold text-brand-link">
          ← Migrations
        </Link>
        <h2 className="mt-2 text-xl font-bold text-ink-900">New batch</h2>
      </div>
      <Steps steps={MIGRATION_STEPS} current={0} label="Migration steps" />
      {error && <Alert>{error}</Alert>}
      <ManifestForm
        defaultBatchLabel={b?.trim() ?? ""}
        underwriterNames={underwriters.map((entry) => entry.name)}
      />
    </div>
  );
}
