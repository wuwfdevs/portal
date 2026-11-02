import type { Payload } from 'payload'

/** A section for tests that publish stories (a story needs a section, or a path, to be published). Created once. */
export async function ensureTestSection(payload: Payload): Promise<number | string> {
  const found = await payload.find({ collection: 'sections', where: { slug: { equals: 'tests' } }, limit: 1, depth: 0, overrideAccess: true })
  if (found.docs[0]) return found.docs[0].id
  const created = await payload.create({ collection: 'sections', data: { title: 'Tests' } as never, overrideAccess: true })
  return created.id
}
