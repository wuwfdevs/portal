import Link from "next/link";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Input } from "@/components/ui/input";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { ToolIcon } from "@/components/tool-icon";
import {
  SEARCH_SCOPES,
  formatReleaseDate,
  groupByReleaseDate,
  groupProceduresByArea,
  hitsInScope,
  parseSearchScope,
  type SearchScope,
} from "@/lib/resources/articles";
import { requireResourcesAccess } from "@/lib/resources/access";
import {
  articleHref,
  listPinnedProcedures,
  listProcedureLinks,
  listReleaseNotes,
  listToolGuideSummaries,
  searchArticles,
  type SearchHit,
} from "@/lib/resources/queries";

const KIND_LABELS = { procedure: "Procedure", guide: "Guide", release_note: "Release note" };
/** Guide titles shown on a tool card, and procedure titles on an area card. */
const PREVIEW_LIMIT = 3;
const RELEASE_NOTES_LIMIT = 6;
/**
 * The area whose procedures explain the portal itself, surfaced as "New to
 * the portal?". Area is free text, so if nobody uses this one the card simply
 * doesn't render.
 */
const ONBOARDING_AREA = "Using the portal";

export default async function ResourcesHomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; in?: string; deleted?: string; error?: string }>;
}) {
  const [{ q, in: scopeParam, deleted, error }, { isEditor }] = await Promise.all([
    searchParams,
    requireResourcesAccess(),
  ]);
  const query = q?.trim() ?? "";
  const scope = parseSearchScope(scopeParam);

  return (
    <>
      <section className="-mx-6 -mt-7 mb-9 border-b border-line bg-panel-50 px-6 pb-8 pt-9 sm:-mx-8 sm:px-8">
        <p className="text-xs font-bold tracking-[0.08em] text-brand-link">RESOURCES</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-[26px] font-bold leading-tight text-ink-900 sm:text-[32px]">
            How the station runs, and how the tools work
          </h1>
          {deleted === "1" && <Badge variant="success">Deleted</Badge>}
        </div>
        <p className="mt-2 text-base text-ink-500">
          Station procedures, a guide to every tool you can open, and notes on what changed.
        </p>

        <form method="get" className="mt-5 max-w-[760px]">
          <div className="flex gap-2">
            <label className="relative flex flex-1 items-center">
              <span className="sr-only">Search resources</span>
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none absolute left-3.5 text-ink-500"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <Input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search — for example, “restart a web stream”"
                className="h-[52px] pl-11 sm:text-base"
              />
            </label>
            <Button type="submit" className="h-[52px] shrink-0 px-5 text-base sm:px-6">
              Search
            </Button>
          </div>
          <fieldset className="mt-3 flex flex-wrap items-center gap-1.5">
            <legend className="sr-only">Search in</legend>
            <span aria-hidden="true" className="mr-1 text-[13px] text-ink-500">
              Search in
            </span>
            {SEARCH_SCOPES.map((option) => (
              <label key={option.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="in"
                  value={option.value}
                  defaultChecked={scope === option.value}
                  className="peer sr-only"
                />
                <span className="block rounded-full border border-line bg-white px-3 py-1 text-[13px] font-semibold text-ink-700 peer-checked:border-brand-primary peer-checked:bg-brand-surface peer-checked:text-brand-link peer-focus-visible:ring-2 peer-focus-visible:ring-brand-primary">
                  {option.label}
                </span>
              </label>
            ))}
            <span className="ml-2 text-[13px] text-ink-500">
              The assistant answers from these same pages.
            </span>
          </fieldset>
        </form>
      </section>

      {error && (
        <Alert variant="danger" className="mb-6">
          {error}
        </Alert>
      )}

      {query ? <SearchResults query={query} scope={scope} /> : <Sections isEditor={isEditor} />}
    </>
  );
}

async function SearchResults({ query, scope }: { query: string; scope: SearchScope }) {
  const hits = await searchArticles(query);
  const shown = hitsInScope(hits, scope);
  const href = (value: SearchScope) =>
    `/resources?q=${encodeURIComponent(query)}${value === "all" ? "" : `&in=${value}`}`;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-ink-500">
        <span>
          {shown.length} result{shown.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
        </span>
        <TextLink href="/resources" className="px-0 text-xs font-semibold">
          Clear search
        </TextLink>
      </div>
      {hits.length > 0 && (
        <FilterChips
          label="Show"
          className="mb-4"
          chips={SEARCH_SCOPES.map((option) => ({
            label: option.label,
            count: hitsInScope(hits, option.value).length,
            href: href(option.value),
            active: scope === option.value,
          }))}
        />
      )}
      {shown.length === 0 ? (
        <EmptyState>
          Nothing matches. Try fewer or different words
          {scope === "all" ? "" : ", or search everything"}.
        </EmptyState>
      ) : (
        <ul className="max-w-[760px] rounded border border-line">
          {shown.map((hit) => (
            <SearchResultRow key={hit.article.id} hit={hit} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SearchResultRow({ hit }: { hit: SearchHit }) {
  const { article, tool } = hit;
  return (
    <li className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={article.kind === "procedure" ? "accent" : "neutral"}>
          {KIND_LABELS[article.kind]}
        </Badge>
        {tool && <span className="text-xs text-ink-500">{tool.name}</span>}
      </div>
      <Link
        href={articleHref(article, tool)}
        className="mt-1 block text-sm font-semibold text-brand-link hover:underline"
      >
        {article.title}
      </Link>
      {article.summary && <p className="mt-0.5 text-xs text-ink-500">{article.summary}</p>}
    </li>
  );
}

function HomeSectionHeading({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: ReactNode;
}) {
  return (
    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="font-serif text-[22px] font-bold text-ink-900">
        {title}
        {count !== undefined && (
          <span className="ml-2 font-sans text-[15px] font-normal text-ink-500">{count}</span>
        )}
      </h2>
      {children && <div className="flex items-center gap-4">{children}</div>}
    </div>
  );
}

async function Sections({ isEditor }: { isEditor: boolean }) {
  const [procedures, pinned, toolGuides, latestNotes] = await Promise.all([
    listProcedureLinks(),
    listPinnedProcedures(),
    listToolGuideSummaries(),
    listReleaseNotes({ limit: RELEASE_NOTES_LIMIT }),
  ]);
  const areas = groupProceduresByArea(procedures, PREVIEW_LIMIT);
  const onboarding = procedures.filter((procedure) => procedure.area === ONBOARDING_AREA);
  const noteDays = groupByReleaseDate(latestNotes);

  // DOM order is the phone order — tool guides, what's new, procedures. On a
  // wide screen what's new moves to a right column spanning both rows; the
  // second row takes any extra height so the first never stretches.
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:gap-x-12">
      <section className="min-w-0 lg:col-start-1 lg:row-start-1">
        <HomeSectionHeading title="Tool guides">
          {isEditor && (
            <TextLink href="/resources/guides/new" className="px-0 font-semibold">
              + New guide
            </TextLink>
          )}
        </HomeSectionHeading>
        <p className="mb-4 text-sm text-ink-500">
          Updated in the same release that changes each tool. Guides for the tools you can open.
        </p>
        {toolGuides.length === 0 ? (
          <EmptyState>No guides for the tools you can open yet.</EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {toolGuides.map((entry) => {
              const extra = entry.count - PREVIEW_LIMIT;
              return (
                <Card key={entry.tool.id} className="flex flex-col gap-3 p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-brand-surface text-brand-link">
                      <ToolIcon toolKey={entry.tool.key} />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <Link
                        href={`/resources/tools/${entry.tool.key}/${entry.firstSlug}`}
                        className="font-serif text-[17px] font-bold text-ink-900 hover:text-brand-link"
                      >
                        {entry.tool.name}
                      </Link>
                      <span className="text-[13px] text-ink-500">
                        {entry.count} guide{entry.count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <ul className="flex flex-col gap-2 border-t border-line pt-3">
                    {entry.guides.slice(0, PREVIEW_LIMIT).map((guide) => (
                      <li key={guide.slug} className="text-sm leading-snug">
                        <Link
                          href={`/resources/tools/${entry.tool.key}/${guide.slug}`}
                          className="text-brand-link hover:underline"
                        >
                          {guide.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {extra > 0 && (
                    <Link
                      href={`/resources/tools/${entry.tool.key}`}
                      className="text-[13px] font-semibold text-ink-500 hover:text-brand-link"
                    >
                      + {extra} more
                    </Link>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Card className="px-6 py-5">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-xl font-bold text-ink-900">What&apos;s new</h2>
            <Link href="/resources/whats-new" className="text-[13px] font-semibold text-brand-link">
              All release notes
            </Link>
          </div>
          {noteDays.length === 0 ? (
            <p className="pt-3 text-sm text-ink-500">No release notes yet.</p>
          ) : (
            noteDays.map((day) => (
              <div key={day.date} className="pt-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">
                  {formatReleaseDate(day.date, true)}
                </p>
                <ul>
                  {day.notes.map((note) => (
                    <li
                      key={note.id}
                      className="flex flex-col gap-0.5 border-b border-line py-2 last:border-b-0"
                    >
                      {note.tool && (
                        <span className="text-xs font-semibold text-brand-link">
                          {note.tool.name}
                        </span>
                      )}
                      <Link
                        href={articleHref(note, note.tool)}
                        className="text-[15px] font-semibold leading-snug text-ink-900 hover:text-brand-link"
                      >
                        {note.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </Card>

        {onboarding.length > 0 && (
          <section className="flex flex-col gap-2.5 rounded border border-line bg-panel-50 px-6 py-5">
            <SectionHeading>New to the portal?</SectionHeading>
            <ul className="flex flex-col gap-2">
              {onboarding.map((procedure) => (
                <li key={procedure.id} className="text-sm">
                  <Link
                    href={`/resources/procedures/${procedure.slug}`}
                    className="text-brand-link hover:underline"
                  >
                    {procedure.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <section className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-2">
        <div>
          <HomeSectionHeading title="Station procedures" count={procedures.length}>
            <TextLink href="/resources/procedures" className="px-0 font-semibold">
              All procedures
            </TextLink>
            {isEditor && (
              <PrimaryLink href="/resources/procedures/new">+ New procedure</PrimaryLink>
            )}
          </HomeSectionHeading>
          <p className="text-sm text-ink-500">How WUWF gets things done, by area.</p>
        </div>

        {(pinned.length > 0 || isEditor) && (
          <div className="flex flex-col gap-3.5 rounded bg-[#0F2235] px-6 py-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xs font-bold tracking-[0.08em] text-success-border">
                ON-AIR TROUBLE
              </span>
              <h3 className="font-serif text-lg font-bold text-white">
                When something breaks on air
              </h3>
            </div>
            {pinned.length === 0 ? (
              <p className="text-sm text-[#C9D3DE]">
                Nothing is pinned. Open a procedure and choose &ldquo;Pin to home page&rdquo;.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 sm:gap-x-6">
                {pinned.map((procedure) => (
                  <li key={procedure.id}>
                    <Link
                      href={`/resources/procedures/${procedure.slug}`}
                      className="flex min-h-11 items-center gap-2.5 rounded border border-[#2A3F55] px-3 py-2 text-[15px] font-semibold text-white hover:border-brand-primary hover:bg-[#16304A]"
                    >
                      <svg
                        aria-hidden="true"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 text-success-border"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                      {procedure.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {isEditor && pinned.length > 0 && (
              <p className="text-xs text-[#C9D3DE]">Pin or unpin a procedure from its own page.</p>
            )}
          </div>
        )}

        {areas.length === 0 ? (
          <EmptyState>No procedures yet.</EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {areas.map((group) => {
              const areaHref = `/resources/procedures?area=${encodeURIComponent(group.area)}`;
              return (
                <Card key={group.area} className="flex flex-col gap-2.5 p-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link
                      href={areaHref}
                      className="font-serif text-base font-bold text-ink-900 hover:text-brand-link"
                    >
                      {group.area}
                    </Link>
                    <span className="shrink-0 text-[13px] text-ink-500">{group.count}</span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {group.preview.map((procedure) => (
                      <li key={procedure.id} className="text-sm leading-snug">
                        <Link
                          href={`/resources/procedures/${procedure.slug}`}
                          className="text-brand-link hover:underline"
                        >
                          {procedure.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {group.count > group.preview.length && (
                    <Link
                      href={areaHref}
                      className="text-[13px] font-semibold text-ink-500 hover:text-brand-link"
                    >
                      All {group.count} in {group.area}
                    </Link>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
