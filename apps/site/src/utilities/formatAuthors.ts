/**
 * Formats a byline (contributors that carry a name) into a prettified string.
 * @param authors - The populated contributors of a Post.
 * @returns A prettified string of authors.
 * @example
 *
 * [Author1, Author2] becomes 'Author1 and Author2'
 * [Author1, Author2, Author3] becomes 'Author1, Author2, and Author3'
 *
 */
export const formatAuthors = (authors: { name?: string | null }[]) => {
  // Ensure we don't have any authors without a name
  const authorNames = authors.map((author) => author.name).filter((n): n is string => Boolean(n))

  if (authorNames.length === 0) return ''
  if (authorNames.length === 1) return authorNames[0]
  if (authorNames.length === 2) return `${authorNames[0]} and ${authorNames[1]}`

  return `${authorNames.slice(0, -1).join(', ')} and ${authorNames[authorNames.length - 1]}`
}
