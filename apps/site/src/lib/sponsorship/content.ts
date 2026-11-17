// Fixed copy and figures for the sponsorship pages (boards 16 to 20b) that are not prices and not audience tables.
// Everything here is the reviewed board's wording. Pure data.

export const CORPORATE_SUPPORT = {
  phoneDisplay: '850 473-7453',
  phoneHref: 'tel:+18504737453',
  address: '11000 University Parkway, Building 88, Pensacola, FL 32514',
  /** Printed at the foot of every sponsorship page. */
  serviceLine: 'WUWF Public Media is a service of the University of West Florida.',
} as const

export const SPONSOR_PATHS = {
  hub: '/sponsor',
  onAir: '/sponsor/on-air',
  digital: '/sponsor/digital',
  events: '/sponsor/events',
  audience: '/sponsor/audience',
  guidelines: '/sponsor/credit-guidelines',
} as const

export const INQUIRE_HREF = `${SPONSOR_PATHS.hub}#inquire`

export type PageStat = { value: string; text: string; compare?: string }

export const HERO_STATS: readonly PageStat[] = [
  { value: '22,500', text: 'people listen to WUWF in a typical week' },
  { value: '79%', text: 'hold a more positive opinion of sponsors that support NPR' },
  { value: '77%', text: 'prefer to buy from NPR sponsors' },
  { value: '66%', text: 'find the businesses they hear on public radio more credible than ads elsewhere' },
]

export const HERO_SOURCE =
  '22,500: Nielsen Audio, Pensacola metro, ages 12+, Spring 2026. Other figures: NPR radio listeners nationally, Kantar, NPR State of Sponsorship Survey, July 2026.'

export const NOT_AN_AD: readonly { heading: string; text: string }[] = [
  { heading: 'Plain by design', text: 'No prices, no claims to be the best and no calls to buy. Credits follow NPR’s sponsor recognition guidelines, so listeners hear a thank-you, not a pitch.' },
  { heading: 'Heard with attention', text: '74% of NPR listeners say they pay attention to the sponsorship announcements they hear. Only 51% of non-listeners say that about the ads on the commercial news brands they use.' },
  { heading: 'Loyal in return', text: '91% of small-county NPR News listeners stick with a brand once they like it, and 54% are more likely to buy from brands that support a cause they care about.' },
]

export const NOT_AN_AD_SOURCE =
  'Advertising and brand-loyalty figures: Source: MRI-Simmons Doublebase Fall 2025, among custom NPR News audience in C and D counties (fewer than 85,000 households). Base: total U.S. adults in C and D counties. NPR Small Markets Profile 2026. Attention: Kantar, July 2026.'

export const WHY_IT_WORKS: readonly { value: string; text: string; compare: string }[] = [
  { value: '79%', text: 'of NPR listeners think more highly of a business that supports public radio', compare: '43% of non-listeners say the same of commercial news brands' },
  { value: '77%', text: 'prefer to buy from companies that support public radio when price and quality are equal', compare: '45% of non-listeners' },
  { value: '76%', text: 'agree public radio is selective about who can sponsor it, so your name keeps good company', compare: '47% of non-listeners' },
  { value: '74%', text: 'pay attention to the sponsorship announcements they hear', compare: '51% of non-listeners' },
  { value: '66%', text: 'find the businesses they hear on public radio more credible than ads elsewhere', compare: '48% of non-listeners' },
  { value: '84%', text: 'have taken an action because of a sponsorship announcement', compare: 'Most often visiting a sponsor’s website (34%) or considering a new product or service (30%)' },
]

export const WHY_IT_WORKS_SOURCE =
  'Source: Kantar, NPR State of Sponsorship Survey, July 2026. 318 NPR radio listeners (Morning Edition or All Things Considered, ages 18 to 64) and 300 non-listeners who use commercial news brands such as CNN, Fox News, The Wall Street Journal and The New York Times. Non-listener figures describe the ads on commercial news brands, not commercial radio.'

export const WHO_LISTENS: readonly PageStat[] = [
  { value: '65', text: 'median age of NPR News listeners in smaller U.S. counties' },
  { value: '88%', text: 'own their home' },
  { value: '31%', text: 'volunteered for a charitable organization in the past year, 86% more likely than other adults there' },
  { value: '23%', text: 'use a financial planner, about twice as likely as other adults there' },
]

export const WHO_LISTENS_SOURCE =
  'Source: MRI-Simmons Doublebase Fall 2025, among custom NPR News audience in C and D counties (fewer than 85,000 households). Base: total U.S. adults in C and D counties. NPR Small Markets Profile 2026. Closest NPR research to a station like WUWF.'

