import type { Metadata } from 'next'
import { getServerSideURL } from './getURL'

const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
  description: "NPR for Florida's Great Northwest. A service of the University of West Florida.",
  images: [
    {
      url: `${getServerSideURL()}/wuwf-logo.png`,
    },
  ],
  siteName: 'WUWF Public Media',
  title: 'WUWF Public Media',
}

export const mergeOpenGraph = (og?: Metadata['openGraph']): Metadata['openGraph'] => {
  return {
    ...defaultOpenGraph,
    ...og,
    images: og?.images ? og.images : defaultOpenGraph.images,
  }
}
