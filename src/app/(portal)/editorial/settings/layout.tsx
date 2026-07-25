import { requireEditorialAccess } from "@/lib/editorial/access";
import { EditorialTabLink } from "@/components/editorial-tab-link";

export default async function EditorialSettingsLayout({ children }: { children: React.ReactNode }) {
  await requireEditorialAccess("editor");

  return (
    <div>
      <div className="mb-4 border-b border-line pb-3">
        <nav className="flex gap-4 text-[13px]">
          <EditorialTabLink href="/editorial/settings/form">Submission form</EditorialTabLink>
          <EditorialTabLink href="/editorial/settings/rubric">Rubric</EditorialTabLink>
        </nav>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-400">
          What writers are asked for, and what reviewers score against. Retired entries stay on the
          pitches and scores that used them, so nothing you change here rewrites history.
        </p>
      </div>
      {children}
    </div>
  );
}