export const TESTIMONIALS: readonly { quote: string; name: string; role: string }[] = [
  {
    quote: 'As festival director of Books By the Bay, I was impressed with the number of responses we got through the app. Our attendance numbers increased significantly in our second year and our post event marketing surveys indicated that WUWF contributed to that success.',
    name: 'Tonya Dalhaus',
    role: 'President, Emerald Coast Writers',
  },
  {
    quote: 'I support only handful of organizations and WUWF is one of them. I donated and ended up becoming a Corporate Supporter, not necessarily to advertise but to simply support the station I rely on every day. My announcements on air have brought me new customers who tell me they called to do business because I support WUWF.',
    name: 'Chip Logan',
    role: 'Fireman Termite and Pest Control',
  },
  {
    quote: 'Our community has tremendous need for foster parents, and sponsorship messages on WUWF greatly helped us get the word out. The team was phenomenal to work with – very responsive and knowledgeable. We received great feedback from the community and are working on connecting those prospective foster parents to local children in need.',
    name: 'Kelsi Gulig',
    role: 'Marketing Director, FamiliesFirst Network',
  },
  {
    quote: 'Being a Sponsor with WUWF means investing in your community and to be an active participant in providing excellent community news, culture and arts to the Greater Pensacola area. We have been so happy with the results of our investment with WUWF and are proud to call them a partner in our success.',
    name: 'Peyton Blackledge',
    role: 'Autumn Beck Blackledge, PA',
  },
  {
    quote: 'I sponsor WUWF because it is the only radio station with in depth reporting of local, national and world news without shouting advertisements and arguing adults. I start each work day listening to WUWF and I enjoy the special music programs at night as well.',
    name: 'Lynn M. Keefe, MD',
    role: 'Pediatrics',
  },
  {
    quote: 'Public radio is about community. At its heart it is local. Bailey’s connects its customers to community like radio connects us to community. Public radio has always been about quality and information. We learn something every day. We are so proud to be a WUWF business sponsor.',
    name: 'Alison Thero',
    role: 'Co-owner, Bailey’s Produce & Nursery',
  },
]

export type Faq = { question: string; answer: string; link?: { label: string; href: string } }

export const FAQ: readonly Faq[] = [
  {
    question: 'How is sponsorship different from advertising?',
    answer:
      'A sponsor credit is a short, plain message that names your business, what you do and how to find you. It thanks you for supporting WUWF and leaves out prices, claims and calls to buy. That restraint is part of why it works: 66% of NPR listeners find the businesses they hear on public radio more credible than ads elsewhere.',
    link: { label: 'Read the credit guidelines', href: SPONSOR_PATHS.guidelines },
  },
  {
    question: 'What goes in my credit?',
    answer: 'Your business name, what you do, where you are and how to find you. A Carpool message is 20 words. Corporate support will draft the wording with you and check it against the guidelines.',
  },
  {
    question: 'Can my credit mention a sale, a price or an award?',
    answer:
      'No. Public radio rules keep credits from promoting products, so they leave out prices, discounts, “free,” awards, ratings and being “the best.” You can include a website or phone number so listeners can learn more.',
    link: { label: 'See what fits and what doesn’t', href: SPONSOR_PATHS.guidelines },
  },
  {
    question: 'How do I pay?',
    answer: 'Packages can be invoiced monthly across the contract period. Prepay any rate-card schedule and take 5% off. We accept Visa, MasterCard, Discover and American Express.',
  },
  {
    question: 'Are there discounts?',
    answer: 'Yes. First-time sponsors get 25% off drive-time credits in the new-sponsor packages, and nonprofits take 20% off open rates.',
  },
]

/** "What are you interested in?" on the inquiry form. */
export const INTERESTS = [
  'On-air credits',
  'The Carpool Plan',
  'A new-sponsor package',
  'The Sharing Spirit',
  'Website, app or e-newsletter',
  'RadioLive or the Book Club',
  'Not sure yet',
] as const

export const BUDGETS = ['Not sure yet', 'Under $1,000', '$1,000–$2,500', '$2,500–$5,000', '$5,000 and up'] as const

/** Events board: "WUWF listeners are people who show up." */
export const SHOW_UP_STATS: readonly PageStat[] = [
  { value: '63%', text: 'belong to a club or organization, 46% more likely than other adults' },
  { value: '31%', text: 'volunteered for a charitable organization in the past year' },
  { value: '23%', text: 'attended a public meeting' },
  { value: '19%', text: 'attended an art gallery or show, 108% more likely' },
]

