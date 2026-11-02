import { PageHeader } from "@/components/ui/page-header";
import { requireResourcesEditor } from "@/lib/resources/access";
import { listProcedureAreaCounts } from "@/lib/resources/queries";
import { ArticleForm } from "../../article-form";

export default async function NewProcedurePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; field?: string }>;
}) {
  const [{ error, field }] = await Promise.all([searchParams, requireResourcesEditor()]);
  const areaCounts = await listProcedureAreaCounts();

  return (
    <>
      <PageHeader
        size="page"
        className="mb-6"
        back={{ href: "/resources/procedures", label: "Back to procedures" }}
        title="New procedure"
      />
      <ArticleForm
        kind="procedure"
        existingAreas={areaCounts.map((entry) => entry.area)}
        error={error}
        field={field}
        cancelHref="/resources/procedures"
      />
    </>
  );
}
