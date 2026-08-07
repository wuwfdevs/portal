import { requireLogAccess } from "@/lib/log/access";
import { NavTabs } from "./nav-tabs";

export default async function LogLayout({ children }: { children: React.ReactNode }) {
  await requireLogAccess();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Log</h1>
        <p className="mt-1 text-xs text-ink-400">
          Daily broadcast rundown planning — clocks, programs, the content library, NPR and weather in
          context, and (soon) the live host console.
        </p>
      </div>
      <NavTabs />
      {children}
    </div>
  );
}
