import { Suspense } from "react";
import { requireActiveProfile } from "@/lib/auth/authz";
import { PortalNav } from "@/components/portal-nav";
import { AgentChatWidget } from "@/components/agent-chat-widget";
import { HelpPanel } from "@/components/help-panel";
import { RightPanelProvider } from "@/components/right-panel";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireActiveProfile();

  return (
    <RightPanelProvider>
      <div className="min-h-screen bg-white">
        {/* Suspense: the nav and Help read the query string (useSearchParams)
            to tell Sourcework's Source Library tab from its projects. */}
        <Suspense fallback={<div className="h-16 border-b border-line" />}>
          <PortalNav profile={profile} />
        </Suspense>
        {/* The assistant and Help are right-hand <aside>s that are real flex
            siblings (not fixed overlays) at lg and up, so opening one pushes
            this content left instead of covering it. Only one is open at a
            time — see components/right-panel.tsx. */}
        <div className="flex items-start">
          <main className="min-w-0 flex-1">{children}</main>
          <Suspense fallback={null}>
            <HelpPanel />
          </Suspense>
          <AgentChatWidget />
        </div>
      </div>
    </RightPanelProvider>
  );
}
