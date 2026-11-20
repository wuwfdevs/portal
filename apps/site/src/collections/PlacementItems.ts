import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { APIError } from 'payload'

import { requireAnyPermission, userCan } from '@/access/permissions'
import { STILL_IMAGE_MESSAGE, STILL_IMAGE_TYPES, isStillPicture } from '@/lib/placements/media'
import { describeDates, exclusiveConflicts, type BookedPlacement } from '@/lib/placements/conflicts'
import { stationDay } from '@/lib/placements/pick'
import { describeTarget, stillRunning, type PlacementRecord } from '@/lib/placements/resolve'
import { artworkSize, BUILT_ZONES, isZoneId, TILE_ALT_MAX, ZONES } from '@/lib/placements/registry'
import { revalidatePath, revalidateTag } from '@/lib/revalidate'
import { validateSupportHref } from '@/lib/support-link'

/**
 * A placement: one message in one zone, made and changed by editors with no deploy. A ZONE is a fixed place in a page's layout, a developer's
 * job (`lib/placements/registry.ts`); everything about what runs there is here: who it is for, the picture, where it goes, when it runs and,
 * in a zone on the list pages, which sections, topics or reporters it appears on. `lib/placements/resolve.ts` decides what runs on a page.
 *
 * This is the interim source for what is delivered, the way underwriting agreements are for acknowledgments. It records no sale: the site
 * knows nothing of packages, prices or billing, and nothing here proves delivery. When the Portal holds the deal, its bookings arrive behind
 * the same zones and this collection becomes the house promotions and the manual override.
 */

const canSellSponsors = (user: unknown): boolean => userCan(user as never, 'sponsorship.manage')

/** Corporate support (and administrators) may change anything; publishers, who run the home page, may change house promotions only. */
const ownedBy = ({ req }: { req: { user?: unknown } }) => (canSellSponsors(req.user) ? true : userCan(req.user as never, 'content.publish') ? { kind: { equals: 'house' } } : false)

const checkKind: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const becomingSponsor = data?.kind === 'sponsor' || (data?.kind === undefined && originalDoc?.kind === 'sponsor')
  // Judged for signed-in staff only. A signed-out visitor is already refused by the access rules above, and trusted server code (the import, a
  // migration, a test) acts with no user and must not be blocked by a rule about who a person is.
  if (req.user && becomingSponsor && !canSellSponsors(req.user)) {
    throw new APIError('Only corporate support can make or change a sponsor placement. You can make house promotions.', 403, undefined, true)
  }
  return data
}

/**
 * A zone on one page (the home page's rail and banner) holds a fixed number; a second placement past it would be silently dropped from the page,
 * so it is refused here, with what to do. A zone on the list pages is counted per page by the resolver, which keeps the first in order, because
 * different placements aim at different pages and may overlap on some.
 */
const checkCapacity: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  // A field the save leaves out keeps its stored value; one it sets to null (a last day cleared) is null. `??` would treat both as missing and bring
  // back the old value, so a placement whose last day had passed and was cleared would skip this check and run past the zone's capacity.
  const given = <K extends 'zone' | 'enabled' | 'runUntil' | 'fillsGaps'>(key: K) => (data && key in data && data[key] !== undefined ? data[key] : originalDoc?.[key])
  const zoneId = given('zone')
  const enabled = given('enabled')
  // A promotion that only completes the foot row is held apart from the zone's tiles and takes no place from a sponsor.
  if (given('fillsGaps') === true) return data
  // An exclusive place (a top unit) is booked by dates, not by count: next week's sponsor must be bookable while this week's runs (`checkExclusive`).
  if (!isZoneId(zoneId) || ZONES[zoneId].targetable || ZONES[zoneId].exclusive || enabled === false) return data
  if (!stillRunning({ enabled, runUntil: given('runUntil') }, new Date())) return data
  const others = await req.payload.find({
    collection: 'placement-items',
    where: {
      and: [
        { zone: { equals: zoneId } },
        { enabled: { equals: true } },
        { or: [{ fillsGaps: { equals: false } }, { fillsGaps: { exists: false } }] },
        ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
      ],
    },
    depth: 0,
    limit: 100,
    pagination: false,
    overrideAccess: true,
    select: { runUntil: true, enabled: true },
    req,
  })
  const running = others.docs.filter((o) => stillRunning(o, new Date())).length
  const { capacity, name } = ZONES[zoneId]
  if (running >= capacity) {
    throw new APIError(`${name} holds ${capacity}, and ${running === 1 ? 'one is' : `${running} are`} already running. Switch one off, set its last day, or delete it first.`, 400, undefined, true)
  }
  return data
}

