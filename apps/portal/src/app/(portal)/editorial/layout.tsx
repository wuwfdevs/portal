import { requireEditorialAccess } from "@/lib/editorial/access";
import { PageHeader } from "@/components/ui/page-header";
import { NavTabs } from "./nav-tabs";

export default async function EditorialLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireEditorialAccess();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <PageHeader size="page" className="mb-4" title="Editorial Planning" />
      <NavTabs role={role} />
      {children}
    </div>
  );
}