export const SHOW_UP_SOURCE =
  'NPR News listeners in smaller U.S. counties, compared with all adults there. Source: MRI-Simmons Doublebase Fall 2025, among custom NPR News audience in C and D counties. Base: total U.S. adults in C and D counties. NPR Small Markets Profile 2026.'

/** The Carpool Plan page copy and the credit example. Example Credit Union is an illustration, not a sponsor. */
export const EXAMPLE_CREDIT = '“Support for WUWF comes from Example Credit Union, a member-owned credit union serving Northwest Florida. More at example dot org.”'

export const CREDIT_INCLUDES = 'Your name, what you do, your city or area and a website or phone number. A tag line is fine at the end.'
export const CREDIT_LEAVES_OUT = 'Prices, discounts, “free,” awards, “the best,” customer praise and calls to buy.'

// ── Credit guidelines (board 20b). Follows NPR's sponsor recognition guidelines; the final policy wording is for WUWF and UWF to confirm.

export const GUIDELINES_INCLUDES: readonly string[] = [
  'Your business name, as it should be known on air',
  'What you do, in plain words',
  'Your city or area',
  'A website or phone number, so listeners can learn more',
  'A slogan, used as a tag line at the end',
  'Your purpose or goal, such as the cause the business is built around',
  'A nonprofit you support, in a Sharing Spirit message',
]

export const GUIDELINES_LEAVES_OUT: readonly { heading: string; examples: string }[] = [
  { heading: 'Words about quality', examples: '“luxurious,” “state of the art”' },
  { heading: 'Rankings and reputation', examples: '“leading,” “#1,” “best known”' },
  { heading: 'Comparisons and superlatives', examples: '“fastest,” “most experienced”' },
  { heading: '“Only” and “exclusive”', examples: 'anything that claims no one else offers it' },
  { heading: 'Prices, “free” and rates', examples: '“low rates,” “free estimate,” “easy financing”' },
  { heading: 'Discounts and sales', examples: '“save 20%,” “this weekend only”' },
  { heading: 'Calls to buy or visit', examples: '“stop by,” “call today.” A web address or phone number to learn more is fine' },
  { heading: 'Endorsements and customer praise', examples: '“our customers love us”' },
  { heading: 'Awards, ratings and certifications', examples: '“award-winning,” “five-star”' },
  { heading: 'Guarantees and warranties', examples: '“satisfaction guaranteed”' },
  { heading: 'Long product lists', examples: 'more than listeners need to identify you' },
  { heading: 'Solutions to a listener’s need', examples: '“meets all your banking needs”' },
]

export const GUIDELINES_SIDE_BY_SIDE: readonly { ad: string; credit: string }[] = [
  { ad: 'Come in this weekend for our biggest sale, with free installation on every roof.', credit: 'Support for WUWF comes from Example Roofing, serving homeowners in Escambia County. More at example dot com.' },
  { ad: 'Example Dental, Pensacola’s best-rated family dentists. Call today for a free consultation.', credit: 'Support for WUWF comes from Example Dental, a family dental practice in Pensacola. More at example dot com.' },
  { ad: 'Example Bank meets all your banking needs, with the lowest rates in town.', credit: 'Support for WUWF comes from Example Bank, a community bank with offices in Gulf Breeze. More at example dot com.' },
]

export const GUIDELINES_RULES: readonly { heading: string; text: string }[] = [
  { heading: 'Never politics or causes of opinion', text: 'No candidates, elections, ballot measures, proposed laws or advocacy. A sponsor’s position can’t be part of a credit.' },
  { heading: 'Nonprofits', text: 'Nonprofits are acknowledged in a plain credit, like any sponsor. Paid public announcements for a nonprofit’s events or causes use the nonprofit rate (20% off open rates) and are labeled as paid for by the nonprofit.' },
  { heading: 'The right name', text: 'The credit names the organization that provides the support. A division or subsidiary can be named if it is the one paying.' },
  { heading: 'Other names in your credit', text: 'You can name a brand you carry or a group you work with if the relationship is real and listeners wouldn’t be confused about who the sponsor is.' },
  { heading: 'No influence on programming', text: 'Sponsors support WUWF. They don’t shape news or program decisions, and a credit never suggests they do.' },
  { heading: 'Online follows the same rules', text: 'Sponsor messages on wuwf.org, in the app and in the e-newsletter are labeled “Sponsor message” and follow these guidelines. Music streaming has its own artist-rights rules.' },
]

export const GUIDELINES_SOURCE =
  'Source: NPR Broadcast and Digital Music Streaming Sponsor Recognition Guidelines, effective September 2023. WUWF’s corporate support team reviews every credit before it airs and may suggest changes. The FCC asks stations to use reasonable, good-faith judgment about what promotes and what identifies.'
