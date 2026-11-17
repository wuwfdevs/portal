// Audience evidence (board 20), in order of closeness to WUWF: its own Nielsen figures, then NPR's Small Markets Profile (the
// closest proxy), then national NPR data, then seven sector views. Every figure carries its source and base; none is rounded or
// reworded here. Pure data.
//
// Open before launch (owner to settle; the page prints none of them as a bracket):
//  - Nielsen's citation and use terms for the 22,500 figure;
//  - whether WUWF's counties fall in NPR's C and D county group (the Small Markets Profile);
//  - NPR's permission to show Audience Insights data on a public website (audienceinsights@npr.org);
//  - a measured baseline for the website, app and e-newsletter, which the page leaves out until one exists.

export type Stat = { value: string; text: string }

export const WEEKLY_LISTENERS = '22,500'

export const NIELSEN_SOURCE =
  'Nielsen Audio, Pensacola metro, persons 12+, Monday–Sunday 6 a.m.–midnight, Spring 2026. Weekly listeners are Nielsen’s weekly cume; the mobile figure adds mobile listening to the broadcast cume. Estimates are subject to Nielsen’s qualifications.'

export const WUWF_AUDIENCE: readonly Stat[] = [
  { value: WEEKLY_LISTENERS, text: 'people listen to WUWF on the radio in an average week' },
  { value: '25,200', text: 'counting listening on mobile devices' },
  { value: '3.2%', text: 'of Pensacola-area radio listening in morning drive, WUWF’s strongest daypart' },
]

/** The Small Markets Profile source line, repeated under each block it supports. */
export const SMALL_MARKETS_SOURCE =
  'Source: MRI-Simmons Doublebase Fall 2025, among custom NPR News audience in C and D counties (fewer than 85,000 households). Base: total U.S. adults in C and D counties. NPR Small Markets Profile 2026.'

export const SMALL_MARKETS_PROFILE: readonly Stat[] = [
  { value: '65', text: 'median age of NPR News listeners, against 50 for all adults in these counties' },
  { value: '88%', text: 'own their home, 22% more likely than other adults there' },
  { value: '$96,200', text: 'median household income, against $75,400 for all adults there' },
  { value: '31%', text: 'volunteered for a charitable organization in the past year, 86% more likely' },
  { value: '63%', text: 'belong to a club or organization, 46% more likely' },
  { value: '46%', text: 'listened to or downloaded a podcast in the past 30 days' },
  { value: '23%', text: 'use a financial planner, 105% more likely' },
  { value: '10%', text: 'help make business purchases of $1,000 or more, 77% more likely' },
]

export const SKEPTICAL_OF_ADVERTISING: readonly Stat[] = [
  { value: '88%', text: 'say much of advertising is far too annoying' },
  { value: '86%', text: 'say advertising is more manipulative than informative' },
  { value: '91%', text: 'stick with a brand once they like it' },
  { value: '74%', text: 'buy on quality, not price' },
  { value: '54%', text: 'are more likely to buy brands that support a cause they care about' },
]

export const SKEPTICAL_NOTE = 'Advertising items are the share saying the statement describes them.'

export const HALO_SOURCE =
  'Source: Kantar, NPR State of Sponsorship Survey, July 2026. 318 NPR radio listeners (Morning Edition or All Things Considered, ages 18 to 64) and 300 non-listeners who use commercial news brands such as CNN, Fox News, The Wall Street Journal and The New York Times. The comparison group rates the ads on commercial news brands, not commercial radio. Survey respondents are NPR News listeners, so results describe public radio listeners in general, not WUWF’s alone. The 82% figure is the “personally important” item from the same survey.'

export const HALO_PERSONAL_IMPORTANCE = '82%'

export const HALO: readonly Stat[] = [
  { value: '79%', text: 'hold a more positive opinion of sponsors that support NPR' },
  { value: '77%', text: 'prefer to buy from NPR sponsors, price and quality being equal' },
  { value: '76%', text: 'agree NPR is selective about who can sponsor it' },
  { value: '74%', text: 'pay attention to the sponsorship announcements they hear' },
  { value: '66%', text: 'find the businesses they hear on public radio more credible than ads elsewhere' },
  { value: '84%', text: 'have taken an action because of a sponsorship announcement' },
]

