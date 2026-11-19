import type { Block } from 'payload'

import { isPageSetId, type PageSetId } from '@/lib/page-sets/registry'

import { Cards } from './Cards/config'
import { CardsSection } from './Cards/Component'
import { ClosingBand } from './ClosingBand/config'
import { ClosingBandSection } from './ClosingBand/Component'
import { Feature } from './Feature/config'
import { FeatureSection } from './Feature/Component'
import { Questions } from './Questions/config'
import { QuestionsSection } from './Questions/Component'
import { Stats } from './Stats/config'
import { StatsSection } from './Stats/Component'
import { Callout } from './Callout/config'
import { CalloutSection } from './Callout/Component'
import { CheckList } from './CheckList/config'
import { CheckListSection } from './CheckList/Component'
import { Picker } from './Picker/config'
import { PickerSection } from './Picker/Component'
import { ProfileBand } from './ProfileBand/config'
import { ProfileBandSection } from './ProfileBand/Component'
import { Quotes } from './Quotes/config'
import { QuotesSection } from './Quotes/Component'
import { Steps } from './Steps/config'
import { StepsSection } from './Steps/Component'
import { Support } from './Support/config'
import { SupportSection } from './Support/Component'
import { Table } from './Table/config'
import { TableSection } from './Table/Component'
import { Credit } from './Credit/config'
import { CreditSection } from './Credit/Component'
import { Dates } from './Dates/config'
import { DatesSection } from './Dates/Component'
import { FeaturedRecord } from './FeaturedRecord/config'
import { FeaturedRecordSection } from './FeaturedRecord/Component'
import { List } from './List/config'
import { ListSection } from './List/Component'
import { Text } from './Text/config'
import { TextSection } from './Text/Component'
import { Carpool } from './Carpool/config'
import { CarpoolSection } from './Carpool/Component'
import { InquiryForm } from './InquiryForm/config'
import { InquiryFormSection } from './InquiryForm/Component'
import { OpenPrograms } from './OpenPrograms/config'
import { OpenProgramsSection } from './OpenPrograms/Component'
import { Packages } from './Packages/config'
import { PackagesSection } from './Packages/Component'
import { BroadcastSchedule } from './BroadcastSchedule/config'
import { BroadcastScheduleSection } from './BroadcastSchedule/Component'
import { Columns } from './Columns/config'
import { ColumnsSection } from './Columns/Component'
import { Illustration } from './Illustration/config'
import { IllustrationSection } from './Illustration/Component'
import { GiftCard } from './GiftCard/config'
import { GiftCardSection } from './GiftCard/Component'
import { GivingContact } from './GivingContact/config'
import { GivingContactSection } from './GivingContact/Component'
import { GivingLevels } from './GivingLevels/config'
import { GivingLevelsSection } from './GivingLevels/Component'
import { ThankYou } from './ThankYou/config'
import { ThankYouSection } from './ThankYou/Component'
import { WaysToGive } from './WaysToGive/config'
import { WaysToGiveSection } from './WaysToGive/Component'
import { RateEstimator } from './RateEstimator/config'
import { RateEstimatorSection } from './RateEstimator/Component'
import type { SectionBlockEntry } from './types'

/**
 * Every section block (PAGE-BLOCKS.md → Block catalogue). One entry per block, here and nowhere else: its definition (`config.ts`), its
 * component, and the page sets that offer it (none listed: a library block, offered on every `sections` page). A developer adds a block by
 * adding a directory under `blocks/sections/` and one entry here; `registry.test.ts` fails when a block lacks a component, a test, a
 * thumbnail or a picker group, or when a directory is not registered.
 *
 * The definitions are put in the config's root `blocks` once and listed by `blockReferences` on the pages field, so the same block can be
 * offered elsewhere without growing the config.
 */
