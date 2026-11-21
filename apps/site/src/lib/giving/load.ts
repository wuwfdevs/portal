import { getCachedGlobal } from '@/utilities/getGlobals'

import type { GivingSettingsData } from './content'

/**
 * The Giving settings, through the tagged cache: saving the global in the admin refreshes every page that holds a block reading it
 * (`global_giving-settings`; the global's hook revalidates the tag). The donation form's addresses are public (they are links on the page).
 */
export const loadGivingSettings = (): Promise<GivingSettingsData> => getCachedGlobal('giving-settings', 0)() as Promise<GivingSettingsData>