/** NPR listeners compared with people who use commercial news brands. The two shares are whole percents. */
export type Comparison = { label: string; npr: number; commercial: number }

export const HALO_COMPARISON: readonly Comparison[] = [
  { label: 'My opinion of a business is more positive when I find out it supports this station', npr: 79, commercial: 43 },
  { label: 'When price and quality are equal, I prefer to buy from companies that support this station', npr: 77, commercial: 45 },
  { label: 'This station is selective about the businesses that can sponsor it', npr: 76, commercial: 47 },
  { label: 'I pay attention to the sponsorship announcements or ads I hear', npr: 74, commercial: 51 },
  { label: 'The businesses I hear in sponsorship announcements are more credible than ads I see or hear elsewhere', npr: 66, commercial: 48 },
]

/** The "84% took an action" figure sits lower on the page, with its caveat: the survey's list counts actions that are not purchases. */
export const ACTION_CAVEAT =
  'What “action” means: 34% visited a sponsor’s website, 30% considered a new product or service, 26% gathered more information about a company or product and 20% bought something for personal use. The survey’s list also includes actions that are not purchases, such as watching a television program (29%).'

export const NATIONAL_SOURCE = 'Source: NPR Public Radio Audience Profile 2026; MRI-Simmons Doublebase Fall 2025. Base: adults 18+ who listen to a public radio station.'

export const NATIONAL_PUBLIC_RADIO: readonly { heading: string; value: string; text: string }[] = [
  { heading: 'Involved', value: '99%', text: 'more likely to be a member of a charitable organization' },
  { heading: 'Educated', value: '89%', text: 'more likely to have a bachelor’s degree or higher' },
  { heading: 'Influential', value: '61%', text: 'more likely to be in top management at a company' },
  { heading: 'Affluent', value: '29%', text: 'more likely to have a household income of $100,000 or more' },
  { heading: 'Curious', value: '20%', text: 'more likely to own a passport' },
]

export const NATIONAL_NEWS_SOURCE =
  'Source: NPR News Audience Profile 2026; MRI-Simmons Doublebase Fall 2025. Base: adults 18+ who listen to an NPR News station. National figures run higher than WUWF’s likely audience: compare the smaller-county figures above.'

export const NATIONAL_NEWS: readonly Stat[] = [
  { value: '72%', text: 'have a college degree or beyond' },
  { value: '40%', text: 'have a postgraduate degree' },
  { value: '$127,000', text: 'median household income' },
  { value: '91%', text: 'are involved in public activities' },
  { value: '97%', text: 'own a smartphone' },
  { value: '78%', text: 'have visited a news site on their phone' },
]

export type Sector = {
  key: string
  name: string
  /** "Talk to us about {short}" */
  short: string
  title: string
  lead: string
  local: readonly Stat[]
  national: readonly Stat[]
}

