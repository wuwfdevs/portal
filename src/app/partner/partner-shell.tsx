import type { ReactNode } from "react";
import { PublicPolicyNotice } from "@/components/ui/public-policy-notice";

/**
 * The card every public screen sits in. Mirrors
 * src/app/listen/[publicId]/listen-shell.tsx exactly — a faculty submitter
 * should not be able to tell this is part of a larger internal tools site,
 * the standalone page needs a wordmark saying whose it is, and the embed
 * variant drops it (and the outer padding/centring) because the surrounding
 * article already has.
 */
export function PartnerShell({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  const card = (
    <div className="w-full overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(15,20,25,0.06)]">
      <div className="px-6 py-8 sm:px-8 sm:py-9">
        {children}
        <PublicPolicyNotice />
      </div>
    </div>
  );

  if (embedded) {
    // Deliberately no min-h-screen here: inside an iframe, 100vh resolves to
    // whatever height the embed snippet declared, not the content's actual
    // height — so a min-height would force this wrapper to fill that whole
    // number regardless of how short the real content is, which is exactly
    // the "preview taller than its content" bug. Size to content instead.
    return (
      <div className="bg-white px-4 py-5 sm:px-6">
        <div className="mx-auto w-full max-w-2xl">{card}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-panel-50 px-4 py-8 sm:py-14">
      <div className="w-full max-w-2xl">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-brand-surface text-xs font-bold text-brand-link">
            W
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-ink-500">
            WUWF Public Media
          </span>
        </div>
        {card}
      </div>
    </div>
  );
}
