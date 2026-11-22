// MapLibre GL JS 6 runs its map in a web worker, and finds the worker's file next to its own module. Once Next bundles the module into a hashed chunk
// the worker is no longer beside it, and the map stays blank ("Worker failed to load"). So the worker and the file it imports are copied from the
// installed package into `public/maplibre/` (generated, ignored by git, so they always match the pinned version), and `MapExplorer` points MapLibre at them
// with `setWorkerUrl`. Run by `pnpm dev` and `pnpm build`.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const dist = path.join(path.dirname(require.resolve('maplibre-gl/package.json')), 'dist')
const out = path.resolve('public/maplibre')
mkdirSync(out, { recursive: true })
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  const from = path.join(dist, file)
  if (!existsSync(from)) throw new Error(`MapLibre's ${file} is missing from ${dist}; its worker layout changed, so check scripts/copy-maplibre-worker.mjs.`)
  copyFileSync(from, path.join(out, file))
}
console.log('MapLibre worker copied to public/maplibre')
