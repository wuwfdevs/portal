import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DetailSummary } from "@/components/ui/detail-summary";
import { RichText } from "@/components/ui/rich-text";
import { requireResourcesAccess } from "@/lib/resources/access";
import { formatAudience, formatUpdatedDate, guideLinksInBody } from "@/lib/resources/articles";
import { resolveFigures } from "@/lib/resources/media";
import { getArticleVersion, getProcedure, listVersions } from "@/lib/resources/queries";
import { HistoryCard } from "../../history-card";

const SAVED_LABELS: Record<string, string> = { created: "Created", updated: "Saved" };

export default async function ProcedurePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ history?: string; version?: string; saved?: string }>;
}) {
  const [{ slug }, { history, version, saved }, { isEditor }] = await Promise.all([
    params,
    searchParams,
    requireResourcesAccess(),
  ]);
  const procedure = await getProcedure(slug);
  if (!procedure) notFound();

  const requested = Number(version);
  const past =
    Number.isInteger(requested) && requested > 0 && requested !== procedure.version
      ? await getArticleVersion(procedure.id, requested)
      : null;
  const showHistory = history === "1" || past !== null;
  const [versions, figures] = await Promise.all([
    showHistory ? listVersions(procedure.id) : Promise.resolve([]),
    resolveFigures([past?.body ?? procedure.body]),
  ]);
  const shown = past ?? procedure;
  const guides = guideLinksInBody(shown.body);
  const updated = formatUpdatedDate(procedure.updated_at);
  const basePath = `/resources/procedures/${procedure.slug}`;
  const historyHref = (target: number | null) =>
    target === null ? `${basePath}?history=1#history` : `${basePath}?version=${target}`;

  return (
    <>
      <Link href="/resources" className="mb-5 inline-block text-xs font-semibold text-brand-link">
        ← Back to resources
      </Link>
      <div className="flex flex-wrap items-start gap-8">
        <article className="min-w-0 max-w-[720px] flex-[1_1_520px]">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-2xl font-bold leading-snug text-ink-900">
              {shown.title}
            </h1>
            {saved && SAVED_LABELS[saved] && <Badge variant="success">{SAVED_LABELS[saved]}</Badge>}
          </div>
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
          {past && (
            <Alert variant="note" className="mt-4">
              You&apos;re reading version {past.version}, from {formatUpdatedDate(past.created_at)}.{" "}
              <Link href={basePath} className="font-semibold text-brand-link">
                Read the current version
              </Link>
            </Alert>
          )}
          <RichText
            body={shown.body}
            figures={figures}
            className="mt-5 text-sm text-ink-700"
            fallback={<p className="mt-5 text-sm text-ink-500">This procedure has no text yet.</p>}
          />
        </article>

        <aside className="flex min-w-[260px] flex-[0_1_320px] flex-col gap-4">
          <DetailSummary
            title="Details"
            editHref={isEditor ? `${basePath}/edit` : undefined}
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
                      href={showHistory ? basePath : `${basePath}?history=1#history`}
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
          {showHistory && (
            <HistoryCard
              versions={versions}
              hrefFor={historyHref}
              viewing={past?.version ?? procedure.version}
            />
          )}
        </aside>
      </div>
    </>
  );
}
