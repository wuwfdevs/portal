import { requireUnderwritingAccess } from "@/lib/underwriting/access";
import { getTrafficNavCounts } from "@/lib/underwriting/queries";
import { NavTabs } from "./nav-tabs";
import { PageHeader } from "@/components/ui/page-header";

export default async function UnderwritingLayout({ children }: { children: React.ReactNode }) {
  const { isManager } = await requireUnderwritingAccess();
  const counts = await getTrafficNavCounts(isManager);

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <PageHeader
        size="page"
        className="mb-5"
        title="Traffic"
        description="Contracts, copy, credit placement into On Air's rundowns, exceptions and makegoods, and affidavits."
      />
      <NavTabs counts={counts} />
      {children}
    </div>
  );
}
