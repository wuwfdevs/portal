// What the Voyager's pages derive from the old hub's staff list. Pure, so the rule is tested without a database. (The hub's other helpers, the "Latest" rail, the byline line and the
// masthead date, went with the coded hub: the pages are sections now, and the nameplate is dropped.)

/** A staff member's role line: the role set for this term, else their own title, else nothing. Used once, by the migration that copied the staff into the page's roster. */
export const staffRole = (role: string | null | undefined, title: string | null | undefined): string => role?.trim() || title?.trim() || ''
