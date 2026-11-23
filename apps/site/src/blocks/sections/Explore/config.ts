import { defineSection, sectionFields } from '../fields'

/**
 * Explore (hubs redesign, 2026-11-23; PAGE-BLOCKS.md phase 6): one object that lets a reader find a show's episodes by place and by time. A clustered map of the show's sites, a docked
 * time window (two handles on a scale that changes grain at 1000 BCE and 1500, with a histogram of the episodes) and a list of the sites, searchable. The window filters the sites and
 * each site's episodes ("2 of 9 episodes fall in 1513 – 1821"); the map's view filters the list.
 *
 * It has no fields of its own beyond the band's: the sites are records (`sites`, with a latitude and longitude) and the episodes are the page's show's, so nothing is typed here and nothing is
 * uploaded. It reads the show the page speaks for (`pages.show`), so it draws nothing on a page that names none, and only the Unearthing Florida set offers it. The map draws no basemap unless the
 * station has set one (`MAP_STYLE_URL`): without one, no request goes to a map provider on a reader's behalf, and Florida is its own outline, served from this site.
 */
export const Explore = defineSection({
  slug: 'sectionExplore',
  singular: 'Explore',
  plural: 'Explores',
  group: 'Collections',
  fields: sectionFields({ own: [] }),
})
