import { requireAcademicPartnershipsAccess } from "@/lib/academic-partnerships/access";
import { PageHeader } from "@/components/ui/page-header";
import { NavTabs } from "./nav-tabs";

export default async function AcademicPartnershipsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isCoordinator } = await requireAcademicPartnershipsAccess();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <PageHeader
        size="page"
        className="mb-5"
        title="Academic Partnerships"
        description="Faculty inquiries for the WUWF Applied Media Partnership Program."
      />
      <NavTabs showSettings={isCoordinator} />
      {children}
    </div>
  );
}
