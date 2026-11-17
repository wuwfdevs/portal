// The starting content of the Sponsorship global: the reviewed boards' wording (16 to 20b), written once into a new database by the
// `sponsorship_copy` migration. After that the admin owns it; nothing reads this file at runtime. Edit copy in the admin, not here.
// Rates, prices and figures are as the boards print them; the boards' bracketed review notes are deliberately not here.

export const SPONSORSHIP_STARTER = {
  "phone": "850 473-7453",
  "address": "11000 University Parkway, Building 88, Pensacola, FL 32514",
  "serviceLine": "WUWF Public Media is a service of the University of West Florida.",
  "inquiryNotice": "WUWF uses what you send only to answer your inquiry. Corporate support reads it and replies; the site keeps no copy.",
  "interests": [
    {
      "label": "On-air credits"
    },
    {
      "label": "The Carpool Plan"
    },
    {
      "label": "A new-sponsor package"
    },
    {
      "label": "The Sharing Spirit"
    },
    {
      "label": "Website, app or e-newsletter"
    },
    {
      "label": "RadioLive or the Book Club"
    },
    {
      "label": "Not sure yet"
    }
  ],
  "budgets": [
    {
      "label": "Not sure yet"
    },
    {
      "label": "Under $1,000"
    },
    {
      "label": "$1,000–$2,500"
    },
    {
      "label": "$2,500–$5,000"
    },
    {
      "label": "$5,000 and up"
    }
  ],
  "example": {
    "name": "Example Credit Union",
    "line": "A member-owned credit union serving Northwest Florida.",
    "website": "example.org"
  },
  "nav": {
    "title": "For businesses",
    "hub": "Sponsor WUWF",
    "onAir": "On air",
    "digital": "Digital",
    "events": "Events and programs",
    "audience": "Audience",
    "guidelines": "Credit guidelines"
  },
  "hub": {
    "hero": {
      "eyebrow": "Sponsor WUWF",
      "title": "Be the business that supports public radio.",
      "body": "About 22,500 people listen to WUWF in a typical week. NPR’s research shows they think better of the businesses that support public radio and prefer to buy from them. Your name reaches them on the radio, online and at live events, as support rather than as an ad.",
      "primaryLabel": "Get a proposal",
      "secondaryLabel": "See where your name can appear"
    },
    "heroStats": [
      {
        "value": "22,500",
        "text": "people listen to WUWF in a typical week"
      },
      {
        "value": "79%",
        "text": "hold a more positive opinion of sponsors that support NPR"
      },
      {
        "value": "77%",
        "text": "prefer to buy from NPR sponsors"
      },
      {
        "value": "66%",
        "text": "find the businesses they hear on public radio more credible than ads elsewhere"
      }
    ],
    "heroSource": "22,500: Nielsen Audio, Pensacola metro, ages 12+, Spring 2026. Other figures: NPR radio listeners nationally, Kantar, NPR State of Sponsorship Survey, July 2026.",
    "notAnAd": {
      "show": true,
      "eyebrow": "Why public radio sponsorship is different",
      "title": "Your name arrives as support, not as an interruption.",
      "body": "Most people have learned to tune out advertising. Among NPR News listeners in smaller U.S. counties, 88% say much of advertising is far too annoying and 86% say it is more manipulative than informative. A WUWF sponsor credit is built differently. It names your business, thanks you for supporting the station and says where to learn more.",
      "linkLabel": "What a credit can and can’t say →",
      "items": [
        {
          "heading": "Plain by design",
          "text": "No prices, no claims to be the best and no calls to buy. Credits follow NPR’s sponsor recognition guidelines, so listeners hear a thank-you, not a pitch."
        },
        {
          "heading": "Heard with attention",
          "text": "74% of NPR listeners say they pay attention to the sponsorship announcements they hear. Only 51% of non-listeners say that about the ads on the commercial news brands they use."
        },
        {
          "heading": "Loyal in return",
          "text": "91% of small-county NPR News listeners stick with a brand once they like it, and 54% are more likely to buy from brands that support a cause they care about."
        }
      ],
      "source": "Advertising and brand-loyalty figures: Source: MRI-Simmons Doublebase Fall 2025, among custom NPR News audience in C and D counties (fewer than 85,000 households). Base: total U.S. adults in C and D counties. NPR Small Markets Profile 2026. Attention: Kantar, July 2026."
    },
    "goals": {
      "show": true,
      "eyebrow": "Start with your goal",
      "title": "What do you want your sponsorship to do?",
      "body": "Pick the closest match to see what it could look like and what it would cost. Corporate support tailors every schedule to your business.",
      "items": [
        {
          "name": "Be known as a community supporter",
          "title": "Become the business listeners associate with public radio",
          "lead": "One short message at the same time every week becomes part of listeners’ routine. If you also back a nonprofit, say so on air with a Sharing Spirit message.",
          "total": "$1,430 a year",
          "span": "The Carpool Plan for 52 weeks, about $4 a day. The other lines are optional.",
          "lines": [
            {
              "channel": "On air",
              "what": "The Carpool Plan",
              "detail": "A 20-word message airs each week on the day and time you choose, sharing the break with one other business.",
              "price": "$1,430 a year"
            },
            {
              "channel": "On air, optional",
              "what": "The Sharing Spirit",
              "detail": "Name your business, the nonprofit you support and what it does, in one message.",
              "price": "At the rate card price"
            },
            {
              "channel": "Digital, optional",
              "what": "A sponsor message on wuwf.org",
              "detail": "Add a month online whenever you want more visibility.",
              "price": "$200 a month"
            }
          ]
        },
        {
          "name": "I’m new to WUWF",
          "title": "Start in the news hours, at 25% off",
          "lead": "First-time sponsors pay $41.25 for drive-time credits that normally cost $55, in the morning and afternoon NPR news hours.",
          "total": "$2,145",
          "span": "Drive All the Time: 52 drive-time credits, a $2,860 value. You save $715.",
          "lines": [
            {
              "channel": "On air",
              "what": "52 drive-time credits",
              "detail": "Credits air 6–9 a.m. or 3–7 p.m.",
              "price": "$2,145 (a $2,860 value)"
            },
            {
              "channel": "Or",
              "what": "Drive Time Plan Plus",
              "detail": "26 drive-time credits and 26 Total Program Rotation credits.",
              "price": "$1,566.50 (a $2,210 value)"
            },
            {
              "channel": "Billing",
              "what": "Invoiced monthly, if you prefer",
              "detail": "Spread the cost across the contract period.",
              "price": ""
            }
          ]
        },
        {
          "name": "Start small",
          "title": "Get on the air for $500",
          "lead": "26 credits spread across the broadcast day, on the days you choose. It’s our most affordable on-air package for first-time sponsors.",
          "total": "$500",
          "span": "26 credits for about $19 each, a $780 value.",
          "lines": [
            {
              "channel": "On air",
              "what": "Total Audience Plan",
              "detail": "26 credits that air between 6 a.m. and 7 p.m., Monday through Sunday. You choose the days.",
              "price": "$500 (a $780 value)"
            },
            {
              "channel": "Digital, optional",
              "what": "A sponsor message on wuwf.org",
              "detail": "Add it alongside your credits.",
              "price": "$200 a month"
            },
            {
              "channel": "Billing",
              "what": "Invoiced monthly, if you prefer",
              "detail": "Spread the cost across the contract period.",
              "price": ""
            }
          ]
        },
        {
          "name": "Promote my event",
          "title": "Fill the room",
          "lead": "Build awareness in the weeks before your date with credits across the whole broadcast day, plus a month online in the app, on the website and in the e-newsletter.",
          "total": "$1,180",
          "span": "Four weeks: 26 Total Program Rotation credits at the open rate, plus the digital package.",
          "lines": [
            {
              "channel": "On air",
              "what": "26 Total Program Rotation credits",
              "detail": "Your message rotates through the day and evening programming.",
              "price": "$780 ($30 each, open rate)"
            },
            {
              "channel": "Digital package",
              "what": "One month online",
              "detail": "A single banner in the app, a display ad on wuwf.org and a message in one issue of the e-newsletter.",
              "price": "$400 (separately, $450)"
            }
          ]
        },
        {
          "name": "Reach people online",
          "title": "Meet people on their phones and in their inboxes",
          "lead": "A banner in the app, a display ad on the website and a message in the e-newsletter. Buy them together for less, or one at a time.",
          "total": "$400 a month",
          "span": "All three together. Bought separately: $450.",
          "lines": [
            {
              "channel": "App",
              "what": "Single banner",
              "detail": "640 × 100.",
              "price": "$150 a month"
            },
            {
              "channel": "Website",
              "what": "Display ad on wuwf.org",
              "detail": "Shown on the website and on mobile devices.",
              "price": "$200 a month"
            },
            {
              "channel": "E-newsletter",
              "what": "A message in one issue",
              "detail": "Delivered to WUWF members.",
              "price": "$100 an issue"
            }
          ]
        },
        {
          "name": "I’m a nonprofit",
          "title": "Spread the word about your cause",
          "lead": "Nonprofits take 20% off WUWF’s open rates through the Paid Public Announcement rate, so your message goes further.",
          "total": "$624",
          "span": "26 Total Program Rotation credits at $24 each instead of $30.",
          "lines": [
            {
              "channel": "On air",
              "what": "26 Total Program Rotation credits",
              "detail": "Your message rotates through the day and evening programming.",
              "price": "$624 ($30 less 20%)"
            },
            {
              "channel": "Digital, optional",
              "what": "Website, app or e-newsletter",
              "detail": "Ask corporate support whether the nonprofit rate applies to digital.",
              "price": "From $100 an issue"
            }
          ]
        }
      ],
      "looksLikeLabel": "What it could look like",
      "ctaLabel": "Get a proposal like this",
      "eventsGoal": {
        "name": "Back something WUWF puts on",
        "title": "Join something people show up for",
        "lead": "Put your name on a live series or community program that people attend, join and talk about.",
        "total": "Priced on request",
        "span": "Partnership levels and terms are set for each event or program.",
        "linePrice": "Priced on request"
      }
    },
    "places": {
      "show": true,
      "eyebrow": "Where you can appear",
      "title": "Three places your name can appear",
      "body": "Start in one place. Add another when you’re ready.",
      "items": [
        {
          "title": "On air",
          "body": "Your name inside the news and music programs your customers already choose.",
          "detail": "Pay by the credit, or choose a weekly Carpool message, a whole program or a ready-made package.",
          "price": "From $23 a credit →",
          "page": "onAir"
        },
        {
          "title": "Digital",
          "body": "Your name on the website, in the app and in the e-newsletter, where listeners read, tap and open.",
          "detail": "Pay by the month, or by the issue.",
          "price": "From $100 an issue →",
          "page": "digital"
        },
        {
          "title": "Events and programs",
          "body": "Your name where WUWF’s community gathers: RadioLive concerts and the WUWF Book Club.",
          "detail": "Each has its own partnership levels.",
          "price": "Priced on request →",
          "page": "events"
        }
      ],
      "noteTitle": "New to WUWF? Your first schedule costs less.",
      "noteText": "Four ready-made on-air packages give first-time sponsors 25% off drive-time credits. They start at $500.",
      "noteLinkLabel": "See the new-sponsor packages →"
    },
    "why": {
      "show": true,
      "eyebrow": "Why it works",
      "title": "Listeners think better of the businesses that support WUWF.",
      "body": "NPR calls it the halo effect: the goodwill listeners feel for public radio carries over to the businesses that support it. 82% of NPR listeners say public radio is personally important to them. The comparison group, people who use commercial news brands, feels very differently about the ads on those brands.",
      "linkLabel": "See who’s listening →",
      "stats": [
        {
          "value": "79%",
          "text": "of NPR listeners think more highly of a business that supports public radio",
          "compare": "43% of non-listeners say the same of commercial news brands"
        },
        {
          "value": "77%",
          "text": "prefer to buy from companies that support public radio when price and quality are equal",
          "compare": "45% of non-listeners"
        },
        {
          "value": "76%",
          "text": "agree public radio is selective about who can sponsor it, so your name keeps good company",
          "compare": "47% of non-listeners"
        },
        {
          "value": "74%",
          "text": "pay attention to the sponsorship announcements they hear",
          "compare": "51% of non-listeners"
        },
        {
          "value": "66%",
          "text": "find the businesses they hear on public radio more credible than ads elsewhere",
          "compare": "48% of non-listeners"
        },
        {
          "value": "84%",
          "text": "have taken an action because of a sponsorship announcement",
          "compare": "Most often visiting a sponsor’s website (34%) or considering a new product or service (30%)"
        }
      ],
      "source": "Source: Kantar, NPR State of Sponsorship Survey, July 2026. 318 NPR radio listeners (Morning Edition or All Things Considered, ages 18 to 64) and 300 non-listeners who use commercial news brands such as CNN, Fox News, The Wall Street Journal and The New York Times. Non-listener figures describe the ads on commercial news brands, not commercial radio."
    },
    "who": {
      "show": true,
      "eyebrow": "The people behind the numbers",
      "title": "Established, rooted and involved in their community",
      "stats": [
        {
          "value": "65",
          "text": "median age of NPR News listeners in smaller U.S. counties"
        },
        {
          "value": "88%",
          "text": "own their home"
        },
        {
          "value": "31%",
          "text": "volunteered for a charitable organization in the past year, 86% more likely than other adults there"
        },
        {
          "value": "23%",
          "text": "use a financial planner, about twice as likely as other adults there"
        }
      ],
      "source": "Source: MRI-Simmons Doublebase Fall 2025, among custom NPR News audience in C and D counties (fewer than 85,000 households). Base: total U.S. adults in C and D counties. NPR Small Markets Profile 2026. Closest NPR research to a station like WUWF.",
      "linkLabel": "See the full audience profile →"
    },
    "testimonials": {
      "show": true,
      "eyebrow": "What sponsors tell us",
      "title": "Local sponsors, in their words",
      "items": [
        {
          "quote": "As festival director of Books By the Bay, I was impressed with the number of responses we got through the app. Our attendance numbers increased significantly in our second year and our post event marketing surveys indicated that WUWF contributed to that success.",
          "name": "Tonya Dalhaus",
          "role": "President, Emerald Coast Writers"
        },
        {
          "quote": "I support only handful of organizations and WUWF is one of them. I donated and ended up becoming a Corporate Supporter, not necessarily to advertise but to simply support the station I rely on every day. My announcements on air have brought me new customers who tell me they called to do business because I support WUWF.",
          "name": "Chip Logan",
          "role": "Fireman Termite and Pest Control"
        },
        {
          "quote": "Our community has tremendous need for foster parents, and sponsorship messages on WUWF greatly helped us get the word out. The team was phenomenal to work with – very responsive and knowledgeable. We received great feedback from the community and are working on connecting those prospective foster parents to local children in need.",
          "name": "Kelsi Gulig",
          "role": "Marketing Director, FamiliesFirst Network"
        },
        {
          "quote": "Being a Sponsor with WUWF means investing in your community and to be an active participant in providing excellent community news, culture and arts to the Greater Pensacola area. We have been so happy with the results of our investment with WUWF and are proud to call them a partner in our success.",
          "name": "Peyton Blackledge",
          "role": "Autumn Beck Blackledge, PA"
        },
        {
          "quote": "I sponsor WUWF because it is the only radio station with in depth reporting of local, national and world news without shouting advertisements and arguing adults. I start each work day listening to WUWF and I enjoy the special music programs at night as well.",
          "name": "Lynn M. Keefe, MD",
          "role": "Pediatrics"
        },
        {
          "quote": "Public radio is about community. At its heart it is local. Bailey’s connects its customers to community like radio connects us to community. Public radio has always been about quality and information. We learn something every day. We are so proud to be a WUWF business sponsor.",
          "name": "Alison Thero",
          "role": "Co-owner, Bailey’s Produce & Nursery"
        }
      ]
    },
    "faq": {
      "show": true,
      "eyebrow": "Common questions",
      "title": "Before you ask",
      "items": [
        {
          "question": "How is sponsorship different from advertising?",
          "answer": "A sponsor credit is a short, plain message that names your business, what you do and how to find you. It thanks you for supporting WUWF and leaves out prices, claims and calls to buy. That restraint is part of why it works: 66% of NPR listeners find the businesses they hear on public radio more credible than ads elsewhere.",
          "linkLabel": "Read the credit guidelines",
          "linkHref": "/sponsor/credit-guidelines"
        },
        {
          "question": "What goes in my credit?",
          "answer": "Your business name, what you do, where you are and how to find you. A Carpool message is 20 words. Corporate support will draft the wording with you and check it against the guidelines.",
          "linkLabel": "",
          "linkHref": ""
        },
        {
          "question": "Can my credit mention a sale, a price or an award?",
          "answer": "No. Public radio rules keep credits from promoting products, so they leave out prices, discounts, “free,” awards, ratings and being “the best.” You can include a website or phone number so listeners can learn more.",
          "linkLabel": "See what fits and what doesn’t",
          "linkHref": "/sponsor/credit-guidelines"
        },
        {
          "question": "How do I pay?",
          "answer": "Packages can be invoiced monthly across the contract period. Prepay any rate-card schedule and take 5% off. We accept Visa, MasterCard, Discover and American Express.",
          "linkLabel": "",
          "linkHref": ""
        },
        {
          "question": "Are there discounts?",
          "answer": "Yes. First-time sponsors get 25% off drive-time credits in the new-sponsor packages, and nonprofits take 20% off open rates.",
          "linkLabel": "",
          "linkHref": ""
        }
      ]
    },
    "inquiry": {
      "eyebrow": "Corporate support",
      "title": "Get a proposal",
      "body": "Tell us what you want to happen and when. WUWF’s corporate support team will come back with a proposal: a schedule and rates built around your goal.",
      "contactTitle": "WUWF Corporate Support",
      "sendingLabel": "Sending…",
      "guidelinesNote": "Sponsor credits follow WUWF’s credit guidelines.",
      "guidelinesLink": "Read the credit guidelines",
      "labels": {
        "name": "Your name",
        "organization": "Organization",
        "email": "Email",
        "phone": "Phone (optional)",
        "interests": "What are you interested in?",
        "budget": "Budget range (optional)",
        "message": "What’s happening at your business?",
        "required": "required"
      },
      "submitLabel": "Request a proposal",
      "thanksTitle": "Thanks. Corporate support will be in touch with a proposal.",
      "notSetUpMessage": "Online requests are not set up yet, so nothing was sent. Please call corporate support at 850 473-7453.",
      "failedMessage": "Something went wrong on our side and your request was not sent. Please try again in a few minutes, or call corporate support at 850 473-7453.",
      "thanksPrefix": "Here’s what you told us you’re interested in:"
    }
  },
  "onAir": {
    "hero": {
      "eyebrow": "On air",
      "title": "Your name, inside the programs your customers choose.",
      "body": "A WUWF credit names your business and thanks you for supporting public radio. It isn’t an ad, and that is why listeners trust it: 66% of NPR listeners find the businesses they hear on public radio more credible than ads elsewhere. Choose the hours that match your customers’ day, and corporate support handles the schedule.",
      "quote": "Support for WUWF comes from Example Credit Union, a member-owned credit union serving Northwest Florida. More at example dot org.",
      "quoteLabel": "What your credit sounds like",
      "quoteNote": "An illustration. Example Credit Union is not a real sponsor. Credits name you, say what you do and where to learn more. They leave out prices, claims and calls to buy.",
      "linkLabel": "See the credit guidelines.",
      "linkHref": "/sponsor/credit-guidelines"
    },
    "credit": {
      "show": true,
      "eyebrow": "Writing your credit",
      "title": "Who you are, what you do, where to learn more.",
      "includesTitle": "A credit includes",
      "includesText": "Your name, what you do, your city or area and a website or phone number. A tag line is fine at the end.",
      "leavesTitle": "A credit leaves out",
      "leavesText": "Prices, discounts, “free,” awards, “the best,” customer praise and calls to buy.",
      "linkLabel": "Read the credit guidelines →"
    },
    "buy": {
      "show": true,
      "eyebrow": "How to buy on air",
      "title": "Choose how you want to buy",
      "body": "All four put your name on the air. They differ in how much you plan yourself and how much we plan for you.",
      "items": [
        {
          "title": "By the credit",
          "text": "Pick your hours and how long you’ll commit. The longer you commit, the less each credit costs.",
          "price": "From $23 a credit →",
          "anchor": "rates"
        },
        {
          "title": "The Carpool Plan",
          "text": "One short message every week, same day and time, in drive-time news.",
          "price": "$715 for 6 months →",
          "anchor": "carpool"
        },
        {
          "title": "A whole program",
          "text": "Your name in one program, every time it airs, for 13 weeks.",
          "price": "Priced on request →",
          "anchor": "programs"
        },
        {
          "title": "A new-sponsor package",
          "text": "A ready-made schedule at a first-time discount.",
          "price": "From $500 →",
          "anchor": "packages"
        }
      ]
    },
    "rates": {
      "show": true,
      "eyebrow": "By the credit",
      "title": "Pick your hours. Pay per credit.",
      "body": "The longer you commit, the less each credit costs. Prepay and take another 5% off. Nonprofits take 20% off open rates.",
      "dayparts": [
        {
          "label": "Morning Drive",
          "when": "Mon–Fri, 6–9 a.m.",
          "open": 55,
          "m3": 50,
          "m6": 46,
          "y1": 44
        },
        {
          "label": "Afternoon Drive",
          "when": "Mon–Fri, 3–7 p.m.",
          "open": 55,
          "m3": 50,
          "m6": 46,
          "y1": 44
        },
        {
          "label": "Midday",
          "when": "Mon–Fri, 9 a.m.–3 p.m.",
          "open": 40,
          "m3": 36,
          "m6": 34,
          "y1": 30
        },
        {
          "label": "Weekend morning",
          "when": "Sat–Sun, 6–10 a.m.",
          "open": 38,
          "m3": 34,
          "m6": 32,
          "y1": 28
        },
        {
          "label": "Weekend midday",
          "when": "Sat–Sun, 10 a.m.–4 p.m.",
          "open": 33,
          "m3": 29,
          "m6": 28,
          "y1": 26
        },
        {
          "label": "Weekend afternoon",
          "when": "Sat–Sun, 4–7 p.m.",
          "open": 33,
          "m3": 29,
          "m6": 28,
          "y1": 26
        },
        {
          "label": "Total Program Rotation",
          "when": "Rotates through day and evening programming",
          "open": 30,
          "m3": 27,
          "m6": 25.5,
          "y1": 23
        }
      ],
      "creditCounts": [
        {
          "count": 13
        },
        {
          "count": 26
        },
        {
          "count": 52
        },
        {
          "count": 104
        }
      ],
      "prepayPercent": 5,
      "nonprofitPercent": 20,
      "note": "Total Program Rotation credits rotate through the day and evening programming. Select a row to use it in the estimate below.",
      "estimatorEyebrow": "Rough it out",
      "estimatorTitle": "Estimate your schedule",
      "estimatorDisclaimer": "A starting point only. WUWF confirms every schedule and price.",
      "estimatorCta": "Get a proposal for this schedule",
      "commitmentLabel": "Commitment",
      "creditsLabel": "Number of credits"
    },
    "sharing": {
      "title": "Backing a nonprofit? Ask about the Sharing Spirit.",
      "text": "Your credit names your business, the charity you support and what the charity does. Listeners learn about the cause and see who stands behind it. It runs in any daypart at the rate card price."
    },
    "carpool": {
      "show": true,
      "eyebrow": "The Carpool Plan",
      "title": "Be the name listeners hear every week.",
      "body": "Your 20-word message airs once a week, on the day and time you choose, in a morning or afternoon drive-time slot inside NPR news. You share the break with one other business, which is the “carpool.”\n\nBecause it returns at the same time every week, it becomes part of the listener’s routine. Public radio listeners stay loyal to the brands they trust: 91% of NPR News listeners in smaller counties say they stick with a brand once they like it. You can buy more than one, or add a Carpool Plan to any other schedule.",
      "words": 20,
      "sixMonths": 715,
      "oneYear": 1430,
      "perDayNote": "or about $4 a day",
      "slotsNote": "Slots are limited. Corporate support will offer the days and times that are open.",
      "ctaLabel": "Ask about open slots"
    },
    "programs": {
      "show": true,
      "eyebrow": "A whole program",
      "title": "Make one program yours for a quarter.",
      "body": "Your credit airs in the program you choose, every time it airs, for 13 weeks, so your name sits beside content listeners already seek out. It’s also part of the All Day Plan below. To sponsor a program on its own, ask corporate support for a rate.",
      "chooseLabel": "Choose from",
      "names": [
        {
          "name": "1A"
        },
        {
          "name": "Fresh Air"
        },
        {
          "name": "On the Media"
        },
        {
          "name": "TED Radio Hour"
        },
        {
          "name": "This American Life"
        },
        {
          "name": "Living on Earth"
        },
        {
          "name": "Here & Now"
        },
        {
          "name": "Science Friday"
        }
      ]
    },
    "packages": {
      "show": true,
      "eyebrow": "New-sponsor packages",
      "title": "New to WUWF? Start in the news hours at 25% off.",
      "body": "Drive-time credits in NPR news normally cost $55 each. First-time sponsors pay $41.25 in these ready-made schedules.",
      "openDriveRate": 55,
      "newDriveRate": 41.25,
      "items": [
        {
          "name": "Drive All the Time",
          "description": "52 credits in the morning and afternoon news hours, 6–9 a.m. or 3–7 p.m.",
          "price": 2145,
          "value": 2860
        },
        {
          "name": "Drive Time Plan Plus",
          "description": "26 drive-time credits, plus 26 Total Program Rotation credits that air any time from 6 a.m. to 7 p.m.",
          "price": 1566.5,
          "value": 2210
        },
        {
          "name": "All Day Plan",
          "description": "13 morning drive credits (6–9 a.m.), one program sponsored for 13 weeks, and 13 afternoon drive credits (3–7 p.m.).",
          "price": 1462.5,
          "value": 1950
        },
        {
          "name": "Total Audience Plan",
          "description": "Our easiest first step: 26 credits between 6 a.m. and 7 p.m., on the days you choose.",
          "price": 500,
          "value": 780
        }
      ],
      "packageLabel": "Package",
      "note": "Packages can be invoiced monthly across the contract period. The prepayment discount doesn’t apply to packages, but prepaid schedules get additional bonus messages."
    },
    "pay": {
      "show": true,
      "items": [
        {
          "heading": "Paying.",
          "text": "We accept Visa, MasterCard, Discover and American Express."
        },
        {
          "heading": "Prepaying.",
          "text": "Take 5% off any rate-card schedule."
        },
        {
          "heading": "Nonprofit?",
          "text": "Take 20% off open rates."
        }
      ],
      "ctaTitle": "Ready to pick your hours?",
      "ctaText": "Tell us who you want to reach and when. Corporate support will send a schedule and rates, and draft your credit with you.",
      "ctaLabel": "Get a proposal"
    }
  },
  "digital": {
    "hero": {
      "eyebrow": "Digital",
      "title": "Support WUWF where listeners read, tap and open.",
      "body": "Sponsor messages on wuwf.org, in the WUWF app and in the e-newsletter, always labeled and sold directly by corporate support. Listeners who find advertising annoying and intrusive see no autoplay, no pop-ups and no third-party tracking on wuwf.org. Sponsor messages follow the same credit guidelines as on-air credits.",
      "linkLabel": "Read the credit guidelines →",
      "linkHref": "/sponsor/credit-guidelines"
    },
    "website": {
      "show": true,
      "eyebrow": "Website",
      "title": "On the page where they read",
      "body": "Your message sits in a fixed place on wuwf.org, on desktop and on mobile, clearly labeled as a sponsor message.",
      "placements": [
        {
          "name": "Display ad",
          "detail": "A tile ad that appears on the website and on mobile devices.",
          "size": "",
          "price": "$200 a month"
        }
      ]
    },
    "app": {
      "show": true,
      "eyebrow": "App",
      "title": "In their pocket, where they listen",
      "body": "People open the WUWF app to play the live stream. A banner keeps your name on the screen while they listen, and a pre-roll puts it in front of them before the stream starts.",
      "placements": [
        {
          "name": "Single banner",
          "detail": "A banner in the WUWF app.",
          "size": "640 × 100",
          "price": "$150 a month, or $450 for 3 months"
        },
        {
          "name": "Double banner",
          "detail": "A taller banner in the WUWF app.",
          "size": "640 × 200",
          "price": "$200 a month, or $600 for 3 months"
        },
        {
          "name": "Pre-roll",
          "detail": "A 10-second message on the phone screen before the live stream.",
          "size": "640 × 1136",
          "price": "$200 a month"
        }
      ],
      "illustrationNote": "Illustrations show placement, not final layouts."
    },
    "newsletter": {
      "show": true,
      "eyebrow": "E-newsletter and audio",
      "title": "In the inbox of people who already support WUWF",
      "body": "The WUWF e-newsletter goes to the station’s members, people who have chosen to support public radio with their own money. Your name sits beside theirs as a supporter. Audio placements put your message before the live stream in the apps, or inside a podcast.",
      "placements": [
        {
          "name": "E-newsletter message",
          "detail": "A labeled sponsor message in one issue of the e-newsletter, which is delivered to WUWF members.",
          "size": "",
          "price": "$100 an issue"
        },
        {
          "name": "Stream audio pre-roll",
          "detail": "A 15-second audio message before the live stream in the apps, with a linked tile ad.",
          "size": "Audio, 15 seconds",
          "price": "Ask for rates"
        },
        {
          "name": "Podcast spot",
          "detail": "An audio spot before, in the middle of, or at the end of a podcast.",
          "size": "Audio",
          "price": "Ask for rates"
        }
      ]
    },
    "package": {
      "show": true,
      "eyebrow": "The digital package",
      "title": "Start with all three for $400 a month.",
      "body": "A single banner in the app, a display ad on the website and a message in one e-newsletter issue. Bought separately, they cost $450.",
      "price": 400,
      "priceSuffix": "a month"
    },
    "rules": {
      "show": true,
      "eyebrow": "On wuwf.org",
      "title": "A clean setting for your name",
      "body": "Most NPR News listeners in smaller U.S. counties find advertising annoying (88%). They won’t find that here.",
      "items": [
        {
          "heading": "Always labeled",
          "text": "Every placement says “Sponsor message” and follows WUWF’s credit guidelines, so readers know who supports WUWF."
        },
        {
          "heading": "Your own spot, sold directly",
          "text": "Your message appears in the same place every time, sold by WUWF’s team, not an ad network."
        },
        {
          "heading": "Nothing competes with it",
          "text": "No autoplay, no pop-ups, and no sound or motion you didn’t ask for."
        },
        {
          "heading": "No third-party tracking",
          "text": "Sponsor placements add no outside trackers to the page."
        }
      ]
    },
    "closing": {
      "title": "Tell us where your customers are.",
      "text": "Corporate support will recommend the placements that fit, and leave out the ones that don’t.",
      "label": "Get a proposal"
    }
  },
  "events": {
    "hero": {
      "eyebrow": "Events and programs",
      "title": "Put your name where WUWF’s community gathers.",
      "body": "WUWF produces live music and a community book club. Sponsors become part of something people attend, join and talk about, and are thanked for it by name. Each one has its own partnership levels, set with you by corporate support. Recognition follows the credit guidelines.",
      "linkLabel": "Read the credit guidelines →",
      "linkHref": "/sponsor/credit-guidelines"
    },
    "showUp": {
      "show": true,
      "title": "WUWF listeners are people who show up.",
      "stats": [
        {
          "value": "63%",
          "text": "belong to a club or organization, 46% more likely than other adults"
        },
        {
          "value": "31%",
          "text": "volunteered for a charitable organization in the past year"
        },
        {
          "value": "23%",
          "text": "attended a public meeting"
        },
        {
          "value": "19%",
          "text": "attended an art gallery or show, 108% more likely"
        }
      ],
      "source": "NPR News listeners in smaller U.S. counties, compared with all adults there. Source: MRI-Simmons Doublebase Fall 2025, among custom NPR News audience in C and D counties. Base: total U.S. adults in C and D counties. NPR Small Markets Profile 2026.",
      "linkLabel": "More on the audience"
    },
    "open": {
      "show": true,
      "eyebrow": "Open to sponsors",
      "titleOne": "One place to start",
      "titleTwo": "Two places to start",
      "titleMany": "Places to start",
      "emptyText": "No event or program is open to new sponsors right now. Tell corporate support what you’d like to back and we’ll see what fits.",
      "talkLabel": "Talk to us about {name}",
      "moreLabel": "More about {name}",
      "levelsLabel": "Ways to partner",
      "recognitionLabel": "Recognition."
    },
    "every": {
      "show": true,
      "eyebrow": "Every partnership",
      "title": "What every partnership includes",
      "items": [
        {
          "heading": "A level that fits",
          "text": "Support the whole series or program, or a single performance or session."
        },
        {
          "heading": "Recognition people will see",
          "text": "Where your name appears, spelled out before you commit."
        },
        {
          "heading": "Terms you can plan around",
          "text": "Dates and length, agreed up front. Ask about category exclusivity."
        }
      ],
      "note": "Want more reach? Add on-air credits or digital placements around your partnership. Corporate support will build the schedule with you."
    },
    "closing": {
      "title": "Have an event or program in mind?",
      "text": "Tell us what you’d like to support, and we’ll see what fits.",
      "label": "Get a proposal"
    }
  },
  "audience": {
    "hero": {
      "eyebrow": "Audience",
      "title": "Know who’s listening",
      "body": "Start with who listens to WUWF. Then see what NPR’s research shows about listeners in smaller markets, how listeners respond to the businesses that support public radio, and how that looks for your kind of business."
    },
    "wuwf": {
      "show": true,
      "eyebrow": "WUWF’s audience",
      "title": "About 22,500 people listen to WUWF in a typical week.",
      "stats": [
        {
          "value": "22,500",
          "text": "people listen to WUWF on the radio in an average week"
        },
        {
          "value": "25,200",
          "text": "counting listening on mobile devices"
        },
        {
          "value": "3.2%",
          "text": "of Pensacola-area radio listening in morning drive, WUWF’s strongest daypart"
        }
      ],
      "source": "Nielsen Audio, Pensacola metro, persons 12+, Monday–Sunday 6 a.m.–midnight, Spring 2026. Weekly listeners are Nielsen’s weekly cume; the mobile figure adds mobile listening to the broadcast cume. Estimates are subject to Nielsen’s qualifications."
    },
    "small": {
      "show": true,
      "eyebrow": "Closest to home",
      "title": "NPR News listeners in smaller U.S. counties",
      "body": "NPR’s Small Markets Profile covers listeners in counties with fewer than 85,000 households. It is the closest NPR research to a station like WUWF. Comparisons are with all adults in those counties.",
      "stats": [
        {
          "value": "65",
          "text": "median age of NPR News listeners, against 50 for all adults in these counties"
        },
        {
          "value": "88%",
          "text": "own their home, 22% more likely than other adults there"
        },
        {
          "value": "$96,200",
          "text": "median household income, against $75,400 for all adults there"
        },
        {
          "value": "31%",
          "text": "volunteered for a charitable organization in the past year, 86% more likely"
        },
        {
          "value": "63%",
          "text": "belong to a club or organization, 46% more likely"
        },
        {
          "value": "46%",
          "text": "listened to or downloaded a podcast in the past 30 days"
        },
        {
          "value": "23%",
          "text": "use a financial planner, 105% more likely"
        },
        {
          "value": "10%",
          "text": "help make business purchases of $1,000 or more, 77% more likely"
        }
      ],
      "skepticalTitle": "They are skeptical of advertising and loyal to what they trust.",
      "skeptical": [
        {
          "value": "88%",
          "text": "say much of advertising is far too annoying"
        },
        {
          "value": "86%",
          "text": "say advertising is more manipulative than informative"
        },
        {
          "value": "91%",
          "text": "stick with a brand once they like it"
        },
        {
          "value": "74%",
          "text": "buy on quality, not price"
        },
        {
          "value": "54%",
          "text": "are more likely to buy brands that support a cause they care about"
        }
      ],
      "source": "Source: MRI-Simmons Doublebase Fall 2025, among custom NPR News audience in C and D counties (fewer than 85,000 households). Base: total U.S. adults in C and D counties. NPR Small Markets Profile 2026. Advertising items are the share saying the statement describes them. Online and national figures follow."
    },
    "halo": {
      "show": true,
      "eyebrow": "The halo effect",
      "title": "Listeners think better of the businesses that support public radio.",
      "body": "82% of NPR listeners say public radio is personally important to them. That goodwill carries over to the businesses that support it.",
      "stats": [
        {
          "value": "79%",
          "text": "hold a more positive opinion of sponsors that support NPR"
        },
        {
          "value": "77%",
          "text": "prefer to buy from NPR sponsors, price and quality being equal"
        },
        {
          "value": "76%",
          "text": "agree NPR is selective about who can sponsor it"
        },
        {
          "value": "74%",
          "text": "pay attention to the sponsorship announcements they hear"
        },
        {
          "value": "66%",
          "text": "find the businesses they hear on public radio more credible than ads elsewhere"
        },
        {
          "value": "84%",
          "text": "have taken an action because of a sponsorship announcement"
        }
      ],
      "compareTitle": "NPR listeners compared with people who use commercial news brands",
      "nprLabel": "NPR listeners",
      "commercialLabel": "commercial news",
      "comparison": [
        {
          "label": "My opinion of a business is more positive when I find out it supports this station",
          "npr": 79,
          "commercial": 43
        },
        {
          "label": "When price and quality are equal, I prefer to buy from companies that support this station",
          "npr": 77,
          "commercial": 45
        },
        {
          "label": "This station is selective about the businesses that can sponsor it",
          "npr": 76,
          "commercial": 47
        },
        {
          "label": "I pay attention to the sponsorship announcements or ads I hear",
          "npr": 74,
          "commercial": 51
        },
        {
          "label": "The businesses I hear in sponsorship announcements are more credible than ads I see or hear elsewhere",
          "npr": 66,
          "commercial": 48
        }
      ],
      "caveat": "What “action” means: 34% visited a sponsor’s website, 30% considered a new product or service, 26% gathered more information about a company or product and 20% bought something for personal use. The survey’s list also includes actions that are not purchases, such as watching a television program (29%).",
      "source": "Source: Kantar, NPR State of Sponsorship Survey, July 2026. 318 NPR radio listeners (Morning Edition or All Things Considered, ages 18 to 64) and 300 non-listeners who use commercial news brands such as CNN, Fox News, The Wall Street Journal and The New York Times. The comparison group rates the ads on commercial news brands, not commercial radio. Survey respondents are NPR News listeners, so results describe public radio listeners in general, not WUWF’s alone. The 82% figure is the “personally important” item from the same survey."
    },
    "national": {
      "show": true,
      "eyebrow": "Public radio listeners nationally, compared with the average U.S. adult",
      "title": "They’re involved, educated and influential.",
      "stats": [
        {
          "value": "99%",
          "text": "Involved: more likely to be a member of a charitable organization"
        },
        {
          "value": "89%",
          "text": "Educated: more likely to have a bachelor’s degree or higher"
        },
        {
          "value": "61%",
          "text": "Influential: more likely to be in top management at a company"
        },
        {
          "value": "29%",
          "text": "Affluent: more likely to have a household income of $100,000 or more"
        },
        {
          "value": "20%",
          "text": "Curious: more likely to own a passport"
        }
      ],
      "source": "Source: NPR Public Radio Audience Profile 2026; MRI-Simmons Doublebase Fall 2025. Base: adults 18+ who listen to a public radio station.",
      "glanceTitle": "NPR News listeners at a glance",
      "glance": [
        {
          "value": "72%",
          "text": "have a college degree or beyond"
        },
        {
          "value": "40%",
          "text": "have a postgraduate degree"
        },
        {
          "value": "$127,000",
          "text": "median household income"
        },
        {
          "value": "91%",
          "text": "are involved in public activities"
        },
        {
          "value": "97%",
          "text": "own a smartphone"
        },
        {
          "value": "78%",
          "text": "have visited a news site on their phone"
        }
      ],
      "glanceSource": "Source: NPR News Audience Profile 2026; MRI-Simmons Doublebase Fall 2025. Base: adults 18+ who listen to an NPR News station. National figures run higher than WUWF’s likely audience: compare the smaller-county figures above."
    },
    "sectors": {
      "show": true,
      "eyebrow": "By sector",
      "title": "How this looks for your kind of business",
      "items": [
        {
          "name": "Financial and insurance",
          "short": "financial services",
          "title": "For financial and insurance businesses: people who plan and decide",
          "lead": "Many NPR listeners plan carefully for retirement and make financial decisions for themselves and for the businesses they run.",
          "local": [
            {
              "value": "23%",
              "text": "use a financial planner, 105% more likely"
            },
            {
              "value": "40%",
              "text": "have a traditional or Roth IRA, 54% more likely"
            },
            {
              "value": "14%",
              "text": "hold a card from a credit union, 38% more likely"
            }
          ],
          "national": [
            {
              "value": "99%",
              "text": "more likely to use a financial planner"
            },
            {
              "value": "87%",
              "text": "more likely to hold securities worth over $250,000"
            },
            {
              "value": "62%",
              "text": "more likely to be a business owner or partner"
            }
          ]
        },
        {
          "name": "Legal and business services",
          "short": "professional services",
          "title": "For legal and business services: owners and managers",
          "lead": "Listeners include business owners and the managers who choose the services a business buys.",
          "local": [
            {
              "value": "10%",
              "text": "help make business purchases of $1,000 or more, 77% more likely"
            },
            {
              "value": "8%",
              "text": "are self-employed in their own business, 47% more likely"
            },
            {
              "value": "6%",
              "text": "work in top management, 86% more likely"
            }
          ],
          "national": [
            {
              "value": "54%",
              "text": "more likely to be responsible for the legal side of a business"
            },
            {
              "value": "104%",
              "text": "more likely to buy business consulting"
            },
            {
              "value": "62%",
              "text": "more likely to be a business owner or partner"
            }
          ]
        },
        {
          "name": "Home and property",
          "short": "home and property",
          "title": "For home, garden and real estate: owners who invest in their homes",
          "lead": "Listeners own their homes and spend on keeping them up, often with help from a professional.",
          "local": [
            {
              "value": "88%",
              "text": "own their home, 22% more likely"
            },
            {
              "value": "35%",
              "text": "remodeled in the past year, 27% more likely"
            },
            {
              "value": "21%",
              "text": "hired an outside contractor for remodeling, 55% more likely"
            }
          ],
          "national": [
            {
              "value": "46%",
              "text": "more likely to have hired a contractor for remodeling"
            },
            {
              "value": "54%",
              "text": "more likely to have spent $1,000 or more on home improvements"
            },
            {
              "value": "53%",
              "text": "more likely to own a vacation or weekend home"
            }
          ]
        },
        {
          "name": "Health and dental",
          "short": "health care",
          "title": "For health care: people who keep up with their care",
          "lead": "Listeners see their doctors regularly and use a wide range of specialists.",
          "local": [
            {
              "value": "55%",
              "text": "saw a dentist in the past year, 31% more likely"
            },
            {
              "value": "24%",
              "text": "saw a dermatologist, 98% more likely"
            },
            {
              "value": "14%",
              "text": "saw an ophthalmologist, 72% more likely"
            }
          ],
          "national": [
            {
              "value": "25%",
              "text": "more likely to have seen a dentist in the past year"
            },
            {
              "value": "61%",
              "text": "more likely to have seen a dermatologist"
            },
            {
              "value": "22%",
              "text": "more likely to have seen a doctor six or more times"
            }
          ]
        },
        {
          "name": "Arts and culture",
          "short": "the arts",
          "title": "For arts and culture: listeners who attend, collect and give",
          "lead": "NPR listeners value the arts and have the means to experience them firsthand, and they give to the organizations that make them possible.",
          "local": [
            {
              "value": "23%",
              "text": "visited a museum in the past year"
            },
            {
              "value": "19%",
              "text": "attended an art gallery or show, 108% more likely"
            },
            {
              "value": "17%",
              "text": "attended live theater in the past year"
            }
          ],
          "national": [
            {
              "value": "63%",
              "text": "more likely to have gone to live theater"
            },
            {
              "value": "75%",
              "text": "more likely to have attended an art gallery or show"
            },
            {
              "value": "169%",
              "text": "more likely to donate to arts and cultural organizations"
            }
          ]
        },
        {
          "name": "Nonprofits and causes",
          "short": "your cause",
          "title": "For nonprofits and causes: people who give, serve and show up",
          "lead": "Listeners support the causes they believe in with their money, their time and their leadership.",
          "local": [
            {
              "value": "31%",
              "text": "volunteered for a charitable organization in the past year, 86% more likely"
            },
            {
              "value": "21%",
              "text": "served on a committee for a local organization, 216% more likely"
            },
            {
              "value": "18%",
              "text": "served as an officer of a club or organization, 232% more likely"
            }
          ],
          "national": [
            {
              "value": "78%",
              "text": "more likely to have given $800 or more to charity in the past year"
            },
            {
              "value": "195%",
              "text": "more likely to serve as an officer of a club or organization"
            },
            {
              "value": "64%",
              "text": "more likely to have volunteered"
            }
          ]
        },
        {
          "name": "Travel",
          "short": "travel",
          "title": "For travel: listeners who go, and plan for others",
          "lead": "Listeners travel often, at home and abroad, and many arrange travel for their work.",
          "local": [
            {
              "value": "74%",
              "text": "took a trip within the U.S. in the past year"
            },
            {
              "value": "60%",
              "text": "have a valid passport"
            },
            {
              "value": "35%",
              "text": "traveled abroad in the past three years"
            }
          ],
          "national": [
            {
              "value": "45%",
              "text": "more likely to have spent $5,000 or more on domestic travel"
            },
            {
              "value": "23%",
              "text": "more likely to own a passport"
            },
            {
              "value": "101%",
              "text": "more likely to arrange business travel"
            }
          ]
        }
      ],
      "localLabel": "Smaller U.S. counties, closest to WUWF",
      "nationalLabel": "Nationally",
      "talkLabel": "Talk to us about {short}",
      "source": "Smaller counties: Source: MRI-Simmons Doublebase Fall 2025, among custom NPR News audience in C and D counties (fewer than 85,000 households). Base: total U.S. adults in C and D counties. NPR Small Markets Profile 2026. “More likely” compares NPR News listeners with all adults in those counties. National: Source: MRI-Simmons Doublebase Fall 2025, among custom NPR News audience. Base: total U.S. adults. “More likely” compares NPR News listeners with all U.S. adults. Figures are from NPR’s sector sell sheets and Small Markets Profile."
    },
    "closing": {
      "title": "Are these your customers?",
      "text": "Corporate support can walk you through the research and the schedule that fits your business.",
      "label": "Get a proposal"
    }
  },
  "guidelines": {
    "hero": {
      "eyebrow": "Credit guidelines",
      "title": "What a WUWF sponsor credit says",
      "body": "A credit names the business that supports WUWF and thanks it. It isn’t a commercial. These guidelines follow NPR’s sponsor recognition guidelines and the FCC rules behind them, and they apply on air and online."
    },
    "includes": {
      "show": true,
      "eyebrow": "A credit includes",
      "title": "Who you are, what you do, where to learn more",
      "items": [
        {
          "text": "Your business name, as it should be known on air"
        },
        {
          "text": "What you do, in plain words"
        },
        {
          "text": "Your city or area"
        },
        {
          "text": "A website or phone number, so listeners can learn more"
        },
        {
          "text": "A slogan, used as a tag line at the end"
        },
        {
          "text": "Your purpose or goal, such as the cause the business is built around"
        },
        {
          "text": "A nonprofit you support, in a Sharing Spirit message"
        }
      ]
    },
    "leavesOut": {
      "show": true,
      "eyebrow": "A credit leaves out",
      "title": "Anything that promotes",
      "items": [
        {
          "heading": "Words about quality",
          "examples": "“luxurious,” “state of the art”"
        },
        {
          "heading": "Rankings and reputation",
          "examples": "“leading,” “#1,” “best known”"
        },
        {
          "heading": "Comparisons and superlatives",
          "examples": "“fastest,” “most experienced”"
        },
        {
          "heading": "“Only” and “exclusive”",
          "examples": "anything that claims no one else offers it"
        },
        {
          "heading": "Prices, “free” and rates",
          "examples": "“low rates,” “free estimate,” “easy financing”"
        },
        {
          "heading": "Discounts and sales",
          "examples": "“save 20%,” “this weekend only”"
        },
        {
          "heading": "Calls to buy or visit",
          "examples": "“stop by,” “call today.” A web address or phone number to learn more is fine"
        },
        {
          "heading": "Endorsements and customer praise",
          "examples": "“our customers love us”"
        },
        {
          "heading": "Awards, ratings and certifications",
          "examples": "“award-winning,” “five-star”"
        },
        {
          "heading": "Guarantees and warranties",
          "examples": "“satisfaction guaranteed”"
        },
        {
          "heading": "Long product lists",
          "examples": "more than listeners need to identify you"
        },
        {
          "heading": "Solutions to a listener’s need",
          "examples": "“meets all your banking needs”"
        }
      ]
    },
    "side": {
      "show": true,
      "eyebrow": "Side by side",
      "title": "The same business, two ways",
      "body": "Illustrations only. These businesses aren’t real sponsors.",
      "adLabel": "An ad would say",
      "creditLabel": "A credit says",
      "pairs": [
        {
          "ad": "Come in this weekend for our biggest sale, with free installation on every roof.",
          "credit": "Support for WUWF comes from Example Roofing, serving homeowners in Escambia County. More at example dot com."
        },
        {
          "ad": "Example Dental, Pensacola’s best-rated family dentists. Call today for a free consultation.",
          "credit": "Support for WUWF comes from Example Dental, a family dental practice in Pensacola. More at example dot com."
        },
        {
          "ad": "Example Bank meets all your banking needs, with the lowest rates in town.",
          "credit": "Support for WUWF comes from Example Bank, a community bank with offices in Gulf Breeze. More at example dot com."
        }
      ]
    },
    "rules": {
      "show": true,
      "eyebrow": "The rules behind it",
      "title": "A few more things worth knowing",
      "items": [
        {
          "heading": "Never politics or causes of opinion",
          "text": "No candidates, elections, ballot measures, proposed laws or advocacy. A sponsor’s position can’t be part of a credit."
        },
        {
          "heading": "Nonprofits",
          "text": "Nonprofits are acknowledged in a plain credit, like any sponsor. Paid public announcements for a nonprofit’s events or causes use the nonprofit rate (20% off open rates) and are labeled as paid for by the nonprofit."
        },
        {
          "heading": "The right name",
          "text": "The credit names the organization that provides the support. A division or subsidiary can be named if it is the one paying."
        },
        {
          "heading": "Other names in your credit",
          "text": "You can name a brand you carry or a group you work with if the relationship is real and listeners wouldn’t be confused about who the sponsor is."
        },
        {
          "heading": "No influence on programming",
          "text": "Sponsors support WUWF. They don’t shape news or program decisions, and a credit never suggests they do."
        },
        {
          "heading": "Online follows the same rules",
          "text": "Sponsor messages on wuwf.org, in the app and in the e-newsletter are labeled “Sponsor message” and follow these guidelines. Music streaming has its own artist-rights rules."
        }
      ],
      "source": "Source: NPR Broadcast and Digital Music Streaming Sponsor Recognition Guidelines, effective September 2023. WUWF’s corporate support team reviews every credit before it airs and may suggest changes. The FCC asks stations to use reasonable, good-faith judgment about what promotes and what identifies."
    },
    "closing": {
      "title": "Not sure how to word yours?",
      "text": "Corporate support will draft your credit with you and check it against these guidelines.",
      "label": "Get a proposal"
    }
  }
}
