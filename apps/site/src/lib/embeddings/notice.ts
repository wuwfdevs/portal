/**
 * The privacy wording for story embeddings, kept beside the behaviour it describes so the two change together (a sentence here that no
 * longer matches `search.ts` and `embedStory.ts` would be a false privacy notice). Pure: no Payload, no React.
 *
 * Two pieces of wording:
 * - `SEARCH_NOTICE`: one line on the search page, shown only while search by meaning is actually switched on (the key and the Site
 *   settings switch; `semanticSearchAllowed`). With it off, nothing leaves the site and nothing is said.
 * - `PRIVACY_PAGE_PARAGRAPHS`: the paragraphs for the site's privacy notice page (a Page edited in the admin). The "Find stories by meaning
 *   in search" switch must stay off until this is on that page (the switch's own description says so).
 *
 * What the wording promises is what the code does:
 * - Search words: sent from our server (never the browser, so no cookie, account or address of the visitor goes with them) as the input
 *   of one embedding request, cut at `MAX_QUERY_CHARS`. Never logged, stored or put in analytics; held only as a vector in the server's
 *   memory for an hour so a repeated search is not sent again.
 * - Stories: WUWF's own published stories only (title, dek, description and body), never an NPR or wire story; a members-only story from
 *   its title, dek and description only.
 */

export const SEARCH_NOTICE =
  'To find stories about the same topic in different words, the words you search for are sent to OpenAI, which turns them into numbers we compare with our stories. Nothing that identifies you goes with them, and we do not keep them.'

export const PRIVACY_PAGE_HEADING = 'Search and related stories'

export const PRIVACY_PAGE_PARAGRAPHS: readonly string[] = [
  'WUWF.org can find stories by meaning, not only by exact words. To do this we use OpenAI, a service provider, in two ways.',
  'When you search, the words you type are sent from our server to OpenAI, which returns a list of numbers that stands for their meaning. We compare those numbers with the same kind of numbers for our stories to find stories on a similar topic. Only the search words are sent. Your name, account, address and browser details are not, and we do not log, store or analyze what you searched for. The numbers for a search are kept in our server’s memory for up to an hour so that a repeated search is not sent again, then discarded.',
  'To do the same for each story, we send the text of stories that WUWF itself has published to OpenAI once, when the story is published or changed. Stories we receive from NPR or other news services are never sent. For a story that is for members only, we send only its headline and summary, never its text. The numbers that come back are stored in our database, and they are what produces the “Related stories” on a story page.',
  'OpenAI handles what we send under its own terms for business customers of its API.',
]
