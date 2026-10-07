import { TabNav } from "@/components/ui/tab-nav";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { TextLink } from "@/components/ui/primary-link";
import { SectionHeading } from "@/components/ui/section-heading";
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
import { RoadmapKanban } from "./kanban-board";

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
      <TabNav
        className="mb-0"
        tabs={[
          { href: "/roadmap?tab=requests", label: "Requests", active: activeTab === "requests" },
          { href: "/roadmap?tab=roadmap", label: "Roadmap", active: activeTab === "roadmap" },
        ]}
      />

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
              <TextLink href="/roadmap" className="pb-2.5 text-xs font-semibold">
                Clear
              </TextLink>
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
          <RoadmapKanban posts={posts} />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-[13px] text-ink-500">
            What has actually been decided. Requests nobody has ruled on yet live on the Requests
            tab.
          </p>
          {groupForRoadmap(posts).map((column) => (
            <section key={column.status}>
              <SectionHeading className="mb-2.5" count={column.posts.length}>
                {POST_STATUS_BADGE[column.status].label}
              </SectionHeading>
              {column.posts.length === 0 ? (
                <EmptyState compact>
                  Nothing {POST_STATUS_BADGE[column.status].label.toLowerCase()} right now.
                </EmptyState>
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
