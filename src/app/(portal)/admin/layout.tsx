import { requireAdministrator } from "@/lib/auth/authz";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdministrator();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <h1 className="mb-3 font-serif text-2xl font-bold text-ink-900">User &amp; access administration</h1>
      <AdminNav />
      {children}
    </div>
  );
}
