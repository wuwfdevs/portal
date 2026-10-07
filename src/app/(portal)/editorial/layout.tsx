import { requireEditorialAccess } from "@/lib/editorial/access";
import { PageHeader } from "@/components/ui/page-header";
import { NavTabs } from "./nav-tabs";

const ROLE_BLURB: Record<string, string> = {
  contributor: "You can submit pitches and follow how they're decided.",
  reviewer: "You can submit pitches and score the slate at planning meetings.",
  editor: "You run the meetings and configure the form and rubric.",
};

export default async function EditorialLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireEditorialAccess();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <PageHeader
        size="page"
        className="mb-4"
        title="Editorial Planning"
        description={ROLE_BLURB[role]}
      />
      <NavTabs role={role} />
      {children}
    </div>
  );
}
