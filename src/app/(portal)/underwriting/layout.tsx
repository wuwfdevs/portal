import { requireUnderwritingAccess } from "@/lib/underwriting/access";
import { getTrafficNavCounts } from "@/lib/underwriting/queries";
import { NavTabs } from "./nav-tabs";

export default async function UnderwritingLayout({ children }: { children: React.ReactNode }) {
  const { isManager } = await requireUnderwritingAccess();
  const counts = await getTrafficNavCounts(isManager);

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Traffic</h1>
        <p className="mt-1 text-xs text-ink-400">
          Contracts, copy, credit placement into On Air&apos;s rundowns, exceptions and makegoods,
          and affidavits.
        </p>
      </div>
      <NavTabs counts={counts} />
      {children}
    </div>
  );
}
