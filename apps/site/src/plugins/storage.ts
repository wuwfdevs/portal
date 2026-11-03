import { s3Storage } from '@payloadcms/storage-s3'

/**
 * Where uploaded files live. Locally, and in tests, nothing is configured and files stay on disk (`public/media`).
 * In a hosted environment set the S3_* variables (Supabase Storage speaks the S3 protocol) and every upload collection
 * stores there instead, so the library survives a redeploy and is shared by every instance.
 *
 *   S3_BUCKET             bucket name (required to turn this on)
 *   S3_ENDPOINT           e.g. https://<project-ref>.storage.supabase.co/storage/v1/s3
 *   S3_REGION             the project's region, e.g. us-east-1
 *   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY   S3 access keys from the Supabase project's Storage settings (server only)
 *
 * `clientUploads` sends files from the editor's browser straight to the bucket: Vercel refuses a server upload over
 * 4.5 MB, and a station recording is far bigger. The bucket must allow CORS PUT from the site's address.
 *
 * `alwaysInsertFields` keeps the database schema the same whether or not storage is configured, so one set of migrations
 * serves every environment.
 */
const bucket = process.env.S3_BUCKET

export const storagePlugin = s3Storage({
  enabled: Boolean(bucket),
  alwaysInsertFields: true,
  bucket: bucket ?? 'not-configured',
  clientUploads: true,
  collections: { media: { prefix: 'media' }, audio: { prefix: 'audio' }, video: { prefix: 'video' }, 'event-submission-images': { prefix: 'event-submission-images' } },
  config: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '' },
  },
})
