import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { requireRoadmapAccess } from "@/lib/roadmap/access";
import { listPosts, listTargetTools } from "@/lib/roadmap/queries";
import {
  groupForRoadmap,
  normalizeSort,
  POST_KIND_LABEL,
  POST_STATUS_BADGE,
} from "@/lib/roadmap/posts";
import type { RdPostKind, RdPostStatus } from "@/lib/database.types";
import { PostRow } from "./post-row";
import { RoadmapKanbanField } from "./kanban-board-field";

const TABS = ["requests", "roadmap"] as const;
type Tab = (typeof TABS)[number];

const KINDS: RdPostKind[] = ["feature", "improvement", "bug", "new_tool"];
const STATUSES: RdPostStatus[] = [
  "open",
  "under_review",
  "planned",
  "in_progress",
  "shipped",
  "declined",
];

interface SearchParams {
  tab?: string;
  status?: string;
  kind?: string;
  tool?: string;
  sort?: string;
  error?: string;
}

/** The URL a vote cast from this screen should come back to. */
function currentUrl(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const key of ["tab", "status", "kind", "tool", "sort"] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  const search = query.toString();
  return search ? `/roadmap?${search}` : "/roadmap";
}

export default async function RoadmapPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { profile, isCurator } = await requireRoadmapAccess();

  const activeTab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "requests";
  const status = STATUSES.includes(params.status as RdPostStatus)
    ? (params.status as RdPostStatus)
    : undefined;
  const kind = KINDS.includes(params.kind as RdPostKind) ? (params.kind as RdPostKind) : undefined;
  const sort = normalizeSort(params.sort);

  const [posts, tools] = await Promise.all([
    listPosts(profile.id, { status, kind, toolId: params.tool || undefined, sort }),
    listTargetTools(),
  ]);

  const returnTo = currentUrl(params);

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex gap-5 border-b border-line text-[13px]">
        <TabLink label="Requests" tab="requests" active={activeTab === "requests"} />
        <TabLink label="Roadmap" tab="roadmap" active={activeTab === "roadmap"} />
      </nav>

      {params.error && <Alert>{params.error}</Alert>}

      {activeTab === "requests" ? (
        <>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="requests" />
            <FilterSelect name="status" label="Status" value={params.status}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {POST_STATUS_BADGE[value].label}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect name="kind" label="Kind" value={params.kind}>
              {KINDS.map((value) => (
                <option key={value} value={value}>
                  {POST_KIND_LABEL[value]}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect name="tool" label="About" value={params.tool}>
              {tools.map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {tool.name}
                  {tool.proposed ? " (proposed)" : ""}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect name="sort" label="Sort" value={sort} allLabel={null}>
              <option value="top">Most wanted</option>
              <option value="new">Newest</option>
            </FilterSelect>
            <Button type="submit" variant="secondary">
              Apply
            </Button>
            {(status || kind || params.tool) && (
              <Link href="/roadmap" className="pb-2.5 text-xs font-semibold text-brand-link">
                Clear
              </Link>
            )}
          </form>

          {posts.length === 0 ? (
            <EmptyState>
              Nothing here yet. If something about these tools slows you down, file it — that is
              what this is for.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2.5">
              {posts.map((post) => (
                <PostRow key={post.id} post={post} returnTo={returnTo} />
              ))}
            </div>
          )}
        </>
      ) : isCurator ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-500">
            Every request, grouped by where it stands. Drag a card between columns to change its
            status, or use its “Move to…” menu.
          </p>
          <RoadmapKanbanField posts={posts} />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-[13px] text-ink-500">
            What has actually been decided. Requests nobody has ruled on yet live on the Requests
            tab.
          </p>
          {groupForRoadmap(posts).map((column) => (
            <section key={column.status}>
              <h2 className="mb-2.5 font-serif text-[15px] font-bold text-ink-900">
                {POST_STATUS_BADGE[column.status].label}
                <span className="ml-2 text-xs font-normal text-ink-400">{column.posts.length}</span>
              </h2>
              {column.posts.length === 0 ? (
                <p className="rounded border border-dashed border-line px-4 py-3 text-xs text-ink-400">
                  Nothing {POST_STATUS_BADGE[column.status].label.toLowerCase()} right now.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {column.posts.map((post) => (
                    <PostRow key={post.id} post={post} returnTo={returnTo} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TabLink({ label, tab, active }: { label: string; tab: Tab; active: boolean }) {
  return (
    <Link
      href={`/roadmap?tab=${tab}`}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "-mb-px border-b-2 border-brand-primary pb-2 font-semibold text-brand-link"
          : "-mb-px border-b-2 border-transparent pb-2 font-semibold text-ink-400 hover:border-line hover:text-ink-700"
      }
    >
      {label}
    </Link>
  );
}

function FilterSelect({
  name,
  label,
  value,
  allLabel = "All",
  children,
}: {
  name: string;
  label: string;
  value: string | undefined;
  allLabel?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{label}</span>
      <Select name={name} defaultValue={value ?? ""} className="w-auto min-w-[9rem]">
        {allLabel !== null && <option value="">{allLabel}</option>}
        {children}
      </Select>
    </label>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
      {children}
    </div>
  );
}
