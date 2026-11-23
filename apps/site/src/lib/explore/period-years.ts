// The years an episode's period stands for, used to seed an episode's start and end year (the migration `unearthing_explore_years` does the same in SQL, and a test keeps the two equal)
// and as the fallback for an episode that has a period but no years of its own. Pure.
//
// Years are signed integers: negative is BCE (-1000 is 1000 BCE), positive is CE, and there is no year 0 (1 CE follows -1 BCE). A period's range is the span its name covers on the
// episode form (`lib/unearthing/periods.ts`, "when"); "Paleoindian & Archaic" is "before 1000 BC", given a far floor so the window's scale (10,000 BCE at the left) holds it.

export const EARLIEST_YEAR = -10000

export const PERIOD_YEARS: Readonly<Record<string, readonly [number, number]>> = {
  'paleoindian-archaic': [EARLIEST_YEAR, -1000],
  'woodland-mississippian': [-1000, 1500],
  'first-spanish': [1513, 1763],
  'british-west-florida': [1763, 1783],
  'second-spanish': [1783, 1821],
  'territory-statehood': [1821, 1861],
  'civil-war': [1861, 1865],
}

/** The span a period covers, or null for no period or one this table does not know. */
export function periodYears(period: string | null | undefined): readonly [number, number] | null {
  return (period && PERIOD_YEARS[period]) || null
}
