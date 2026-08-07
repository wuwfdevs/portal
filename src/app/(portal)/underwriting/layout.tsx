import { requireUnderwritingAccess } from "@/lib/underwriting/access";
import { NavTabs } from "./nav-tabs";

export default async function UnderwritingLayout({ children }: { children: React.ReactNode }) {
  await requireUnderwritingAccess();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Underwriting &amp; Traffic</h1>
        <p className="mt-1 text-xs text-ink-400">
          Contracts, copy, and (soon) credit placement into Log&apos;s rundowns, the exception queue, and
          affidavits.
        </p>
      </div>
      <NavTabs />
      {children}
    </div>
  );
}
