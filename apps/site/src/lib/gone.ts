// "Gone": an address that used to be on wuwf.org and will not come back, answered 410 rather than 404.
//
// The rule (owner, 2026-11-04): a bare `/YYYY-MM-DD/slug` was a wire or NPR story Grove carried and WUWF does not keep. Nothing on this
// site owns it, so it answers 410 Gone with a plain page, never a 200 landing page (that would be a soft 404). A *record* at such an
// address (a wire story chosen for publication) wins, so the proxy asks `/api/gone-check` first and only answers 410 when nothing owns the address.
// Pure: no framework, no database.

/** A bare wire address: a date, then one segment. Section stories have a section first and never match. */
const BARE_WIRE = /^\/\d{4}-\d{2}-\d{2}\/[^/]+\/?$/

/** Addresses Grove listed that never had a page (a dead entry in its own sitemap). */
const DEAD_ADDRESSES: ReadonlySet<string> = new Set(['/show/14-59'])

/** True when this address may be gone: the proxy checks it against the records before answering 410. */
export function isGoneCandidate(pathname: string): boolean {
  return BARE_WIRE.test(pathname) || DEAD_ADDRESSES.has(pathname.replace(/\/$/, ''))
}

/** The address without a trailing slash, as records store it. */
export const recordPathOf = (pathname: string): string => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname)

/** The body of a 410 response: plain, no scripts, no tracking, a way back. */
export const GONE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>No longer on wuwf.org</title>
<style>body{font:18px/1.5 system-ui,sans-serif;max-width:36rem;margin:0 auto;padding:4rem 1rem;color:#111;background:#fff}a{color:#0b4f9c}@media (prefers-color-scheme:dark){body{color:#eee;background:#111}a{color:#8ab8ff}}</style>
</head>
<body>
<main>
<h1>This page is no longer on wuwf.org</h1>
<p>It was a story from another news organization, and WUWF no longer carries it. Try the original publisher, or look for local reporting here.</p>
<p><a href="/">WUWF home</a> · <a href="/search">Search</a></p>
</main>
</body>
</html>
`
