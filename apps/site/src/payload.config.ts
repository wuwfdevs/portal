import { postgresAdapter } from '@payloadcms/db-postgres'
import sharp from 'sharp'
import path from 'path'
import { buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

import { ArchiveItems } from './collections/ArchiveItems'
import { AudienceProfiles } from './collections/AudienceProfiles'
import { Memberships } from './collections/Memberships'
import { MemberFeeds } from './collections/MemberFeeds'
import { Seasons } from './collections/Seasons'
import { Audio } from './collections/Audio'
import { Categories } from './collections/Categories'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Sections } from './collections/Sections'
import { Users } from './collections/Users'
import { Video } from './collections/Video'
import { Contributors } from './collections/Contributors'
import { Sites } from './collections/Sites'
import { Clips } from './collections/Clips'
import { Artists } from './collections/Artists'
import { Performances } from './collections/Performances'
import { UnearthingHub } from './UnearthingHub/config'
import { VoyagerHub } from './VoyagerHub/config'
import { RadioLiveHub } from './RadioLiveHub/config'
import { EventCategories } from './collections/Events/EventCategories'
import { EventSubmissionImages } from './collections/Events/EventSubmissionImages'
import { SubmissionRateLimits } from './collections/Events/SubmissionRateLimits'
import { Events } from './collections/Events/Events'
import { LiveUpdates } from './collections/Live/LiveUpdates'
import { PortalSignIns } from './collections/PortalSignIns'
import { PublishingIdentities } from './collections/PublishingIdentities'
import {
  Fellowships,
  Productions,
  Series,
  Sponsors,
  UnderwritingAgreements,
} from './collections/Underwriting'
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { Homepage } from './Homepage/config'
import { SiteSettings } from './globals/SiteSettings'
import { SupportPage } from './SupportPage/config'
import { plugins } from './plugins'
import { storagePlugin } from './plugins/storage'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL } from './utilities/getURL'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    components: {
      // The `BeforeLogin` component renders a message that you see while logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below.
      beforeLogin: ['@/components/BeforeLogin'],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        {
          label: 'Mobile',
          name: 'mobile',
          width: 375,
          height: 667,
        },
        {
          label: 'Tablet',
          name: 'tablet',
          width: 768,
          height: 1024,
        },
        {
          label: 'Desktop',
          name: 'desktop',
          width: 1440,
          height: 900,
        },
      ],
    },
  },
  // This config helps us configure global or default features that the other editors can inherit
  editor: defaultLexical,
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL },
    // Dev pushes schema changes; production only runs committed migrations (src/migrations).
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  collections: [
    Pages,
    Posts,
    LiveUpdates,
    Events,
    EventCategories,
    SubmissionRateLimits,
    EventSubmissionImages,
    Media,
    Audio,
    Video,
    Clips,
    Seasons,
    ArchiveItems,
    Artists,
    Performances,
    Sections,
    Categories,
    Contributors,
    Sites,
    PublishingIdentities,
    Fellowships,
    Series,
    Productions,
    Sponsors,
    UnderwritingAgreements,
    Users,
    PortalSignIns,
    AudienceProfiles,
    Memberships,
    MemberFeeds,
  ],
  cors: [getServerSideURL()].filter(Boolean),
  globals: [Header, Footer, Homepage, SiteSettings, SupportPage, UnearthingHub, VoyagerHub, RadioLiveHub],
  plugins: [...plugins, storagePlugin],
  secret: process.env.PAYLOAD_SECRET,
  sharp,
  // Payload's default is 20 MiB per file and 50 MiB per request, which rejects (HTTP 413) a long station recording.
  // Raised so audio fits. On Vercel a server upload is capped at 4.5 MB regardless, so production uploads must go
  // straight from the browser to storage (the storage adapter's `clientUploads`) once that adapter is set up.
  upload: {
    limits: { fileSize: 150 * 1024 * 1024 },
    requestSizeLimit: 160 * 1024 * 1024,
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  jobs: {
    access: {
      run: ({ req }: { req: PayloadRequest }): boolean => {
        // Allow logged in users to execute this endpoint (default)
        if (req.user) return true

        const secret = process.env.CRON_SECRET
        if (!secret) return false

        // If there is no logged in user, then check
        // for the Vercel Cron secret to be present as an
        // Authorization header:
        const authHeader = req.headers.get('authorization')
        return authHeader === `Bearer ${secret}`
      },
    },
    tasks: [],
  },
})
