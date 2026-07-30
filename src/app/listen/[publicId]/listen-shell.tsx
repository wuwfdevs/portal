import type { ReactNode } from "react";

/**
 * The card every public screen sits in.
 *
 * A participant should not be able to tell this is part of a larger internal
 * tools site — the same call Remote Interview's GuestShell makes for guests,
 * and for the same reason. Two differences from that one: this shell shows a
 * WUWF wordmark when it stands alone (a page you arrive at from a link needs to
 * say whose it is), and suppresses it inside an embed, where the surrounding
 * article has already said so.
 *
 * `embedded` also drops the vertical centring and outer padding: inside an
 * iframe the frame is the viewport, and centring in it just wastes the height
 * the reporter budgeted.
 */
export function ListenShell({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  if (embedded) {
    return (
      <div className="min-h-screen bg-white px-4 py-5 sm:px-6">
        <div className="mx-auto w-full max-w-xl">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-panel-50 px-4 py-8 sm:items-center sm:py-14">
      <div className="w-full max-w-xl">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-brand-surface text-xs font-bold text-brand-link">
            W
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-ink-500">
            WUWF Public Media
          </span>
        </div>
        <div className="rounded border border-line bg-white p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
