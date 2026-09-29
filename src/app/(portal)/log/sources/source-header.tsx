import Link from "next/link";

/** The top of a source's own page: the way back to the Sources overview, and the source's name. */
export function SourceHeader({ title }: { title: string }) {
  return (
    <div className="mb-4">
      <Link href="/log/sources" className="text-xs font-semibold text-brand-link">
        ← Sources
      </Link>
      <h2 className="mt-1.5 font-serif text-xl font-bold text-ink-900">{title}</h2>
    </div>
  );
}
