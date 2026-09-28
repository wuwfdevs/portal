# Resources screenshots

Captures the screenshots Resources guides show, from a running portal, so a
guide's images come from the real screen rather than being made by hand.

```
npm run screenshots:resources
```

For each entry in `shots.ts` it visits the route at 1280×800, captures the
element marked `data-help-shot="<name>"` (or the whole viewport), uploads it to
the `resources-media` bucket at `shots/<screen_key>/<name>.png`, and updates the
matching `rc_media` row by `(screen_key, name)`. The row's id never changes, so
every guide that references it shows the new capture with no edit.

Needs, in the environment or `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY` — for **preview** (or a local instance). The script
  refuses the production project: guides show seed data only, so no real
  sources, guests, or donors appear in one.
- `SCREENSHOTS_BASE_URL` — the portal to capture, e.g. a preview deployment or
  `http://localhost:3000`, pointed at the same database.
- `SCREENSHOTS_EMAIL` — a seeded user who can open every tool a shot visits. The
  secret key mints its sign-in link, so no inbox is needed.
- `SCREENSHOTS_PRODUCTION_SUPABASE_URL` and `SCREENSHOTS_PRODUCTION_SECRET_KEY`
  (optional) — also store each capture in production's bucket and `rc_media`,
  so production's guides show it. The capture itself still comes from preview.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE` (optional) — a Chromium to use. Otherwise
  `playwright-core` looks in its own browser cache; `npx playwright-core install
chromium` fills it.

Without the required variables the run skips. It is not part of `npm test`.

## Adding a shot

1. Put `data-help-shot="<name>"` on the element, in the same change as the
   screen it shows.
2. Add an entry to `shots.ts`, with alt text that says what the image shows.
3. Declare the `rc_media` row in that change's migration with a fixed id
   (`screen_key`, `name`, `object_path`, `alt`, `source = 'release'`), and
   reference the id from the guide's `figure`. Until the script runs, the guide
   shows the alt text in a placeholder.
4. After the migration is applied to both projects, run the script with the
   production variables set.

When a change alters a screen existing shots cover, list those shots in the PR
description so they're re-captured.
