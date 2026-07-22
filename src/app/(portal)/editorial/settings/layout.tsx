import { requireEditorialAccess } from "@/lib/editorial/access";
import { EditorialTabLink } from "@/components/editorial-tab-link";

export default async function EditorialSettingsLayout({ children }: { children: React.ReactNode }) {
  await requireEditorialAccess("editor");

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <nav className="flex gap-4 text-[13px]">
          <EditorialTabLink href="/editorial/settings/form">Submission form</EditorialTabLink>
          <EditorialTabLink href="/editorial/settings/rubric">Rubric</EditorialTabLink>
        </nav>
      </div>
      <p className="mb-5 max-w-2xl text-xs leading-relaxed text-ink-400">
        Edits here are for typo fixes and clarifications. If a field or criterion should start
        meaning something different, deactivate it and create a new one — otherwise historical
        pitches and scores silently change meaning.
      </p>
      {children}
    </div>
  );
}
