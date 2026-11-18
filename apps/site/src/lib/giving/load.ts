import { getCachedGlobal } from '@/utilities/getGlobals'

import type { GivingContent } from './content'

/** The giving pages' global, cached; saving it in the admin refreshes every page (the global's hook revalidates `global_support-page`). */
export const loadGiving = (): Promise<GivingContent> => getCachedGlobal('support-page', 0)()
