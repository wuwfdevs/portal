import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireResourcesEditor } from "@/lib/resources/access";
import { resolveFigures } from "@/lib/resources/media";
import { getProcedure, listProcedureAreaCounts } from "@/lib/resources/queries";
import { ArticleForm } from "../../../article-form";
import { DeleteZone } from "../../../delete-zone";

export default async function EditProcedurePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; field?: string; confirm?: string }>;
}) {
  await requireResourcesEditor();
  const [{ slug }, { error, field, confirm }] = await Promise.all([params, searchParams]);
  const procedure = await getProcedure(slug);
  if (!procedure) notFound();

  const [figures, areaCounts] = await Promise.all([
    resolveFigures([procedure.body]),
    listProcedureAreaCounts(),
  ]);
  const detailPath = `/resources/procedures/${procedure.slug}`;
  const editPath = `${detailPath}/edit`;

  return (
    <>
      <PageHeader
        size="page"
        className="mb-6"
        back={{ href: detailPath, label: "Back to the procedure" }}
        title="Edit procedure"
      />
      <ArticleForm
        kind="procedure"
        defaults={procedure}
        previewUrls={Object.fromEntries([...figures].map(([id, image]) => [id, image.url]))}
        existingAreas={areaCounts.map((entry) => entry.area)}
        error={error}
        field={field}
        cancelHref={detailPath}
      />
      <div id="danger">
        <DeleteZone
          articleId={procedure.id}
          kindLabel="procedure"
          editPath={editPath}
          confirming={confirm === "delete"}
        />
      </div>
    </>
  );
}
