import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TextLink } from "@/components/ui/primary-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { RichText } from "@/components/ui/rich-text";
import { formatReleaseDate, groupByReleaseDate } from "@/lib/resources/articles";
import { listReleaseNotes } from "@/lib/resources/queries";

export default async function WhatsNewPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string }>;
}) {
  const { tool } = await searchParams;
  const notes = await listReleaseNotes();

  // The chips offer only tools that have a note the viewer can read.
  const tools = [
    ...new Map(notes.flatMap((note) => (note.tool ? [[note.tool.key, note.tool]] : []))).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const activeTool = tools.find((entry) => entry.key === tool) ?? null;
  const shown = activeTool ? notes.filter((note) => note.tool?.key === activeTool.key) : notes;
  const groups = groupByReleaseDate(shown);

  return (
    <>
      <PageHeader
        size="page"
        back={{ href: "/resources", label: "Back to resources" }}
        title="What's new"
        description="Every change to the portal that you'd notice, in the order it shipped."
      />

      <ListToolbar
        chipsLabel="Tool"
        className="mb-6 mt-5"
        chips={[
          { label: "All", href: "/resources/whats-new", active: !activeTool },
          ...tools.map((entry) => ({
            label: entry.name,
            href: `/resources/whats-new?${new URLSearchParams({ tool: entry.key }).toString()}`,
            active: activeTool?.key === entry.key,
          })),
        ]}
      />

      {groups.length === 0 ? (
        <EmptyState>No release notes yet.</EmptyState>
      ) : (
        <div className="flex max-w-[760px] flex-col gap-7">
          {groups.map((group) => (
            <section key={group.date}>
              <SectionHeading level="eyebrow" className="mb-2.5">
                {formatReleaseDate(group.date)}
              </SectionHeading>
              <div className="flex flex-col gap-3">
                {group.notes.map((note) => (
                  <Card key={note.id} id={note.slug} className="scroll-mt-20 px-5 py-4">
                    {note.tool && <Badge variant="neutral">{note.tool.name}</Badge>}
                    <h3 className="mt-2 font-serif text-[15px] font-bold text-ink-900">
                      {note.title}
                    </h3>
                    <RichText
                      body={note.body}
                      className="mt-1.5 text-[13px] leading-relaxed text-ink-500"
                    />
                    {note.guides.length > 0 && (
                      <p className="mt-2.5 text-xs text-ink-400">
                        Guide updated:{" "}
                        {note.guides.map((guide, index) => (
                          <span key={guide.slug}>
                            {index > 0 && ", "}
                            <TextLink
                              href={`/resources/tools/${guide.toolKey}/${guide.slug}`}
                              className="px-0 text-xs font-semibold"
                            >
                              {guide.title}
                            </TextLink>
                          </span>
                        ))}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
