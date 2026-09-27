import Link from "next/link";
import { FieldHint } from "@/components/ui/input";
import { createCopy } from "../../copy-actions";
import { CopyForm } from "../copy-form";

/** Standalone copy creation (docs/ui-patterns.md rule 2). Copy is more often created from a contract's own setup, which links it in the same step. */
export default async function NewCopyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div>
      <Link href="/underwriting/copy" className="text-xs font-semibold text-brand-link">
        ← Back to copy library
      </Link>
      <h2 className="mt-2 font-serif text-xl font-bold text-ink-900">New copy</h2>
      <div className="mb-5">
        <FieldHint>
          Not linked to a contract from here — copy is usually created from the contract&apos;s own
          setup instead, which links it in the same step.
        </FieldHint>
      </div>
      <CopyForm
        action={createCopy}
        submitLabel="Create copy"
        cancelHref="/underwriting/copy"
        error={error}
      />
    </div>
  );
}
