import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireResourcesAccess } from "@/lib/resources/access";
import { embedPendingArticles } from "@/lib/resources/embeddings";

export default async function ResourcesLayout({ children }: { children: React.ReactNode }) {
  const { isEditor } = await requireResourcesAccess();
  if (isEditor) {
    // Only an editor's session can write embeddings, so an editor opening
    // Resources is when articles a release migration inserted (and anything
    // else stale) get embedded for semantic search. After the response,
    // best-effort; a no-op when nothing is stale. The client is created
    // here, not inside the callback, where request cookies aren't readable.
    const supabase = await createClient();
    after(() => embedPendingArticles(supabase));
  }
  return <div className="px-6 py-7 sm:px-8 sm:pb-12">{children}</div>;
}
