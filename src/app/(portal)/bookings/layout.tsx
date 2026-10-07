import { requireBookingsAccess } from "@/lib/bookings/access";
import { NavTabs } from "./nav-tabs";
import { PageHeader } from "@/components/ui/page-header";

export default async function BookingsLayout({ children }: { children: React.ReactNode }) {
  const context = await requireBookingsAccess();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <PageHeader
        size="page"
        className="mb-5"
        title="Bookings"
        description="University production work: capacity, rates, recovery."
      />
      <NavTabs roles={context.roles} isAdministrator={context.isAdministrator} />
      {children}
    </div>
  );
}
