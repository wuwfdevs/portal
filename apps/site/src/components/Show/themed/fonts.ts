import localFont from 'next/font/local'

// A themed show's own faces, self-hosted like the station's (src/app/fonts/README.md). Loaded only by the themed show
// components, so the rest of the site never downloads them. The theme's font stacks (lib/shows/themes.ts) name these variables.
export const leagueGothic = localFont({
  display: 'swap',
  variable: '--font-show-league-gothic',
  src: [{ path: '../../../app/fonts/league-gothic-400.woff2', style: 'normal', weight: '400' }],
})

export const lora = localFont({
  display: 'swap',
  variable: '--font-show-lora',
  src: [
    { path: '../../../app/fonts/lora-400.woff2', style: 'normal', weight: '400' },
    { path: '../../../app/fonts/lora-400-italic.woff2', style: 'italic', weight: '400' },
    { path: '../../../app/fonts/lora-700.woff2', style: 'normal', weight: '700' },
  ],
})