export const SECTORS: readonly Sector[] = [
  {
    key: 'financial',
    name: 'Financial and insurance',
    short: 'financial services',
    title: 'For financial and insurance businesses: people who plan and decide',
    lead: 'Many NPR listeners plan carefully for retirement and make financial decisions for themselves and for the businesses they run.',
    local: [
      { value: '23%', text: 'use a financial planner, 105% more likely' },
      { value: '40%', text: 'have a traditional or Roth IRA, 54% more likely' },
      { value: '14%', text: 'hold a card from a credit union, 38% more likely' },
    ],
    national: [
      { value: '99%', text: 'more likely to use a financial planner' },
      { value: '87%', text: 'more likely to hold securities worth over $250,000' },
      { value: '62%', text: 'more likely to be a business owner or partner' },
    ],
  },
  {
    key: 'professional',
    name: 'Legal and business services',
    short: 'professional services',
    title: 'For legal and business services: owners and managers',
    lead: 'Listeners include business owners and the managers who choose the services a business buys.',
    local: [
      { value: '10%', text: 'help make business purchases of $1,000 or more, 77% more likely' },
      { value: '8%', text: 'are self-employed in their own business, 47% more likely' },
      { value: '6%', text: 'work in top management, 86% more likely' },
    ],
    national: [
      { value: '54%', text: 'more likely to be responsible for the legal side of a business' },
      { value: '104%', text: 'more likely to buy business consulting' },
      { value: '62%', text: 'more likely to be a business owner or partner' },
    ],
  },
  {
    key: 'home',
    name: 'Home and property',
    short: 'home and property',
    title: 'For home, garden and real estate: owners who invest in their homes',
    lead: 'Listeners own their homes and spend on keeping them up, often with help from a professional.',
    local: [
      { value: '88%', text: 'own their home, 22% more likely' },
      { value: '35%', text: 'remodeled in the past year, 27% more likely' },
      { value: '21%', text: 'hired an outside contractor for remodeling, 55% more likely' },
    ],
    national: [
      { value: '46%', text: 'more likely to have hired a contractor for remodeling' },
      { value: '54%', text: 'more likely to have spent $1,000 or more on home improvements' },
      { value: '53%', text: 'more likely to own a vacation or weekend home' },
    ],
  },
  {
    key: 'health',
    name: 'Health and dental',
    short: 'health care',
    title: 'For health care: people who keep up with their care',
    lead: 'Listeners see their doctors regularly and use a wide range of specialists.',
    local: [
      { value: '55%', text: 'saw a dentist in the past year, 31% more likely' },
      { value: '24%', text: 'saw a dermatologist, 98% more likely' },
      { value: '14%', text: 'saw an ophthalmologist, 72% more likely' },
    ],
    national: [
      { value: '25%', text: 'more likely to have seen a dentist in the past year' },
      { value: '61%', text: 'more likely to have seen a dermatologist' },
      { value: '22%', text: 'more likely to have seen a doctor six or more times' },
    ],
  },
  {
    key: 'arts',
    name: 'Arts and culture',
    short: 'the arts',
    title: 'For arts and culture: listeners who attend, collect and give',
    lead: 'NPR listeners value the arts and have the means to experience them firsthand, and they give to the organizations that make them possible.',
    local: [
      { value: '23%', text: 'visited a museum in the past year' },
      { value: '19%', text: 'attended an art gallery or show, 108% more likely' },
      { value: '17%', text: 'attended live theater in the past year' },
    ],
    national: [
      { value: '63%', text: 'more likely to have gone to live theater' },
      { value: '75%', text: 'more likely to have attended an art gallery or show' },
      { value: '169%', text: 'more likely to donate to arts and cultural organizations' },
    ],
  },
  {
    key: 'nonprofits',
    name: 'Nonprofits and causes',
    short: 'your cause',
    title: 'For nonprofits and causes: people who give, serve and show up',
    lead: 'Listeners support the causes they believe in with their money, their time and their leadership.',
    local: [
      { value: '31%', text: 'volunteered for a charitable organization in the past year, 86% more likely' },
      { value: '21%', text: 'served on a committee for a local organization, 216% more likely' },
      { value: '18%', text: 'served as an officer of a club or organization, 232% more likely' },
    ],
    national: [
      { value: '78%', text: 'more likely to have given $800 or more to charity in the past year' },
      { value: '195%', text: 'more likely to serve as an officer of a club or organization' },
      { value: '64%', text: 'more likely to have volunteered' },
    ],
  },
  {
    key: 'travel',
    name: 'Travel',
    short: 'travel',
    title: 'For travel: listeners who go, and plan for others',
    lead: 'Listeners travel often, at home and abroad, and many arrange travel for their work.',
    local: [
      { value: '74%', text: 'took a trip within the U.S. in the past year' },
      { value: '60%', text: 'have a valid passport' },
      { value: '35%', text: 'traveled abroad in the past three years' },
    ],
    national: [
      { value: '45%', text: 'more likely to have spent $5,000 or more on domestic travel' },
      { value: '23%', text: 'more likely to own a passport' },
      { value: '101%', text: 'more likely to arrange business travel' },
    ],
  },
]

export const SECTOR_SOURCE =
  'Smaller counties: Source: MRI-Simmons Doublebase Fall 2025, among custom NPR News audience in C and D counties (fewer than 85,000 households). Base: total U.S. adults in C and D counties. NPR Small Markets Profile 2026. “More likely” compares NPR News listeners with all adults in those counties. National: Source: MRI-Simmons Doublebase Fall 2025, among custom NPR News audience. Base: total U.S. adults. “More likely” compares NPR News listeners with all U.S. adults. Figures are from NPR’s sector sell sheets and Small Markets Profile.'

export function sector(key: string | undefined): Sector {
  return SECTORS.find((s) => s.key === key) ?? (SECTORS[0] as Sector)
}
