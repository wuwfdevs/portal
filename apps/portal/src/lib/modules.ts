/**
 * The module manifest: what each Portal tool IS, as code.
 *
 * A module is a tool with its own route segment, prefixed tables and `lib/<module>/`
 * folder. Its identity is `tools.key` in the database; this file adds what the
 * database cannot hold and a reviewer must see change in a diff — what a module
 * depends on, which routes it serves without a session, and which environment
 * variables it needs.
 *
 * It is a static list, not a loader. Nothing here registers, discovers or loads
 * anything (CLAUDE.md "Modules"). Today nothing reads `requires`, `integrates` or `env`
 * at runtime either: they are declarations that `modules.test.ts` checks against the
 * migrations and the source, so a dependency can no longer exist without being written
 * down. Later work reads them (the /admin/tools toggle refusing to break a hard
 * dependency, `canUseTool`, a missing-configuration panel).
 *
 * Ownership split:
 * - here (code): `key`, `requires`, `integrates`, `publicRoutes`, `env`
 * - `public.tools` (database, station-controlled): `enabled`, `default_access`,
 *   display name and description, `sort_order`, `status`
 * - `tool_access` / `tool_roles`: who may use a module
 *
 * This file must stay importable from anywhere, including tests and the client: no
 * imports, no `server-only`, nothing from a tool's folder.
 */

export type ModuleEnvVar = {
  /** The environment variable's name. */
  name: string;
  /** What breaks or is unavailable without it. */
  for: string;
  /**
   * True when the module cannot do its core job without it. Advisory until the
   * missing-configuration panel reads it; false means a feature degrades.
   */
  required: boolean;
};

export type ModuleManifestEntry = {
  /** Equals `public.tools.key`, the authorization identity. */
  key: string;
  /**
   * Hard dependencies: a foreign key into the other module's tables, or data this
   * module cannot work without. A module cannot be enabled without these.
   */
  requires: readonly string[];
  /**
   * Soft integrations: links, hand-offs or reads that must disappear when the companion
   * is unusable. Shown only when `canUseTool()` says yes (not yet implemented).
   */
  integrates: readonly string[];
  /** Routes served without a session. Each must be in middleware's PUBLIC_PATHS. */
  publicRoutes: readonly string[];
  /** Environment variables specific to this module. Platform-wide ones are not listed. */
  env: readonly ModuleEnvVar[];
};

export const MODULES: readonly ModuleManifestEntry[] = [
  {
    key: "editorial-planning",
    requires: [],
    integrates: [],
    publicRoutes: [],
    env: [],
  },
  {
    key: "transcription",
    requires: [],
    integrates: [],
    publicRoutes: ["/api/transcription/webhook"],
    env: [
      { name: "ASSEMBLYAI_API_KEY", for: "transcribing audio", required: true },
      {
        name: "TRANSCRIPTION_WEBHOOK_SECRET",
        for: "accepting AssemblyAI completion callbacks",
        required: true,
      },
      { name: "MISTRAL_API_KEY", for: "reading scanned PDFs (OCR)", required: false },
      { name: "OPENAI_API_KEY", for: "semantic search over transcripts", required: false },
    ],
  },
  {
    key: "remote-interview",
    requires: [],
    integrates: [],
    publicRoutes: ["/join"],
    env: [
      { name: "DAILY_API_KEY", for: "creating interview rooms", required: true },
      {
        name: "DAILY_RECORDINGS_BUCKET_NAME",
        for: "storing cloud recordings (needs the bucket region and role ARN too)",
        required: false,
      },
      { name: "DAILY_RECORDINGS_BUCKET_REGION", for: "storing cloud recordings", required: false },
      {
        name: "DAILY_RECORDINGS_ASSUME_ROLE_ARN",
        for: "storing cloud recordings",
        required: false,
      },
    ],
  },
  {
    key: "audience-listening",
    requires: [],
    // Send an answer to Sourcework. The only foreign key between the two
    // (al_answers.transcription_project_id) is `on delete set null`, so it is soft.
    integrates: ["transcription"],
    publicRoutes: ["/listen"],
    env: [],
  },
  {
    key: "roadmap",
    requires: [],
    integrates: [],
    publicRoutes: [],
    env: [],
  },
  {
    key: "academic-partnerships",
    requires: [],
    integrates: [],
    publicRoutes: ["/partner"],
    env: [],
  },
  {
    key: "log",
    requires: [],
    integrates: [],
    publicRoutes: ["/log-offline-sw.js"],
    env: [
      { name: "NPR_CDS_TOKEN", for: "importing the NPR schedule", required: false },
      { name: "FNE_FEED_URL", for: "the Florida News Exchange feed", required: false },
      { name: "WEATHER_LATITUDE", for: "the weather read (needs longitude too)", required: false },
      { name: "WEATHER_LONGITUDE", for: "the weather read", required: false },
      { name: "OPENAI_API_KEY", for: "importing a program log with AI", required: false },
    ],
  },
  {
    key: "underwriting",
    // Traffic and On Air are one unit at the database level: foreign keys in both
    // directions, columns added to each other's tables, and Traffic's placement API
    // is implemented as log_* functions.
    requires: ["log"],
    integrates: [],
    publicRoutes: [],
    env: [{ name: "OPENAI_API_KEY", for: "importing an agreement with AI", required: false }],
  },
  {
    key: "editorial-inquiry",
    // Foreign key to ep_pillars, plus reads of pillars and criteria through its own RLS.
    // Hard until decision D6 says otherwise.
    requires: ["editorial-planning"],
    integrates: [],
    publicRoutes: [],
    env: [{ name: "OPENAI_API_KEY", for: "growing the question tree", required: true }],
  },
  {
    key: "resources",
    requires: [],
    integrates: [],
    publicRoutes: [],
    env: [{ name: "OPENAI_API_KEY", for: "searching guides by meaning", required: false }],
  },
  {
    key: "bookings",
    requires: [],
    // Two of its functions read Traffic and On Air tables (airtime commitments, avails).
    integrates: ["underwriting", "log"],
    publicRoutes: ["/book"],
    env: [],
  },
  {
    key: "website",
    requires: [],
    integrates: [],
    publicRoutes: [],
    env: [
      { name: "WEBSITE_ORIGIN", for: "the site the hand-off sends people to", required: true },
      {
        name: "WEBSITE_IDENTITY_SECRET",
        for: "signing the sign-in token",
        required: true,
      },
    ],
  },
];

export const MODULE_KEYS: readonly string[] = MODULES.map((entry) => entry.key);

export function getModule(key: string): ModuleManifestEntry | undefined {
  return MODULES.find((entry) => entry.key === key);
}
