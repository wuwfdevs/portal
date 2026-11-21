import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { GIVING_STARTER } from '../lib/giving/starter'

/**
 * This migration also writes the giving pages' starting content (the boards' wording, `lib/giving/starter.ts`), and only when the global is still
 * empty: `giving_pages` made the tables, but wrote nothing, because a migration that uses the Local API reads the *current* schema and so can only
 * run once every column it touches exists. A database that already has content (a preview build ran the first migration and someone edited, or the
 * starter was already written) is left as it is. **Do not add a Local API write for this global to an earlier migration, and a later schema change
 * to it must not rely on this one still running on a fresh database without being re-checked (`pnpm verify:migrations` fails on it).**
 *
 * WUWF's donation platform has a separate form for a sustaining (monthly) gift and for a one-time gift, and a form where a sustainer changes
 * their gift. All three addresses are the ones Grove's own giving pages link to (read 2026-11-18), so the Give buttons can go where the station
 * already sends donors. This adds the columns, then fills the three addresses, the monthly-gift question's link and the vehicles panel's real-estate
 * button, each only where it is empty (an editor's entry is never overwritten). Pre-filling stays off: nothing has confirmed these forms read an amount
 * from the address.
 */
const SUSTAINING_FORM = 'https://donate.nprstations.org/wuwf/wuwf-secure-pledge-form-sustaining'
const ONE_TIME_FORM = 'https://donate.nprstations.org/wuwf/wuwf-secure-pledge-form-one-time'
const SUSTAINER_UPDATE_FORM = 'https://donate.nprstations.org/wuwf/sustainer-update-form'
const REAL_ESTATE_PAGE = 'https://wuwf.careasy.org/real-estate-donation'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "support_page_give_faq_items" ADD COLUMN "link_label" varchar;
  ALTER TABLE "support_page_give_faq_items" ADD COLUMN "link_href" varchar;
  ALTER TABLE "support_page_ways_panels" ADD COLUMN "secondary_label" varchar;
  ALTER TABLE "support_page_ways_panels" ADD COLUMN "secondary_href" varchar;
  ALTER TABLE "support_page_legacy_faq_items" ADD COLUMN "link_label" varchar;
  ALTER TABLE "support_page_legacy_faq_items" ADD COLUMN "link_href" varchar;
  ALTER TABLE "support_page" ADD COLUMN "donation_form_monthly_address" varchar;
  ALTER TABLE "support_page" ADD COLUMN "donation_form_once_address" varchar;`)

  let page = await payload.findGlobal({ slug: 'support-page', depth: 0, req, overrideAccess: true })
  if (!page.give?.hero?.title) {
    await payload.updateGlobal({ slug: 'support-page', data: GIVING_STARTER as never, req, overrideAccess: true, context: { disableRevalidate: true } })
    page = await payload.findGlobal({ slug: 'support-page', depth: 0, req, overrideAccess: true })
  }
  const faq = (page.give?.faq?.items ?? []).map((item) => (item.question === 'Can I change or stop a monthly gift?' && !item.linkHref ? { ...item, linkLabel: 'Update your monthly gift', linkHref: SUSTAINER_UPDATE_FORM } : item))
  const panels = (page.ways?.panels ?? []).map((panel) => (panel.slug === 'vehicles' && !panel.secondaryHref ? { ...panel, secondaryLabel: 'Donate real estate', secondaryHref: REAL_ESTATE_PAGE } : panel))
  await payload.updateGlobal({
    slug: 'support-page',
    data: {
      donationForm: { ...page.donationForm, monthlyAddress: page.donationForm?.monthlyAddress || SUSTAINING_FORM, onceAddress: page.donationForm?.onceAddress || ONE_TIME_FORM },
      give: { ...page.give, faq: { ...page.give?.faq, items: faq } },
      ways: { ...page.ways, panels },
    } as never,
    req,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "support_page_give_faq_items" DROP COLUMN "link_label";
  ALTER TABLE "support_page_give_faq_items" DROP COLUMN "link_href";
  ALTER TABLE "support_page_ways_panels" DROP COLUMN "secondary_label";
  ALTER TABLE "support_page_ways_panels" DROP COLUMN "secondary_href";
  ALTER TABLE "support_page_legacy_faq_items" DROP COLUMN "link_label";
  ALTER TABLE "support_page_legacy_faq_items" DROP COLUMN "link_href";
  ALTER TABLE "support_page" DROP COLUMN "donation_form_monthly_address";
  ALTER TABLE "support_page" DROP COLUMN "donation_form_once_address";`)
}
