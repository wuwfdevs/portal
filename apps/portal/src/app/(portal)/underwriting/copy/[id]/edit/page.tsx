import { notFound } from "next/navigation";
import { getCopyDetail } from "@/lib/underwriting/queries";
import { updateCopyDetails } from "../../../copy-actions";
import { CopyForm } from "../../copy-form";
import { PageHeader } from "@/components/ui/page-header";

/** Edit uses the same form as create (docs/ui-patterns.md rule 3); approval status is set from the detail page's aside, not here. */
export default async function EditCopyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const copy = await getCopyDetail(id);
  if (!copy) notFound();
  const detailPath = `/underwriting/copy/${copy.id}`;

  return (
    <div>
      <PageHeader
        back={{ href: detailPath, label: `Back to ${copy.label}` }}
        title="Edit copy"
        className="mb-5"
      />
      <CopyForm
        action={updateCopyDetails}
        defaults={copy}
        submitLabel="Save changes"
        cancelHref={detailPath}
        error={error}
        hiddenFields={{ copy_id: copy.id }}
      />
    </div>
  );
}
