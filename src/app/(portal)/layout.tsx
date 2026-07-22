import { requireActiveProfile } from "@/lib/auth/authz";
import { PortalNav } from "@/components/portal-nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireActiveProfile();

  return (
    <div className="min-h-screen bg-white">
      <PortalNav profile={profile} />
      {children}
    </div>
  );
}