/**
 * An exclusive place (a top unit) belongs to one sponsor at a time: a second placement whose dates overlap one already booked in the same place, for the same page,
 * is refused here and the clash is named. (`lib/placements/conflicts.ts` holds the rule.) The home page's rail and the list pages' rail are not exclusive: they have a
 * capacity, checked above and by the resolver.
 */
const checkExclusive: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const given = (key: string) => (data && key in data && data[key] !== undefined ? data[key] : originalDoc?.[key])
  const zoneId = given('zone')
  if (!isZoneId(zoneId) || !ZONES[zoneId].exclusive) return data
  const candidate: BookedPlacement = {
    id: originalDoc?.id,
    zone: zoneId,
    enabled: given('enabled') as boolean | undefined,
    runFrom: given('runFrom') as string | null | undefined,
    runUntil: given('runUntil') as string | null | undefined,
    scope: given('scope') as 'all' | 'chosen' | null | undefined,
    sections: given('sections') as BookedPlacement['sections'],
    topics: given('topics') as BookedPlacement['topics'],
    people: given('people') as BookedPlacement['people'],
    includeLatest: given('includeLatest') as boolean | undefined,
  }
  const found = await req.payload.find({
    collection: 'placement-items',
    where: { and: [{ zone: { equals: zoneId } }, { enabled: { equals: true } }] },
    depth: 0,
    limit: 200,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const clashes = exclusiveConflicts(candidate, found.docs as unknown as BookedPlacement[], stationDay(new Date()))
  if (clashes.length > 0) {
    const named = clashes.map((c) => `"${c.name ?? 'another placement'}" (${describeDates(c)})`).join(', ')
    throw new APIError(`${ZONES[zoneId].name} belongs to one sponsor at a time, and ${named} already holds it for dates that overlap. Change the dates, aim this at a different page, or switch the other one off.`, 400, undefined, true)
  }
  return data
}

/**
 * "Can fill a gap" means something only for a WUWF promotion in the home page rail, and the box is hidden for anything else, so a value left over from
 * before (a promotion the editor then made a sponsor placement, or moved to another zone) is cleared here rather than refused for a field the editor
 * cannot see. The resolver ignores it for anything else as well (`isFiller`); this keeps the record honest.
 */
const clearFillerFlag: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const given = (key: 'kind' | 'zone') => (data && key in data && data[key] !== undefined ? data[key] : originalDoc?.[key])
  if (data?.fillsGaps === true && !(given('kind') === 'house' && given('zone') === 'home.rail')) return { ...data, fillsGaps: false }
  if (data && !('fillsGaps' in data) && originalDoc?.fillsGaps === true && !(given('kind') === 'house' && given('zone') === 'home.rail')) return { ...data, fillsGaps: false }
  return data
}

const refresh = (req: { context: Record<string, unknown> }) => {
  if (req.context.disableRevalidate) return
  // Every page that reads placements reads them through this tag; the home page is also asked directly so an editor sees a change at once.
  revalidateTag('placements', 'max')
  revalidatePath('/')
}
const afterChange: CollectionAfterChangeHook = ({ doc, req }) => {
  refresh(req)
  return doc
}
const afterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  refresh(req)
  return doc
}


