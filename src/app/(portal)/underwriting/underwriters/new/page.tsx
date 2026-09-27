import Link from "next/link";
import { listIndustryCategories } from "@/lib/underwriting/queries";
import { createUnderwriter } from "../../contract-actions";
import { UnderwriterForm } from "../underwriter-form";

/** Creating an underwriter has its own page (docs/ui-patterns.md rule 2: about seven fields) rather than a column beside the list. */
export default async function NewUnderwriterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const categories = await listIndustryCategories();

  return (
    <div>
      <Link href="/underwriting/underwriters" className="text-xs font-semibold text-brand-link">
        ← Back to underwriters
      </Link>
      <h2 className="mt-2 mb-5 font-serif text-xl font-bold text-ink-900">New underwriter</h2>
      <UnderwriterForm
        action={createUnderwriter}
        submitLabel="Create underwriter"
        cancelHref="/underwriting/underwriters"
        categories={categories}
        error={error}
      />
    </div>
  );
}
