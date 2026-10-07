import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailSummary } from "@/components/ui/detail-summary";
import { PageHeader } from "@/components/ui/page-header";
import { TextLink } from "@/components/ui/primary-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { RichText } from "@/components/ui/rich-text";
import { requireResourcesAccess } from "@/lib/resources/access";
import { formatUpdatedDate, guideLinksInBody } from "@/lib/resources/articles";
import { resolveFigures } from "@/lib/resources/media";
import {
  getArticleVersion,
  getProcedure,
  isProcedurePinned,
  listVersions,
} from "@/lib/resources/queries";
import { setProcedurePinned } from "../../actions";
import { HistoryCard } from "../../history-card";

const SAVED_LABELS: Record<string, string> = { created: "Created", updated: "Saved" };

export default async function ProcedurePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ history?: string; version?: string; saved?: string; error?: string }>;
}) {
  const [{ slug }, { history, version, saved, error }, { isEditor }] = await Promise.all([
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
  const [versions, figures, pinned] = await Promise.all([
    showHistory ? listVersions(procedure.id) : Promise.resolve([]),
    resolveFigures([past?.body ?? procedure.body]),
    isEditor ? isProcedurePinned(procedure.id) : Promise.resolve(false),
  ]);
  const shown = past ?? procedure;
  const guides = guideLinksInBody(shown.body);
  const updated = formatUpdatedDate(procedure.updated_at);
  const basePath = `/resources/procedures/${procedure.slug}`;
  const historyHref = (target: number | null) =>
    target === null ? `${basePath}?history=1#history` : `${basePath}?version=${target}`;

  return (
    <>
      <div className="flex flex-wrap items-start gap-8">
        <article className="min-w-0 max-w-[720px] flex-[1_1_520px]">
          <PageHeader
            size="page"
            back={{ href: "/resources", label: "Back to resources" }}
            title={shown.title}
            badge={
              saved && SAVED_LABELS[saved] ? (
                <Badge variant="success">{SAVED_LABELS[saved]}</Badge>
              ) : undefined
            }
          />
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
          {error && (
            <Alert variant="danger" className="mt-4">
              {error}
            </Alert>
          )}
          {past && (
            <Alert variant="note" className="mt-4">
              You&apos;re reading version {past.version}, from {formatUpdatedDate(past.created_at)}.{" "}
              <TextLink href={basePath} className="px-0 text-xs font-semibold">
                Read the current version
              </TextLink>
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
              {
                label: "Version",
                value: (
                  <>
                    {procedure.version} ·{" "}
                    <TextLink
                      href={showHistory ? basePath : `${basePath}?history=1#history`}
                      className="px-0 text-[13px] font-semibold"
                    >
                      {showHistory ? "Hide history" : "History"}
                    </TextLink>
                  </>
                ),
              },
              { label: "Updated", value: updated },
            ]}
          />
          {isEditor && (
            <form
              action={setProcedurePinned}
              className="flex flex-col gap-2 rounded border border-line bg-white p-5"
            >
              <SectionHeading level="eyebrow">Resources home</SectionHeading>
              <p className="text-[13px] text-ink-700">
                {pinned
                  ? "Pinned under \u201cWhen something breaks on air\u201d."
                  : "Pin this procedure under \u201cWhen something breaks on air\u201d on the Resources home page."}
              </p>
              <input type="hidden" name="id" value={procedure.id} />
              <input type="hidden" name="pinned" value={pinned ? "0" : "1"} />
              <input type="hidden" name="return_to" value={basePath} />
              <Button type="submit" variant="secondary" className="self-start">
                {pinned ? "Unpin" : "Pin to home page"}
              </Button>
            </form>
          )}
          {guides.length > 0 && (
            <Card className="p-5">
              <SectionHeading level="eyebrow" className="mb-2">
                Tools this uses
              </SectionHeading>
              <ul className="flex flex-col gap-1.5">
                {guides.map((guide) => (
                  <li key={guide.href}>
                    <TextLink href={guide.href} className="px-0 text-[13px] font-semibold">
                      {guide.label}
                    </TextLink>
                  </li>
                ))}
              </ul>
            </Card>
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
