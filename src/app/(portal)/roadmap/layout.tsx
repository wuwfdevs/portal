import Link from "next/link";
import { requireRoadmapAccess } from "@/lib/roadmap/access";

export default async function RoadmapLayout({ children }: { children: React.ReactNode }) {
  const { isCurator } = await requireRoadmapAccess();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Roadmap</h1>
          <p className="mt-1 text-xs text-ink-400">
            {isCurator
              ? "Ask for what these tools should do next — and decide what happens to what everyone else asked for."
              : "Ask for what these tools should do next, and vote on what everyone else asked for."}
          </p>
        </div>
        <Link
          href="/roadmap/new"
          className="shrink-0 rounded bg-brand-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2278B8]"
        >
          New request
        </Link>
      </div>
      {children}
    </div>
  );
}
