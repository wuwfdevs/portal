import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { requireResourcesEditor } from "@/lib/resources/access";
import { resolveFigures } from "@/lib/resources/media";
import { getGuide } from "@/lib/resources/queries";
import { ArticleForm } from "../../../../article-form";
import { DeleteZone } from "../../../../delete-zone";

export default async function EditGuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ toolKey: string; slug: string }>;
  searchParams: Promise<{ error?: string; field?: string; confirm?: string }>;
}) {
  await requireResourcesEditor();
  const [{ toolKey, slug }, { error, field, confirm }] = await Promise.all([params, searchParams]);
  const detail = await getGuide(toolKey, slug);
  if (!detail) notFound();

  const { guide, tool } = detail;
  const figures = await resolveFigures([guide.body]);
  const detailPath = `/resources/tools/${tool.key}/${guide.slug}`;
  const editPath = `${detailPath}/edit`;

  return (
    <>
      <Link href={detailPath} className="mb-5 inline-block text-xs font-semibold text-brand-link">
        ← Back to the guide
      </Link>
      <h1 className="mb-6 font-serif text-2xl font-bold text-ink-900">Edit {tool.name} guide</h1>
      {guide.needs_review && (
        <Alert variant="note" className="mb-5 max-w-3xl">
          A release changed this screen after the last edit here. Check the text against the release
          note, then save — saving clears this.
        </Alert>
      )}
      <ArticleForm
        kind="guide"
        tool={tool}
        defaults={guide}
        previewUrls={Object.fromEntries([...figures].map(([id, image]) => [id, image.url]))}
        error={error}
        field={field}
        cancelHref={detailPath}
      />
      <div id="danger">
        <DeleteZone
          articleId={guide.id}
          kindLabel="guide"
          editPath={editPath}
          confirming={confirm === "delete"}
        />
      </div>
    </>
  );
}
