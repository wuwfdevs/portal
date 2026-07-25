import { requireEditorialAccess } from "@/lib/editorial/access";
import { EditorialTabLink } from "@/components/editorial-tab-link";

const ROLE_BLURB: Record<string, string> = {
  contributor: "You can submit pitches and follow how they're decided.",
  reviewer: "You can submit pitches and score the slate at planning meetings.",
  editor: "You run the meetings and configure the form and rubric.",
};

export default async function EditorialLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireEditorialAccess();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <div className="mb-4">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Editorial Planning</h1>
        <p className="mt-1 text-xs text-ink-400">{ROLE_BLURB[role]}</p>
      </div>
      <nav className="mb-6 flex gap-5 border-b border-line text-[13px]">
        <EditorialTabLink href="/editorial" exact alsoMatch={["/editorial/pitches"]}>
          Backlog
        </EditorialTabLink>
        <EditorialTabLink href="/editorial/meetings">Meetings</EditorialTabLink>
        {role === "editor" && (
          <EditorialTabLink href="/editorial/settings/form" alsoMatch={["/editorial/settings"]}>
            Settings
          </EditorialTabLink>
        )}
      </nav>
      {children}
    </div>
  );
}
