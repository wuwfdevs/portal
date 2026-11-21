/**
 * Pages whose address is also a coded route that renders the page's record per request (`components/Page/SectionsRoute`): `/support/ways` and
 * `/support/thanks` read the request's query, `/listens` reads the Portal's answer with the reader's hashed address, and `/listens/host` is a shell so
 * that `/listens/<publicId>` does not take its address. The catch-all route builds a static page for every page record, so it must leave these out: a
 * prerendered copy has no request data and would be served instead of the shell (the hub then drew none of the Portal's questions, sessions or outcomes).
 *
 * `/home-blocks` is the home page built from blocks, beside the coded home page: its shell loads the sponsor tiles for the page set's slots (the home page's, and the banner's
 * hold on the top unit) and refreshes every five minutes, as `/` does.
 *
 * `shells.test.ts` fails when a route that renders a record is missing from this list.
 */
export const CODED_SHELL_PATHS: ReadonlySet<string> = new Set(['/support/ways', '/support/thanks', '/listens', '/listens/host', '/home-blocks'])
