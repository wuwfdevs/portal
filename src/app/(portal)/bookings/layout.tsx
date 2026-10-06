import { requireBookingsAccess } from "@/lib/bookings/access";
import { NavTabs } from "./nav-tabs";

export default async function BookingsLayout({ children }: { children: React.ReactNode }) {
  const context = await requireBookingsAccess();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Bookings</h1>
        <p className="mt-1 text-xs text-ink-400">
          University production work: capacity, rates, recovery.
        </p>
      </div>
      <NavTabs roles={context.roles} isAdministrator={context.isAdministrator} />
      {children}
    </div>
  );
}
