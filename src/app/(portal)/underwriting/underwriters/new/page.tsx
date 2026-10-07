import { listIndustryCategories } from "@/lib/underwriting/queries";
import { createUnderwriter } from "../../contract-actions";
import { UnderwriterForm } from "../underwriter-form";
import { PageHeader } from "@/components/ui/page-header";

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
      <PageHeader
        back={{ href: "/underwriting/underwriters", label: "Back to underwriters" }}
        title="New underwriter"
        className="mb-5"
      />
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
