// The ten tiles in the right-hand rail of the live wuwf.org home page, read 2026-11-18 (owner-approved one-time import: "fine to import existing
// rail tiles from the live site for now"). The pictures are the 880-pixel versions the live page itself serves; they are copied into this
// site's own media library by `import-rail.ts` and are never committed. The order is the live page's.
//
// Which are sponsors and which are WUWF's own was read from where each goes and what each picture says, and is a judgement: **corporate support
// must confirm each one** before launch (a sponsor drawn as a house promotion would carry no "Sponsor message" label; the safe error is to label).
// The alt text is what the picture says, read from the picture.

export interface RailTileSource {
  kind: 'sponsor' | 'house'
  sponsor?: string
  /** A short name for the person running the import and for the picture's file name; a sponsor's name is used when this is empty. */
  name?: string
  /** The 880-pixel picture the live page serves (an NPR-hosted CDN), the address `import-rail.ts` copies from. */
  imageUrl: string
  alt: string
  href: string
  /** False holds the tile without showing it. */
  enabled: boolean
  /** Shown to the person running the import, never stored. */
  note?: string
}

const CDN = 'https://npr.brightspotcdn.com/dims4/default'
const img = (hash: string, crop: string, size: string, original: string) => `${CDN}/${hash}/2147483647/strip/true/crop/${crop}+0+0/resize/${size}!/quality/90/?url=${encodeURIComponent(`https://npr-brightspot.s3.amazonaws.com/${original}`)}`

export const RAIL_TILES: readonly RailTileSource[] = [
  {
    kind: 'sponsor',
    sponsor: 'Alphastar Wealth Management',
    imageUrl: img('c007458', '1200x1000', '880x733', '5b/17/b2f8d49447e0b5df3a2ede3940a5/alphastar2025xy.png'),
    alt: 'Alphastar Wealth Management, Emerald Coast: Your Wealth. Your Legacy. Our Priority. 850-437-3127.',
    href: 'https://alphastarwealthec.com/',
    enabled: true,
  },
  {
    kind: 'sponsor',
    sponsor: 'Emerald Coast Theatre Company',
    imageUrl: img('756c75e', '1760x1390', '880x695', 'fb/68/c1f09a6146a9953e39f69a270f20/ectholifday2026l.png'),
    alt: 'Emerald Coast Theatre Company: Million Dollar Quartet Christmas, December 3 to 20. Season 14 tickets and VIP memberships.',
    href: 'https://www.emeraldcoasttheatre.org/',
    enabled: true,
    note: 'The picture names December 3 to 20; confirm the run dates and set a last day.',
  },
  {
    kind: 'sponsor',
    sponsor: 'Santa Rosa County Tourism Development Office',
    imageUrl: img('df56a09', '1760x1390', '880x695', '4b/50/9e2083644fcb9e9f846b7932cf35/woodland-to-beaches-ad-1760x1390.png'),
    alt: 'Santa Rosa County: Beaches to Woodlands, celebrating 23 years. Experience the best of Santa Rosa County this fall, September to November.',
    href: 'https://www.getrelaxing.com/get-inspired/beaches-to-woodlands-unleashes-a-medley-of-fall-festivities/',
    enabled: true,
    note: 'The picture says "Sept. to Nov."; confirm the last day.',
  },
  {
    kind: 'sponsor',
    sponsor: 'Sinfonia Gulf Coast',
    imageUrl: img('b2d9fe9', '1760x1390', '880x695', '48/5a/ee6ab48d445e80495c17a4f320fd/levy2.jpg'),
    alt: 'Sinfonia Gulf Coast Classical Connections with Howard Levy, harmonica and piano. Saturday, Nov. 14, Destin High School.',
    href: 'https://sinfoniagulfcoast.org/',
    enabled: false,
    note: 'HELD: the picture advertises Saturday, Nov. 14, which has passed (the live page still shows it on 2026-11-18). Replace the artwork, or remove the tile.',
  },
  {
    kind: 'house',
    name: 'WUWF app',
    imageUrl: img('20801e1', '1760x1390', '880x695', '63/f4/97b431584313b1902b6b762aeb03/app-website-tile3.png'),
    alt: 'Download the new WUWF app. Download on the App Store. Get it on Google Play.',
    href: 'https://www.wuwf.org/get-our-apps',
    enabled: true,
    note: 'Goes to wuwf.org/get-our-apps; point it at the page on this site once that exists.',
  },
  {
    kind: 'house',
    name: 'FPREN weather',
    imageUrl: img('cfe75c4', '1760x1390', '880x695', 'bc/95/d2fac202424295ce6152151e14cb/1.png'),
    alt: 'Florida Public Radio Emergency Network and the Florida State Emergency Response Team: WUWF weather and storm coverage.',
    href: 'https://www.wuwf.org/weather',
    enabled: true,
    note: 'Goes to wuwf.org/weather; point it at the page on this site once that exists.',
  },
  {
    kind: 'house',
    name: 'Florida Storms app',
    imageUrl: img('4edac1b', '880x412', '880x412', 'ce/7c/8c7ae708473396fd5c76b9230d76/fsa23bc.png'),
    alt: 'Florida Storms: get the app. Live streams, maps, updates.',
    href: 'https://www.wuwf.org/florida-storms-app',
    enabled: true,
    note: 'Goes to wuwf.org/florida-storms-app; point it at the page on this site once that exists.',
  },
  {
    kind: 'house',
    name: 'Protect My Public Media',
    imageUrl: img('d06403a', '300x170', '880x499', '99/26/a20ef6584d799b3d8f81a808b25e/pmpm-300x170-v3.png'),
    alt: 'Protect My Public Media. Learn more.',
    href: 'https://protectmypublicmedia.org/',
    enabled: true,
    note: 'A 300 by 170 picture enlarged by the live site, so it is soft; ask for a larger one.',
  },
  {
    kind: 'house',
    name: 'Book Club',
    imageUrl: img('61beba3', '1760x920', '880x460', '71/21/c7a8646a426ba701242289e537b9/web-tile-bookclub.png'),
    alt: 'WUWF Book Club.',
    href: 'https://www.facebook.com/groups/wuwfpublicmediabookclub',
    enabled: true,
  },
  {
    kind: 'sponsor',
    sponsor: 'Boyles & Boyles, PLLC',
    imageUrl: img('3f2d0b1', '1764x1464', '880x730', 'd0/12/e93b79e049f493233a3d2bf71241/boylessq1.png'),
    alt: 'Boyles & Boyles, PLLC, Attorneys at Law.',
    href: 'https://boylesandboyleslaw.com/index.html',
    enabled: true,
  },
]
