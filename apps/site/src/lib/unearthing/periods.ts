// The eras and periods Unearthing Florida files its episodes under (board 11). Pure: the hub reads these to build the
// era filter, the timeline and the map; the CMS uses `PERIOD_OPTIONS` and `ERA_OPTIONS` for its select fields.

export const ERAS = [
  { value: 'native', label: 'Native' },
  { value: 'spanish', label: 'Spanish colonial' },
  { value: 'british', label: 'British' },
  { value: 'american', label: 'American' },
] as const
export type Era = (typeof ERAS)[number]['value']

export const PERIODS = [
  { value: 'paleoindian-archaic', label: 'Paleoindian & Archaic', when: 'before 1000 BC', era: 'native' },
  { value: 'woodland-mississippian', label: 'Woodland & Mississippian', when: '1000 BC–1500', era: 'native' },
  { value: 'first-spanish', label: 'First Spanish period', when: '1513–1763', era: 'spanish' },
  { value: 'british-west-florida', label: 'British West Florida', when: '1763–1783', era: 'british' },
  { value: 'second-spanish', label: 'Second Spanish period', when: '1783–1821', era: 'spanish' },
  { value: 'territory-statehood', label: 'Territory & statehood', when: '1821–1861', era: 'american' },
  { value: 'civil-war', label: 'Civil War', when: '1861–1865', era: 'american' },
] as const satisfies readonly { value: string; label: string; when: string; era: Era }[]
export type Period = (typeof PERIODS)[number]['value']

export const ERA_OPTIONS = ERAS.map((e) => ({ label: e.label, value: e.value }))
export const PERIOD_OPTIONS = PERIODS.map((p) => ({ label: `${p.label} (${p.when})`, value: p.value }))

export const eraLabel = (era: string | null | undefined): string => ERAS.find((e) => e.value === era)?.label ?? ''
export const periodLabel = (period: string | null | undefined): string => PERIODS.find((p) => p.value === period)?.label ?? ''
