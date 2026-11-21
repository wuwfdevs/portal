// Writes the admin's generated theme (`src/app/(payload)/_admin-theme.scss`) from the design tokens. Run: pnpm generate:admin-theme
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { adminThemeCss } from '../src/lib/admin-theme/theme'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(here, '../src/app/(payload)/_admin-theme.scss')
writeFileSync(out, adminThemeCss())
console.log(`wrote ${path.relative(process.cwd(), out)}`)
