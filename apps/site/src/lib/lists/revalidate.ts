import type { Payload } from 'payload'

import { listHref } from './route'

type Ref = { id: string | number } | string | number | null | undefined
const idOf = (r: Ref): string | number | null => (r == null ? null : typeof r === 'object' ? r.id : r)

interface StoryRefs {
  section?: Ref
  categories?: Ref[] | null
  contributors?: Ref[] | null
  production?: Ref
}

/**
 * The first page of every list a story appears in: its section, each topic, each person. Publishing, changing or removing the
 * story changes what readers see on page one; deeper pages catch up on their own schedule. Never throws (a failed lookup must
 * not fail the save that triggered it).
 */
export async function listPathsForStory(payload: Payload, story: StoryRefs | null | undefined): Promise<string[]> {
  if (!story) return []
  try {
    const sectionId = idOf(story.section)
    const topicIds = (story.categories ?? []).map(idOf).filter((v): v is string | number => v !== null)
    const personIds = (story.contributors ?? []).map(idOf).filter((v): v is string | number => v !== null)
    const slugs = async (collection: 'categories' | 'contributors' | 'sections', ids: (string | number)[]): Promise<string[]> => {
      if (ids.length === 0) return []
      const found = await payload.find({ collection, where: { id: { in: ids } }, depth: 0, limit: ids.length, overrideAccess: true, pagination: false, select: { slug: true } })
      return found.docs.map((d) => d.slug).filter((s): s is string => typeof s === 'string')
    }
    const productionId = idOf(story.production)
    const showPaths = productionId === null ? [] : (await payload.find({ collection: 'productions', where: { id: { equals: productionId } }, depth: 0, limit: 1, overrideAccess: true, pagination: false, select: { path: true } })).docs.map((d) => d.path).filter((p): p is string => typeof p === 'string')
    const [sections, topics, people] = await Promise.all([slugs('sections', sectionId === null ? [] : [sectionId]), slugs('categories', topicIds), slugs('contributors', personIds)])
    return [...sections.map((s) => listHref('section', s)), ...topics.map((s) => listHref('topic', s)), ...people.map((s) => listHref('person', s)), ...showPaths, ...(productionId === null ? [] : ['/podcasts'])]
  } catch {
    return []
  }
}
