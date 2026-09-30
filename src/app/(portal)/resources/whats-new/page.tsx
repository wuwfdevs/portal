import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
      <Link href="/resources" className="mb-5 inline-block text-xs font-semibold text-brand-link">
        ← Back to resources
      </Link>
      <h1 className="font-serif text-2xl font-bold text-ink-900">What&apos;s new</h1>
      <p className="mt-1 text-xs text-ink-400">
        Every change to the portal that you&apos;d notice, in the order it shipped.
      </p>

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
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No release notes yet.
        </div>
      ) : (
        <div className="flex max-w-[760px] flex-col gap-7">
          {groups.map((group) => (
            <section key={group.date}>
              <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
                {formatReleaseDate(group.date)}
              </h2>
              <div className="flex flex-col gap-3">
                {group.notes.map((note) => (
                  <article
                    key={note.id}
                    id={note.slug}
                    className="scroll-mt-20 rounded border border-line bg-white px-5 py-4"
                  >
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
                            <Link
                              href={`/resources/tools/${guide.toolKey}/${guide.slug}`}
                              className="font-semibold text-brand-link"
                            >
                              {guide.title}
                            </Link>
                          </span>
                        ))}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
