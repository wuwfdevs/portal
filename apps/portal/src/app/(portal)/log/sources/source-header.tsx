import { PageHeader } from "@/components/ui/page-header";

/** The top of a source's own page: the way back to the Sources overview, and the source's name. */
export function SourceHeader({ title }: { title: string }) {
  return (
    <PageHeader
      as="h2"
      back={{ href: "/log/sources", label: "Sources" }}
      title={title}
      className="mb-4"
    />
  );
}
