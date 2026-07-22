import { requireAdministrator } from "@/lib/auth/authz";
import { AdminTabLink } from "@/components/admin-tab-link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdministrator();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <h1 className="mb-3 font-serif text-2xl font-bold text-ink-900">User &amp; access administration</h1>
      <nav className="mb-5 flex gap-4 text-[13px]">
        <AdminTabLink href="/admin/users">Users</AdminTabLink>
        <AdminTabLink href="/admin/tools">Tools</AdminTabLink>
        <AdminTabLink href="/admin/audit">Audit log</AdminTabLink>
      </nav>
      {children}
    </div>
  );
}
