import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { TextLink } from "@/components/ui/primary-link";
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
      <PageHeader
        size="page"
        back={{ href: "/resources", label: "Back to resources" }}
        title={tool ? `New ${tool.name} guide` : "New tool guide"}
        description={
          tool ? (
            <TextLink href="/resources/guides/new" className="px-0 text-xs font-semibold">
              Choose a different tool
            </TextLink>
          ) : (
            "Which tool is it for?"
          )
        }
        className="mb-6"
      />
      {tool ? (
        <>
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
