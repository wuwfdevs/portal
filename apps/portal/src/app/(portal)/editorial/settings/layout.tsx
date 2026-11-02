import { requireEditorialAccess } from "@/lib/editorial/access";
import { SettingsNav } from "./settings-nav";

export default async function EditorialSettingsLayout({ children }: { children: React.ReactNode }) {
  await requireEditorialAccess("editor");

  return (
    <div>
      <SettingsNav />
      <p className="-mt-2 mb-4 max-w-2xl text-xs leading-relaxed text-ink-400">
        What writers are asked for, and what reviewers score against. Retired entries stay on the
        pitches and scores that used them, so nothing you change here rewrites history.
      </p>
      {children}
    </div>
  );
}