/** A placement's picture must be a still image: checked here, when it is saved, because the library takes video and animated pictures too. */
const stillPicture = async (value: unknown, { req }: { req: { payload: { findByID: (a: never) => Promise<unknown> } } }): Promise<true | string> => {
  if (value == null || value === '') return true
  const id = typeof value === 'object' ? (value as { id?: string | number }).id : value
  if (id == null) return true
  try {
    const media = (await req.payload.findByID({ collection: 'media', id, depth: 0, overrideAccess: true, select: { mimeType: true } } as never)) as { mimeType?: string | null }
    return isStillPicture(media) ? true : STILL_IMAGE_MESSAGE
  } catch {
    return 'That picture could not be read. Choose another.'
  }
}
const onlyStill = { mimeType: { in: [...STILL_IMAGE_TYPES] } }

const zoneOf = (_: unknown, siblingData: { zone?: string } | undefined) => (isZoneId(siblingData?.zone) ? ZONES[siblingData.zone] : null)
const inZone = (test: (z: (typeof ZONES)[keyof typeof ZONES]) => boolean) => (_: unknown, s: { zone?: string } | undefined) => {
  const z = zoneOf(_, s)
  return z ? test(z) : false
}

export const PlacementItems: CollectionConfig = {
  slug: 'placement-items',
  labels: { singular: 'Placement', plural: 'Placements' },
  access: {
    // The public reads only what is switched on (the pages draw only what runs today); staff read everything, to find what is held or ended.
    read: ({ req }) => (req.user ? true : { enabled: { equals: true } }),
    create: requireAnyPermission('sponsorship.manage', 'content.publish'),
    update: ownedBy,
    delete: ownedBy,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'kind', 'where', 'enabled', 'runUntil', 'order'],
    listSearchableFields: ['name'],
    description: 'Sponsor messages and WUWF promotions, each in a fixed place on the site. Make, change, aim and retire them here: no deploy needed.',
  },
  hooks: { beforeChange: [checkKind, clearFillerFlag, checkCapacity, checkExclusive], afterChange: [afterChange], afterDelete: [afterDelete] },
  defaultSort: 'order',
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 120, admin: { description: 'For staff only, to find it again, e.g. "Alphastar: home rail, December".' } },
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'house',
          options: [
            { label: 'Sponsor (shown with "Sponsor message")', value: 'sponsor' },
            { label: 'House promotion (WUWF\'s own; no label)', value: 'house' },
          ],
          admin: { width: '45%', description: 'Anything paid or sponsored is a Sponsor. Choose House promotion only for WUWF\'s own pages, apps and campaigns.' },
        },
        {
          name: 'sponsor',
          type: 'relationship',
          relationTo: 'sponsors',
          admin: { width: '55%', condition: (_, s) => s?.kind === 'sponsor', description: 'Who it is for. Add them under Commercial → Sponsors first if they are not listed.' },
          validate: (value: unknown, { siblingData }: { siblingData?: { kind?: string } }) => (siblingData?.kind === 'sponsor' && !value ? 'Choose the sponsor, or choose House promotion.' : true),
        },
      ],
    },
    {
      name: 'zone',
      type: 'select',
      required: true,
      options: BUILT_ZONES.map((z) => ({ label: z.name, value: z.id })),
      admin: { description: 'The place on the site. Each place has a fixed shape and holds a fixed number; those that can be aimed at particular pages offer the choice below.' },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      filterOptions: onlyStill,
      validate: stillPicture as never,
      admin: { description: `The artwork. A rail tile is ${artworkSize(ZONES['home.rail'].artwork)}; a banner is ${artworkSize(ZONES['home.band'].artwork)}; a top unit is ${artworkSize(ZONES['home.top'].artwork)}. The words in the picture are read by people who cannot see it, so say what it says below.` },
    },
    {
      name: 'phoneImage',
      type: 'upload',
      relationTo: 'media',
      label: 'Picture for phones',
      filterOptions: onlyStill,
      validate: stillPicture as never,
      admin: { condition: inZone((z) => z.shape === 'band'), description: `Optional, ${artworkSize(ZONES['home.band'].phoneArtwork ?? ZONES['home.band'].artwork)} (a top unit: ${artworkSize(ZONES['home.top'].phoneArtwork ?? ZONES['home.top'].artwork)}). Without it, phones get the wide picture, scaled down.` },
    },
    { name: 'alt', type: 'text', required: true, maxLength: TILE_ALT_MAX, label: 'What the picture says', admin: { description: 'Read aloud for the link, e.g. "Emerald Coast Theatre: tickets for the winter season".' } },
    {
      name: 'href',
      type: 'text',
      required: true,
      label: 'Where it goes',
      validate: (value: string | null | undefined) => (!value?.trim() ? 'Enter where it goes.' : validateSupportHref(value)),
      admin: { description: 'A page on this site (/weather) or a secure https:// address. Sponsor links are marked as sponsored and send no referrer.' },
    },
    {
      type: 'collapsible',
      label: 'Which pages it appears on',
      admin: { initCollapsed: false, condition: inZone((z) => z.targetable) },
      fields: [
        {
          name: 'scope',
          type: 'select',
          defaultValue: 'chosen',
          options: [
            { label: 'Only the pages chosen below', value: 'chosen' },
            { label: 'Every section, topic, reporter and the all-stories page', value: 'all' },
          ],
          admin: { description: 'A placement never shows everywhere unless you say so.' },
          validate: (
            value: string | null | undefined,
            { siblingData }: { siblingData?: { zone?: string; sections?: unknown[]; topics?: unknown[]; people?: unknown[]; includeLatest?: boolean } },
          ) => {
            const z = isZoneId(siblingData?.zone) ? ZONES[siblingData.zone] : null
            if (!z?.targetable || value === 'all') return true
            const chosen = (siblingData?.sections?.length ?? 0) + (siblingData?.topics?.length ?? 0) + (siblingData?.people?.length ?? 0) + (siblingData?.includeLatest ? 1 : 0)
            return chosen > 0 ? true : 'Choose at least one section, topic, reporter or the all-stories page, or choose every page.'
          },
        },
        { name: 'sections', type: 'relationship', relationTo: 'sections', hasMany: true, admin: { condition: (_, s) => s?.scope !== 'all', description: 'Appears on each of these sections\' pages (Local News, Music & Arts...).' } },
        { name: 'topics', type: 'relationship', relationTo: 'categories', hasMany: true, admin: { condition: (_, s) => s?.scope !== 'all', description: 'Appears on each of these topics\' pages.' } },
        { name: 'people', type: 'relationship', relationTo: 'contributors', hasMany: true, label: 'Reporters', admin: { condition: (_, s) => s?.scope !== 'all', description: 'Appears on each of these reporters\' pages.' } },
        { name: 'includeLatest', type: 'checkbox', defaultValue: false, label: 'The all-stories page', admin: { condition: (_, s) => s?.scope !== 'all', description: 'Also appears on /latest, the list of every story.' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'order', type: 'number', defaultValue: 100, min: 0, admin: { width: '25%', description: 'Lower runs first when a place holds several. Ties go to the one made first.' } },
        { name: 'runFrom', type: 'date', label: 'First day', admin: { width: '25%', date: { pickerAppearance: 'dayOnly' }, description: 'Empty: already running.' } },
        { name: 'runUntil', type: 'date', label: 'Last day', admin: { width: '25%', date: { pickerAppearance: 'dayOnly' }, description: 'Empty: runs until switched off. The whole of this day counts.' } },
        { name: 'enabled', type: 'checkbox', defaultValue: true, label: 'Show', admin: { width: '25%', description: 'Switch off to hold it without deleting it.' } },
      ],
    },
    {
      name: 'fillsGaps',
      type: 'checkbox',
      defaultValue: false,
      label: 'Can fill a gap',
      admin: {
        condition: (_, s) => s?.kind === 'house' && s?.zone === 'home.rail',
        description:
          'Optional. On the home page every sponsor tile that is running always shows. The tiles sit in rows of three between the news sections. When the last row is short, WUWF promotions marked here complete it (up to two), so no row is left half empty. They never take a place from a sponsor and do not count toward the rail\'s capacity. With none marked, the short row\'s tiles are centered instead.',
      },
    },
    {
      name: 'where',
      type: 'text',
      virtual: true,
      admin: { readOnly: true, position: 'sidebar', description: 'Where this runs, in short.' },
      hooks: { afterRead: [({ siblingData }) => describeTarget(siblingData as PlacementRecord<unknown>)] },
    },
  ],
}
