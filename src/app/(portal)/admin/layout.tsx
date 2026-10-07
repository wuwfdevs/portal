import { requireAdministrator } from "@/lib/auth/authz";
import { PageHeader } from "@/components/ui/page-header";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdministrator();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <PageHeader size="page" className="mb-3" title="User & access administration" />
      <AdminNav />
      {children}
    </div>
  );
}
