import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { draftMode } from 'next/headers'
import React from 'react'

import { AdminBar } from '@/components/AdminBar'
import { Footer } from '@/Footer/Component'
import { Header } from '@/Header/Component'
import { cn } from '@/utilities/ui'
import { getServerSideURL } from '@/utilities/getURL'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'

import './globals.css'

// Self-hosted (see src/app/fonts/README.md): the build never depends on Google's font CDN.
const sourceSans = localFont({
  display: 'swap',
  variable: '--font-source-sans',
  src: [
    { path: '../fonts/source-sans-3-400.woff2', style: 'normal', weight: '400' },
    { path: '../fonts/source-sans-3-600.woff2', style: 'normal', weight: '600' },
    { path: '../fonts/source-sans-3-700.woff2', style: 'normal', weight: '700' },
  ],
})

const sourceSerif = localFont({
  display: 'swap',
  variable: '--font-source-serif',
  src: [
    { path: '../fonts/source-serif-4-400.woff2', style: 'normal', weight: '400' },
    { path: '../fonts/source-serif-4-400-italic.woff2', style: 'italic', weight: '400' },
    { path: '../fonts/source-serif-4-600.woff2', style: 'normal', weight: '600' },
    { path: '../fonts/source-serif-4-700.woff2', style: 'normal', weight: '700' },
    { path: '../fonts/source-serif-4-700-italic.woff2', style: 'italic', weight: '700' },
  ],
})

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { isEnabled } = await draftMode()

  return (
    <html className={cn(sourceSans.variable, sourceSerif.variable)} lang="en">
      <head>
        <link href="/favicon.ico" rel="icon" sizes="32x32" />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body>
        <a
          className="sr-only z-50 rounded-sm bg-surface px-4 py-3 font-bold text-ink focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
          href="#main"
        >
          Skip to content
        </a>
        <AdminBar adminBarProps={{ preview: isEnabled }} />
        <Header />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}

export const metadata: Metadata = {
  metadataBase: new URL(getServerSideURL()),
  openGraph: mergeOpenGraph(),
  title: { default: 'WUWF Public Media', template: '%s | WUWF' },
  description: "NPR for Florida's Great Northwest. A service of the University of West Florida.",
}
