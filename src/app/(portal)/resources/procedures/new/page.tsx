import Link from "next/link";
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
      <Link
        href="/resources/procedures"
        className="mb-5 inline-block text-xs font-semibold text-brand-link"
      >
        ← Back to procedures
      </Link>
      <h1 className="mb-6 font-serif text-2xl font-bold text-ink-900">New procedure</h1>
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
