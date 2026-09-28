import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DetailSummary } from "@/components/ui/detail-summary";
import { RichText } from "@/components/ui/rich-text";
import { formatAudience, formatUpdatedDate, guideLinksInBody } from "@/lib/resources/articles";
import { getProcedure, listVersions } from "@/lib/resources/queries";
import { HistoryCard } from "../../history-card";

export default async function ProcedurePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ history?: string }>;
}) {
  const [{ slug }, { history }] = await Promise.all([params, searchParams]);
  const procedure = await getProcedure(slug);
  if (!procedure) notFound();

  const showHistory = history === "1";
  const versions = showHistory ? await listVersions(procedure.id) : [];
  const guides = guideLinksInBody(procedure.body);
  const updated = formatUpdatedDate(procedure.updated_at);

  return (
    <>
      <Link href="/resources" className="mb-5 inline-block text-xs font-semibold text-brand-link">
        ← Back to resources
      </Link>
      <div className="flex flex-wrap items-start gap-8">
        <article className="min-w-0 max-w-[720px] flex-[1_1_520px]">
          <h1 className="font-serif text-2xl font-bold leading-snug text-ink-900">
            {procedure.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-ink-400">
            <Badge variant="accent">Procedure</Badge>
            <span>{procedure.area}</span>
            {procedure.owner_role && (
              <>
                <span>·</span>
                <span>Owned by {procedure.owner_role}</span>
              </>
            )}
            <span>·</span>
            <span>Updated {updated}</span>
          </div>
          <RichText
            body={procedure.body}
            className="mt-5 text-sm text-ink-700"
            fallback={<p className="mt-5 text-sm text-ink-500">This procedure has no text yet.</p>}
          />
        </article>

        <aside className="flex min-w-[260px] flex-[0_1_320px] flex-col gap-4">
          <DetailSummary
            title="Details"
            items={[
              { label: "Area", value: procedure.area },
              { label: "Owner", value: procedure.owner_role },
              { label: "Visible to", value: formatAudience(procedure.audience) },
              {
                label: "Version",
                value: (
                  <>
                    {procedure.version} ·{" "}
                    <Link
                      href={
                        showHistory
                          ? `/resources/procedures/${procedure.slug}`
                          : `/resources/procedures/${procedure.slug}?history=1#history`
                      }
                      className="font-semibold text-brand-link"
                    >
                      {showHistory ? "Hide history" : "History"}
                    </Link>
                  </>
                ),
              },
              { label: "Updated", value: updated },
            ]}
          />
          {guides.length > 0 && (
            <div className="rounded border border-line bg-white p-5">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">
                Tools this uses
              </p>
              <ul className="flex flex-col gap-1.5">
                {guides.map((guide) => (
                  <li key={guide.href}>
                    <Link href={guide.href} className="text-[13px] font-semibold text-brand-link">
                      {guide.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {showHistory && <HistoryCard versions={versions} />}
        </aside>
      </div>
    </>
  );
}
