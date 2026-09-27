import Link from "next/link";
import { notFound } from "next/navigation";
import { getUnderwriter, listIndustryCategories } from "@/lib/underwriting/queries";
import { updateUnderwriter } from "../../../contract-actions";
import { UnderwriterForm } from "../../underwriter-form";

/** Edit uses the same form as create (docs/ui-patterns.md rule 3); the detail page's aside is read-only. */
export default async function EditUnderwriterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [underwriter, categories] = await Promise.all([
    getUnderwriter(id),
    listIndustryCategories(),
  ]);
  if (!underwriter) notFound();
  const detailPath = `/underwriting/underwriters/${underwriter.id}`;

  return (
    <div>
      <Link href={detailPath} className="text-xs font-semibold text-brand-link">
        ← Back to {underwriter.name}
      </Link>
      <h2 className="mt-2 mb-5 font-serif text-xl font-bold text-ink-900">Edit underwriter</h2>
      <UnderwriterForm
        action={updateUnderwriter}
        defaults={underwriter}
        submitLabel="Save changes"
        cancelHref={detailPath}
        categories={categories}
        error={error}
        hiddenFields={{ underwriter_id: underwriter.id }}
      />
    </div>
  );
}
