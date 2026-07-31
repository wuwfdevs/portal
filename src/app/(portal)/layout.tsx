import { requireActiveProfile } from "@/lib/auth/authz";
import { PortalNav } from "@/components/portal-nav";
import { AgentChatWidget } from "@/components/agent-chat-widget";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireActiveProfile();

  return (
    <div className="min-h-screen bg-white">
      <PortalNav profile={profile} />
      {/* AgentChatWidget's <aside> is a real flex sibling (not a fixed
          overlay), so opening it pushes this content left instead of
          covering it — see the component's own comment. */}
      <div className="flex items-start">
        <main className="min-w-0 flex-1">{children}</main>
        <AgentChatWidget />
      </div>
    </div>
  );
}
