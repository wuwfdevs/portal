import { BeforeSync, DocToSync } from '@payloadcms/plugin-search/types'

import { postKind, productionKind } from '@/lib/search/query'

/** The search document's kind, address and description, which each collection keeps in different fields. */
type Source = {
  slug?: string | null
  path?: string | null
  description?: string | null
  summary?: string | null
  tagline?: string | null
  kind?: string | null
  format?: string | null
  production?: unknown
  meta?: { description?: string | null } | null
}

function describe(collection: string, doc: Source) {
  if (collection === 'clips') {
    return { kind: 'video', path: doc.slug ? `/video/${doc.slug}` : undefined, description: doc.description ?? undefined }
  }
  if (collection === 'productions') {
    return { kind: productionKind(doc), path: doc.path, description: doc.meta?.description || doc.summary || doc.tagline || undefined }
  }
  return { kind: postKind(doc), path: doc.path, description: doc.meta?.description || undefined }
}

export const beforeSyncWithSearch: BeforeSync = async ({ req, originalDoc, searchDoc }) => {
  const {
    doc: { relationTo: collection },
  } = searchDoc

  const { slug, id, categories, title, meta, publishedAt } = originalDoc
  const { kind, path, description } = describe(collection, originalDoc)

  const modifiedDoc: DocToSync = {
    ...searchDoc,
    slug,
    path,
    kind,
    publishedAt: publishedAt ?? null,
    meta: {
      ...meta,
      title: meta?.title || title,
      image: meta?.image?.id || meta?.image,
      description,
    },
    categories: [],
  }

  if (categories && Array.isArray(categories) && categories.length > 0) {
    const populatedCategories: { id: string | number; title: string }[] = []
    for (const category of categories) {
      if (!category) {
        continue
      }

      if (typeof category === 'object') {
        populatedCategories.push(category)
        continue
      }

      const doc = await req.payload.findByID({
        collection: 'categories',
        id: category,
        disableErrors: true,
        depth: 0,
        select: { title: true },
        req,
      })

      if (doc !== null) {
        populatedCategories.push(doc)
      } else {
        console.error(
          `Failed. Category not found when syncing collection '${collection}' with id: '${id}' to search.`,
        )
      }
    }

    modifiedDoc.categories = populatedCategories.map((each) => ({
      relationTo: 'categories',
      categoryID: String(each.id),
      title: each.title,
    }))
  }

  return modifiedDoc
}
