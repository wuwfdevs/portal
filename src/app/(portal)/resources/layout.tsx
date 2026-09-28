import { requireResourcesAccess } from "@/lib/resources/access";

export default async function ResourcesLayout({ children }: { children: React.ReactNode }) {
  await requireResourcesAccess();
  return <div className="px-6 py-7 sm:px-8 sm:pb-12">{children}</div>;
}
