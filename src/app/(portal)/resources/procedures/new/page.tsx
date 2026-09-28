import Link from "next/link";
import { requireResourcesEditor } from "@/lib/resources/access";
import { ArticleForm } from "../../article-form";

export default async function NewProcedurePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; field?: string }>;
}) {
  await requireResourcesEditor();
  const { error, field } = await searchParams;

  return (
    <>
      <Link href="/resources" className="mb-5 inline-block text-xs font-semibold text-brand-link">
        ← Back to resources
      </Link>
      <h1 className="mb-6 font-serif text-2xl font-bold text-ink-900">New procedure</h1>
      <ArticleForm kind="procedure" error={error} field={field} cancelHref="/resources" />
    </>
  );
}
