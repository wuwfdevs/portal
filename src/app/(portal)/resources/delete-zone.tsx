import Link from "next/link";
import { Button } from "@/components/ui/button";
import { deleteArticle } from "./actions";

/**
 * The edit page's "Danger zone": a link opens a confirm step (`?confirm=
 * delete`, URL state like the rest of the portal), and only the confirm
 * button deletes. Deleting removes the article, its history, and its own
 * uploaded screenshots; it can't be undone.
 */
export function DeleteZone({
  articleId,
  kindLabel,
  editPath,
  confirming,
}: {
  articleId: string;
  kindLabel: string;
  editPath: string;
  confirming: boolean;
}) {
  return (
    <section className="mt-10 max-w-3xl rounded border border-danger/30 p-5">
      <h2 className="text-sm font-bold text-ink-900">Danger zone</h2>
      {confirming ? (
        <form action={deleteArticle} className="mt-2 flex flex-col gap-3">
          <input type="hidden" name="id" value={articleId} />
          <input type="hidden" name="return_to" value={editPath} />
          <p className="text-sm text-ink-700">
            Delete this {kindLabel}, its history, and the screenshots uploaded to it? This
            can&apos;t be undone.
          </p>
          <div className="flex items-center gap-3">
            <Button type="submit" className="bg-danger text-white hover:bg-danger/90">
              Delete {kindLabel}
            </Button>
            <Link href={editPath} className="text-xs font-semibold text-ink-500 hover:underline">
              Keep it
            </Link>
          </div>
        </form>
      ) : (
        <p className="mt-2 text-sm text-ink-500">
          <Link
            href={`${editPath}?confirm=delete#danger`}
            className="font-semibold text-danger hover:underline"
          >
            Delete this {kindLabel}…
          </Link>
        </p>
      )}
    </section>
  );
}