export const SECTION_BLOCKS: readonly SectionBlockEntry[] = [
  { dir: 'Feature', block: Feature, Component: FeatureSection },
  { dir: 'FeaturedRecord', block: FeaturedRecord, Component: FeaturedRecordSection },
  { dir: 'ProfileBand', block: ProfileBand, Component: ProfileBandSection },
  { dir: 'Cards', block: Cards, Component: CardsSection },
  { dir: 'List', block: List, Component: ListSection },
  { dir: 'Dates', block: Dates, Component: DatesSection },
  { dir: 'BroadcastSchedule', block: BroadcastSchedule, Component: BroadcastScheduleSection },
  { dir: 'Quotes', block: Quotes, Component: QuotesSection },
  { dir: 'Stats', block: Stats, Component: StatsSection },
  { dir: 'Steps', block: Steps, Component: StepsSection },
  { dir: 'Questions', block: Questions, Component: QuestionsSection },
  { dir: 'Callout', block: Callout, Component: CalloutSection },
  { dir: 'CheckList', block: CheckList, Component: CheckListSection },
  { dir: 'Table', block: Table, Component: TableSection },
  { dir: 'Picker', block: Picker, Component: PickerSection },
  { dir: 'Text', block: Text, Component: TextSection },
  { dir: 'Credit', block: Credit, Component: CreditSection },
  { dir: 'Support', block: Support, Component: SupportSection },
  { dir: 'ClosingBand', block: ClosingBand, Component: ClosingBandSection },
  // Layout: Columns holds other sections (one level); Illustration is drawn only inside it.
  { dir: 'Columns', block: Columns, Component: ColumnsSection },
  { dir: 'Illustration', block: Illustration, Component: IllustrationSection, inlineOnly: true },
  // Offered only on pages in the sponsor set (PAGE-BLOCKS.md → Block catalogue, set-only blocks). Each reads the Sponsorship settings.
  { dir: 'RateEstimator', block: RateEstimator, Component: RateEstimatorSection, sets: ['sponsor'] },
  { dir: 'Packages', block: Packages, Component: PackagesSection, sets: ['sponsor'] },
  { dir: 'Carpool', block: Carpool, Component: CarpoolSection, sets: ['sponsor'] },
  { dir: 'OpenPrograms', block: OpenPrograms, Component: OpenProgramsSection, sets: ['sponsor'] },
  { dir: 'InquiryForm', block: InquiryForm, Component: InquiryFormSection, sets: ['sponsor'] },
  // Offered only on pages in the giving set. Each reads the Giving settings (levels, amounts, the donation form, Member Services' contact details).
  { dir: 'GiftCard', block: GiftCard, Component: GiftCardSection, sets: ['giving'] },
  { dir: 'GivingLevels', block: GivingLevels, Component: GivingLevelsSection, sets: ['giving'] },
  { dir: 'WaysToGive', block: WaysToGive, Component: WaysToGiveSection, sets: ['giving'] },
  { dir: 'ThankYou', block: ThankYou, Component: ThankYouSection, sets: ['giving'] },
  { dir: 'GivingContact', block: GivingContact, Component: GivingContactSection, sets: ['giving'] },
]

/** The blocks for the config's root `blocks`. */
export const sectionBlockDefinitions: Block[] = SECTION_BLOCKS.map((e) => e.block)

const bySlug = new Map(SECTION_BLOCKS.map((e) => [e.block.slug, e]))

export function sectionEntry(slug: unknown): SectionBlockEntry | undefined {
  return typeof slug === 'string' ? bySlug.get(slug) : undefined
}

/** The slugs the picker offers a page in this set: the library, plus the blocks that name the set. */
export function blocksOfferedFor(set: unknown, entries: readonly SectionBlockEntry[] = SECTION_BLOCKS): string[] {
  const id: PageSetId | null = isPageSetId(set) ? set : null
  return entries.filter((e) => !e.inlineOnly && (!e.sets || (id !== null && e.sets.includes(id)))).map((e) => e.block.slug)
}

/** The slugs set-only blocks name: for a test that each names a set that exists. */
export function allSectionSlugs(entries: readonly SectionBlockEntry[] = SECTION_BLOCKS): string[] {
  return entries.map((e) => e.block.slug)
}
