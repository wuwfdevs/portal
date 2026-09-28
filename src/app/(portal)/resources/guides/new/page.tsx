import Link from "next/link";
import { ToolIcon } from "@/components/tool-icon";
import { requireResourcesEditor } from "@/lib/resources/access";
import { listGuideableTools } from "@/lib/resources/queries";
import { ArticleForm } from "../../article-form";

/**
 * A guide is written for one tool, and the screens it can document depend
 * on which, so the tool is chosen first (`?tool=`), then the form.
 */
export default async function NewGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string; error?: string; field?: string }>;
}) {
  await requireResourcesEditor();
  const { tool: toolKey, error, field } = await searchParams;
  const tools = await listGuideableTools();
  const tool = tools.find((entry) => entry.key === toolKey);

  return (
    <>
      <Link href="/resources" className="mb-5 inline-block text-xs font-semibold text-brand-link">
        ← Back to resources
      </Link>
      <h1 className="font-serif text-2xl font-bold text-ink-900">
        {tool ? `New ${tool.name} guide` : "New tool guide"}
      </h1>
      {tool ? (
        <>
          <p className="mb-6 mt-1 text-xs text-ink-400">
            <Link href="/resources/guides/new" className="font-semibold text-brand-link">
              Choose a different tool
            </Link>
          </p>
          <ArticleForm
            kind="guide"
            tool={tool}
            error={error}
            field={field}
            cancelHref="/resources"
          />
        </>
      ) : (
        <>
          <p className="mb-5 mt-1 text-xs text-ink-400">Which tool is it for?</p>
          <div className="grid max-w-3xl gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {tools.map((entry) => (
              <Link
                key={entry.id}
                href={`/resources/guides/new?tool=${encodeURIComponent(entry.key)}`}
                className="flex items-center gap-3 rounded border border-line bg-white p-4 hover:border-brand-primary"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded bg-brand-surface text-brand-link">
                  <ToolIcon toolKey={entry.key} />
                </span>
                <span className="text-sm font-semibold text-ink-900">{entry.name}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
