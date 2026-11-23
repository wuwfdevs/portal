import { defineSection, sectionFields } from '../fields'

/**
 * Artist index: every artist who has a published RadioLive show, with a search and an A to Z (hubs redesign, slice 4: the "All artists" page of the RadioLive set; there are
 * hundreds of artists, so a page of tiles is not enough). Nothing is typed in it but its heading: the artists, their pictures and their appearances are read from the shows. The list is drawn
 * by the server, so it reads without script; the search and the letters only narrow it.
 */
export const ArtistIndex = defineSection({
  slug: 'sectionArtistIndex',
  singular: 'Artist index',
  plural: 'Artist indexes',
  group: 'Collections',
  fields: sectionFields({ own: [] }),
})
