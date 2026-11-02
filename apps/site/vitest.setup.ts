// Load .env files
import 'dotenv/config'

// Integration tests write real rows through Payload's Local API. They run against their own database,
// never the development one, and refuse to run against anything that is not on this machine.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://wuwf@127.0.0.1:5433/wuwf_site_test'
process.env.PAYLOAD_SECRET ??= 'test-only-secret-0123456789abcdef0123456789abcdef'

const host = new URL(process.env.DATABASE_URL).hostname
if (!['localhost', '127.0.0.1', '::1', 'db'].includes(host)) {
  throw new Error(`Refusing to run integration tests against a non-local database (${host}).`)
}
