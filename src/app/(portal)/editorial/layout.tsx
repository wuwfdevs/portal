import { requireEditorialAccess } from "@/lib/editorial/access";
import { EditorialTabLink } from "@/components/editorial-tab-link";

export default async function EditorialLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireEditorialAccess();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <h1 className="mb-3 font-serif text-2xl font-bold text-ink-900">Editorial Planning</h1>
      <nav className="mb-5 flex gap-4 text-[13px]">
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
