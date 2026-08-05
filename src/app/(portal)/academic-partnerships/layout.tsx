import { requireAcademicPartnershipsAccess } from "@/lib/academic-partnerships/access";
import { NavTabs } from "./nav-tabs";

export default async function AcademicPartnershipsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isCoordinator } = await requireAcademicPartnershipsAccess();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Academic Partnerships</h1>
        <p className="mt-1 text-xs text-ink-400">
          Faculty inquiries for the WUWF Applied Media Partnership Program.
        </p>
      </div>
      <NavTabs showSettings={isCoordinator} />
      {children}
    </div>
  );
}
