import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DetailSummary } from "@/components/ui/detail-summary";
import { RichText } from "@/components/ui/rich-text";
import { cn } from "@/lib/cn";
import { requireResourcesAccess } from "@/lib/resources/access";
import { formatReleaseDate, formatUpdatedDate } from "@/lib/resources/articles";
import { getGuide } from "@/lib/resources/queries";
import { primaryScreenName } from "@/lib/resources/screens";
import { HistoryCard } from "../../../history-card";

export default async function GuidePage({
  params,
}: {
  params: Promise<{ toolKey: string; slug: string }>;
}) {
  const [{ toolKey, slug }, { isEditor }] = await Promise.all([params, requireResourcesAccess()]);
  const detail = await getGuide(toolKey, slug);
  if (!detail) notFound();

  const { guide, tool, siblings, versions, releaseNote } = detail;
  const latest = versions[0] ?? null;
  const screen = primaryScreenName(guide.screen_keys);
  const updated = formatUpdatedDate(guide.updated_at);

  return (
    <>
      <Link href="/resources" className="mb-5 inline-block text-xs font-semibold text-brand-link">
        ← Back to resources
      </Link>
      <div className="flex flex-wrap items-start gap-8">
        <article className="min-w-0 max-w-[720px] flex-[1_1_520px]">
          <h1 className="font-serif text-2xl font-bold leading-snug text-ink-900">{guide.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-ink-400">
            <Badge variant="accent">Guide</Badge>
            <span>{tool.name}</span>
            {screen && (
              <>
                <span>·</span>
                <span>{screen}</span>
              </>
            )}
            <span>·</span>
            <span>Updated {updated}</span>
          </div>

          {latest?.source === "release" && (
            <Alert variant="info" className="mt-4">
              <strong className="font-bold">
                Updated with the{" "}
                {releaseNote?.released_on
                  ? `${formatReleaseDate(releaseNote.released_on, true)} release`
                  : "latest release"}
                .
              </strong>
              {latest.note && <> {latest.note}.</>}
              {releaseNote && (
                <>
                  {" "}
                  <Link
                    href={`/resources/whats-new#${releaseNote.slug}`}
                    className="font-semibold text-brand-link"
                  >
                    See what changed
                  </Link>
                </>
              )}
            </Alert>
          )}
          {isEditor && guide.needs_review && (
            <Alert variant="note" className="mt-3">
              A release changed this screen after your last edit. Review this guide.
            </Alert>
          )}

          <RichText
            body={guide.body}
            className="mt-5 text-sm text-ink-700"
            fallback={<p className="mt-5 text-sm text-ink-500">This guide has no text yet.</p>}
          />
        </article>

        <aside className="flex min-w-[260px] flex-[0_1_320px] flex-col gap-4">
          <nav
            aria-label={`${tool.name} guides`}
            className="rounded border border-line bg-white pb-2"
          >
            <p className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
              {tool.name} guides
            </p>
            <ul className="pt-2">
              {siblings.map((sibling) => {
                const current = sibling.slug === guide.slug;
                return (
                  <li key={sibling.slug}>
                    <Link
                      href={`/resources/tools/${tool.key}/${sibling.slug}`}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "block px-5 py-1.5 text-[13px]",
                        current
                          ? "border-l-2 border-brand-primary bg-panel-50 pl-[18px] font-semibold text-brand-link"
                          : "text-ink-700 hover:text-brand-link",
                      )}
                    >
                      {sibling.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <DetailSummary
            title="Details"
            items={[
              { label: "Tool", value: tool.name },
              { label: "Screen", value: screen },
              { label: "Visible to", value: `${tool.name} members` },
              {
                label: "Written by",
                value: guide.edited_since_release ? "An editor" : "The release that shipped it",
              },
            ]}
          />
          <HistoryCard versions={versions} />
        </aside>
      </div>
    </>
  );
}
