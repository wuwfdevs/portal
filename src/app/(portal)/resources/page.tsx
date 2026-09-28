import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { FilterChips } from "@/components/ui/filter-chips";
import { FieldHint, Input } from "@/components/ui/input";
import { PrimaryLink } from "@/components/ui/primary-link";
import { ToolIcon } from "@/components/tool-icon";
import { formatReleaseDate, formatUpdatedDate } from "@/lib/resources/articles";
import { requireResourcesAccess } from "@/lib/resources/access";
import {
  articleHref,
  countProcedures,
  listProcedureAreaCounts,
  listRecentProcedures,
  listReleaseNotes,
  listToolGuideSummaries,
  searchArticles,
  type SearchHit,
} from "@/lib/resources/queries";

const KIND_LABELS = { procedure: "Procedure", guide: "Guide", release_note: "Release note" };
const RECENT_PROCEDURES_LIMIT = 5;

export default async function ResourcesHomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; deleted?: string }>;
}) {
  const [{ q, deleted }, { isEditor }] = await Promise.all([searchParams, requireResourcesAccess()]);
  const query = q?.trim() ?? "";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-2xl font-bold text-ink-900">Resources</h1>
            {deleted === "1" && <Badge variant="success">Deleted</Badge>}
          </div>
          <p className="mt-1 text-xs text-ink-400">
            Station procedures, a guide to every tool in the portal, and notes on what changed.
          </p>
        </div>
        {isEditor && (
          <div className="flex items-center gap-3">
            <Link
              href="/resources/guides/new"
              className="text-sm font-semibold text-brand-link hover:underline"
            >
              + New guide
            </Link>
            <PrimaryLink href="/resources/procedures/new">+ New procedure</PrimaryLink>
          </div>
        )}
      </div>

      <form method="get" className="mb-8 max-w-xl">
        <Input
          type="search"
          name="q"
          placeholder="Search procedures, tool guides, and release notes…"
          defaultValue={query}
          aria-label="Search resources"
        />
        <FieldHint>
          The assistant answers from these same pages, so anything you can find here you can also
          ask about.
        </FieldHint>
      </form>

      {query ? <SearchResults query={query} /> : <Sections />}
    </>
  );
}

async function SearchResults({ query }: { query: string }) {
  const hits = await searchArticles(query);
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-ink-500">
        <span>
          {hits.length} result{hits.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
        </span>
        <Link href="/resources" className="text-xs font-semibold text-brand-link">
          Clear search
        </Link>
      </div>
      {hits.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          Nothing matches. Try fewer or different words.
        </div>
      ) : (
        <ul className="max-w-[760px] rounded border border-line">
          {hits.map((hit) => (
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
        {tool && <span className="text-xs text-ink-400">{tool.name}</span>}
      </div>
      <Link
        href={articleHref(article, tool)}
        className="mt-1 block text-sm font-semibold text-brand-link hover:underline"
      >
        {article.title}
      </Link>
      {article.summary && <p className="mt-0.5 text-xs text-ink-400">{article.summary}</p>}
    </li>
  );
}

async function Sections() {
  const [allCount, areaCounts, recentProcedures, toolGuides, latestNotes] = await Promise.all([
    countProcedures(null),
    listProcedureAreaCounts(),
    listRecentProcedures(RECENT_PROCEDURES_LIMIT),
    listToolGuideSummaries(),
    listReleaseNotes({ limit: 3 }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="font-serif text-[15px] font-bold text-ink-900">Tool guides</h2>
        <p className="mb-4 mt-1 text-[13px] text-ink-500">
          Written alongside each tool and updated in the same release that changes it. You see
          guides for the tools you can open.
        </p>
        {toolGuides.length === 0 ? (
          <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
            No guides for the tools you can open yet.
          </div>
        ) : (
          <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {toolGuides.map((entry) => (
              <Link
                key={entry.tool.id}
                href={`/resources/tools/${entry.tool.key}/${entry.firstSlug}`}
                className="flex flex-col gap-3 rounded border border-line bg-white p-5 hover:border-brand-primary"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded bg-brand-surface text-brand-link">
                  <ToolIcon toolKey={entry.tool.key} />
                </span>
                <span className="font-serif text-[17px] font-bold text-ink-900">
                  {entry.tool.name}
                </span>
                <span className="text-[13px] text-ink-500">
                  {entry.count} guide{entry.count === 1 ? "" : "s"} · Updated{" "}
                  {formatUpdatedDate(entry.lastUpdated, true)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="font-serif text-[15px] font-bold text-ink-900">What&apos;s new</h2>
          <Link href="/resources/whats-new" className="text-xs font-semibold text-brand-link">
            All release notes
          </Link>
        </div>
        {latestNotes.length === 0 ? (
          <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
            No release notes yet.
          </div>
        ) : (
          <ul className="max-w-[760px] rounded border border-line">
            {latestNotes.map((note) => (
              <li
                key={note.id}
                className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <span className="w-14 shrink-0 text-xs text-ink-400">
                  {note.released_on ? formatReleaseDate(note.released_on, true) : ""}
                </span>
                {note.tool && <Badge variant="neutral">{note.tool.name}</Badge>}
                <Link
                  href={articleHref(note, note.tool)}
                  className="min-w-0 text-sm font-semibold text-ink-900 hover:text-brand-link"
                >
                  {note.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="font-serif text-[15px] font-bold text-ink-900">
            Station procedures
            <span className="ml-2 text-xs font-normal text-ink-400">{allCount}</span>
          </h2>
          <Link href="/resources/procedures" className="text-xs font-semibold text-brand-link">
            All procedures
          </Link>
        </div>
        {areaCounts.length > 0 && (
          <FilterChips
            label="Area"
            className="mb-4"
            chips={areaCounts.map((entry) => ({
              label: entry.area,
              count: entry.count,
              href: `/resources/procedures?area=${encodeURIComponent(entry.area)}`,
              active: false,
            }))}
          />
        )}
        {recentProcedures.length === 0 ? (
          <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
            No procedures yet.
          </div>
        ) : (
          <ul className="max-w-[760px] rounded border border-line">
            {recentProcedures.map((procedure) => (
              <li key={procedure.id} className="border-b border-line px-4 py-3 last:border-b-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
                  <span>{procedure.area}</span>
                  <span>·</span>
                  <span>Updated {formatUpdatedDate(procedure.updated_at, true)}</span>
                </div>
                <Link
                  href={articleHref(procedure, null)}
                  className="mt-0.5 block text-sm font-semibold text-brand-link hover:underline"
                >
                  {procedure.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
