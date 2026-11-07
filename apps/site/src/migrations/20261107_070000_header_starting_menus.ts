import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Starting values for the header (board 27): the board's five menus, News, Shows, Watch, Community and About, so the
 * header is not empty on a new or migrated site. Editors change everything in Site settings → Header.
 *
 * Only where the header has no items yet: anything an editor has entered is left alone. Every link points at a page the
 * site has: the fixed pages by their address, and a section or fellowship only where that record exists in this database
 * (a section lists its stories at /<slug>, a fellowship has its hub at /fellowships/<slug>). Nothing links to a page
 * that is not there (ROADMAP.md, Known gaps). Seeded rows carry ids starting "start-", so `down` removes exactly them.
 */

type Link = { label: string; url: string }
type Menu = { key: string; label: string; heading: string; blurb: string; links: Link[] }

const SECTIONS_IN_NEWS = ['local-news', 'local-politics', 'local-elections', 'uwf-news', 'commentary']
const SECTIONS_IN_COMMUNITY = ['local-arts', 'local-music']

async function rows<T>(db: MigrateUpArgs['db'], query: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await db.execute(query)) as { rows?: T[] }
  return result.rows ?? []
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // The header's row: a global has one, created on first save; create it if no one has saved the header yet.
  let header = (await rows<{ id: number }>(db, sql`SELECT "id" FROM "header" ORDER BY "id" LIMIT 1;`))[0]
  if (!header) {
    header = (await rows<{ id: number }>(db, sql`INSERT INTO "header" ("updated_at", "created_at") VALUES (now(), now()) RETURNING "id";`))[0]
  }
  const existing = await rows<{ n: number }>(db, sql`SELECT count(*)::int AS "n" FROM "header_nav_items" WHERE "_parent_id" = ${header.id};`)
  if ((existing[0]?.n ?? 0) > 0) return

  const sections = new Map(
    (await rows<{ slug: string; title: string }>(db, sql`SELECT "slug", "title" FROM "sections" WHERE "slug" IS NOT NULL;`)).map((s) => [s.slug, s.title]),
  )
  const sectionLinks = (slugs: string[]): Link[] =>
    slugs.flatMap((slug) => (sections.has(slug) ? [{ label: sections.get(slug)!, url: `/${slug}` }] : []))
  const fellowships = (await rows<{ slug: string; title: string }>(db, sql`SELECT "slug", "title" FROM "fellowships" WHERE "slug" IS NOT NULL ORDER BY "id";`)).map(
    (f) => ({ label: f.title, url: `/fellowships/${f.slug}` }),
  )

  const menus: Menu[] = [
    {
      key: 'news',
      label: 'News',
      heading: 'News',
      blurb: 'Reporting from Pensacola and the Gulf Coast.',
      links: [...sectionLinks(SECTIONS_IN_NEWS), ...fellowships, { label: 'The Voyager (student newsroom)', url: '/voyager' }],
    },
    {
      key: 'shows',
      label: 'Shows',
      heading: 'Shows and podcasts',
      blurb: 'Everything WUWF makes, on the radio and on demand.',
      links: [
        { label: 'All podcasts', url: '/podcasts' },
        { label: 'Unearthing Florida', url: '/unearthing-florida' },
        { label: 'RadioLive', url: '/radiolive' },
        { label: 'Listen live and schedule', url: '/listen' },
      ],
    },
    {
      key: 'watch',
      label: 'Watch',
      heading: 'Watch',
      blurb: 'Short video from the newsroom.',
      links: [{ label: 'Latest videos', url: '/video' }],
    },
    {
      key: 'community',
      label: 'Community',
      heading: 'Community',
      blurb: 'What is happening here, and how to take part.',
      links: [
        { label: 'Community calendar', url: '/community-calendar' },
        { label: 'Submit an event', url: '/community-calendar-event-submission' },
        ...sectionLinks(SECTIONS_IN_COMMUNITY),
      ],
    },
    {
      key: 'about',
      label: 'About',
      heading: 'About WUWF',
      blurb: 'Who we are and how to support the station.',
      links: [{ label: 'Support WUWF', url: '/support' }],
    },
  ]

  for (const [i, menu] of menus.entries()) {
    if (menu.links.length === 0) continue
    const itemId = `start-menu-${menu.key}`
    await db.execute(sql`
      INSERT INTO "header_nav_items" ("_order", "_parent_id", "id", "kind", "label", "heading", "blurb", "link_type")
      VALUES (${i + 1}, ${header.id}, ${itemId}, 'menu', ${menu.label}, ${menu.heading}, ${menu.blurb}, 'reference')
      ON CONFLICT ("id") DO NOTHING;`)
    for (const [j, link] of menu.links.entries()) {
      await db.execute(sql`
        INSERT INTO "header_nav_items_links" ("_order", "_parent_id", "id", "link_type", "link_new_tab", "link_url", "link_label")
        VALUES (${j + 1}, ${itemId}, ${`start-link-${menu.key}-${j + 1}`}, 'custom', false, ${link.url}, ${link.label})
        ON CONFLICT ("id") DO NOTHING;`)
    }
  }
}

/** Removes the starting menus this added (and their links, by cascade), whatever editors did to other items. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DELETE FROM "header_nav_items" WHERE "id" LIKE 'start-menu-%';`)
}
