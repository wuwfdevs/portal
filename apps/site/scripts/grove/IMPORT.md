# Running the Grove import

The importer (`scripts/grove/import.ts`) copies WUWF's stories and their pictures, audio and video from Grove into the
site. It needs a machine with normal internet access: NPR's file hosts, the Supabase pooler (a direct Postgres
connection) and the Supabase Storage S3 endpoint. A locked-down cloud sandbox that only allows HTTPS through a proxy cannot
run the save step, because the proxy passes web traffic only, not Postgres.

Nothing here is destructive: every step can be stopped and run again. A story that is already in is left alone, a file
already in the library is reused, and a story whose files are not all downloaded is held, never saved with a broken picture.

## Once

1. Node `^22.23.4` or `>=24.22.1` and pnpm 10. Check out the branch, then `cd apps/site && pnpm install`.
2. Unzip the four census archives (`census-raw-001.zip` ... `004`) into one folder **outside the repository**, e.g.
   `~/grove/raw/001 ... 004`. These are the raw Grove pages; they are never committed.
3. Make a folder for downloaded files, also outside the repository: `~/grove/cache`. Budget tens of gigabytes: the library is
   about 2,500 pictures and 1,300 audio files.
4. A private env file outside the repository, e.g. `~/grove/staging.env` (never commit it):

   ```
   NODE_ENV=production
   # Session-mode pooler, as the app role. Staging shown; production has its own project ref and password.
   DATABASE_URL=postgresql://payload_app.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=no-verify
   PAYLOAD_SECRET=<any random 32+ characters; not used for anything the import keeps>
   S3_BUCKET=wuwf-site-files
   S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
   S3_REGION=us-east-1
   S3_ACCESS_KEY_ID=<that project's Storage S3 key>
   S3_SECRET_ACCESS_KEY=<that project's Storage S3 secret>
   ```

   Load it for a command with `set -a; source ~/grove/staging.env; set +a`.

## 1. Download the files (no database needed)

```bash
cd apps/site
pnpm exec tsx scripts/grove/import.ts --raw ~/grove/raw --cache ~/grove/cache --phase fetch
```

One file at a time, 3 seconds apart, neutral User-Agent, robots.txt honoured. About 3,830 files: 3 to 4 hours. Ctrl-C stops
cleanly; run it again to continue. It stops by itself if the disk runs low (`--min-free-gib`) or if NPR answers 403 five
times in a row (do not push on; ask the owner). `--kinds image` downloads pictures first. The summary at the end counts
`ok`, `missing` (the server says the file is gone), `refused` and `failed`; `--retry-failed` tries the failures again.

## 2. Rehearse on staging (a slice, not thousands of stories)

`--sample N` picks N stories spread evenly across the whole set, the same N every time. Use the same N in both phases.

```bash
set -a; source ~/grove/staging.env; set +a
pnpm exec tsx scripts/grove/import.ts --raw ~/grove/raw --cache ~/grove/cache --phase fetch --sample 40
pnpm exec tsx scripts/grove/import.ts --raw ~/grove/raw --cache ~/grove/cache --phase save  --sample 40 --allow-remote --dry-run
pnpm exec tsx scripts/grove/import.ts --raw ~/grove/raw --cache ~/grove/cache --phase save  --sample 40 --allow-remote
```

Then look at those stories on the staging site: pictures and audio load, the byline and section are right, the path matches
Grove's. Fix what is wrong before the full run.

### If files are missing from the bucket (staging)

The save phase now checks storage itself: before saving anything it writes, reads back and deletes one small object in the bucket
(and refuses a hosted database unless the S3 settings are complete and active), and after every file it asks the bucket for each
object the record needs. A file that did not arrive fails the story instead of counting it as saved. The first staging rehearsal
saved 38 stories whose files never reached the bucket (one Payload context object was shared by every call, and the storage plugin
leaves state on it, so uploads stopped after the first; see the comment in `import.ts`). To repair records left like that:

```bash
set -a; source ~/grove/staging.env; set +a
pnpm exec tsx scripts/grove/staging-repair-files.ts --cache ~/grove/cache            # dry run: reports, changes nothing
pnpm exec tsx scripts/grove/staging-repair-files.ts --cache ~/grove/cache --apply    # re-uploads the missing files, same names
```

It runs only against the staging project (an allow-list of one), and deletes nothing.

### After the converter changes: repairing bodies that are already in (staging)

The importer leaves a story that is already in alone, so a story saved before a converter change keeps its old body, however good
the converter has become. `repair-bodies.ts` fixes that for the bodies only: it re-converts each story's Grove page and replaces the
body when the stored one still holds markup typed as words (`<i>Frontiers in Psychology</i>` showing on the page) or has a
"RELATED:" / "Support Local Stories." line as a plain paragraph (it becomes a link-line block).

```bash
set -a; source ~/grove/staging.env; set +a
pnpm exec tsx scripts/grove/repair-bodies.ts --raw ~/grove/raw --report ~/grove/repair-dry.json     # DRY RUN: lists what it would change, changes nothing
pnpm exec tsx scripts/grove/repair-bodies.ts --raw ~/grove/raw --only <part of a story's path> --apply   # one story first, then look at it
pnpm exec tsx scripts/grove/repair-bodies.ts --raw ~/grove/raw --report ~/grove/repair-done.json --apply
```

Before `--apply`: the staging site must be running the code that has the link-line block, or the repaired lines have nothing to
render them. After it: the changed pages refresh when the site revalidates them (the script cannot run Next's cache), so
redeploy or revalidate staging.

What it will not do, and says so in the report: it never touches any field but the body; never creates or fetches a file (every
picture or audio file the new body uses must already be in the library); skips a story an editor has changed since the import
(more than the one version the importer saved); skips a story whose words a reader reads would change; skips a story with no Grove
page among `--raw`. Running it again after a repair finds nothing left to do. It runs only against the staging project (an
allow-list of one; `NODE_ENV=production` is required for a hosted database), prints no password, and a failed story is reported
and the run goes on.

Rehearsed before it was written down (2026-11-03, on a scratch database, with 224 real census stories saved the way the old
converter saved them): 63 would be repaired, 154 needed nothing; after `--apply`, every repaired story read the same words,
had no typed markup left and had exactly two versions, every other story was byte-for-byte unchanged with one version, and a second
run found nothing to repair. The same 63 stories were found by an independent count.

## Before any import: check that nothing was lost in conversion

The converter's report counts statuses ("clean", "review"), and a status cannot show that text arrived: for weeks every episode converted "clean" with no words at all. `check-fidelity.ts` reads each Grove page **without the converter's code** and checks the story against it, so a converter that reads the wrong field, drops a paragraph or loses a picture is caught by something that does not share its mistake. Nothing is fetched and nothing is written to a database.

```bash
pnpm exec tsx scripts/grove/check-fidelity.ts --raw ~/grove/raw/001 --raw ~/grove/raw/002 --raw ~/grove/raw/003 --raw ~/grove/raw/004 --out ~/grove/fidelity.json
```

It checks, per story: the body **paragraph by paragraph** (a paragraph the page had and the story lacks is a failure, and a word count alone would miss half a paragraph), every picture and audio or video file (each must be a file the story will fetch), and the path, Grove id, title and publish date. **Fail** (exit code 1): `body.empty`, `body.paragraph-missing`, `body.words-short`, `image.missing`, `audio.missing`, `identity.*`. **Warn** (does not fail the run): `links.not-found` (a link the story does not carry; the converter reports the ones it drops on purpose) and `source.polluted-text` (Grove's own corrupted embed JSON, which the converter keeps as it was). Run it on every page set before an import; **the number to watch is the failures, which should be 0.** Result on 2026-11-04 over 2,936 real stories: 2,915 pass, 21 warn, 0 fail; with the old episode bug put back, it fails all 15 census episodes.

## 3. The full import into production (owner's approval first)

Production is this project's real database. Apply its migrations deliberately first (`pnpm payload migrate` with the production
`DATABASE_URL`), with the production S3 keys in its env file, then run the fetch (already done) and the save without
`--sample`:

```bash
set -a; source ~/grove/production.env; set +a
pnpm exec tsx scripts/grove/import.ts --raw ~/grove/raw --cache ~/grove/cache --phase save --allow-remote
```

The report (`import-report.json` in the cache folder) lists what was saved, what was already there, which stories are held and
why, and every decision the importer made for the owner to review (stories filed by path, credited to "WUWF Staff", extra
byline names). A held story is fixed or decided by a person, then the same command is run again.

## 4. After the import: move shows to /shows (staging first, then production)

The import keeps Grove's exact show addresses (`/show/<slug>`, `/podcast/<slug>`, and each episode under its show). Then, in one
deliberate step, `scripts/shows/consolidate.ts` moves every show and its episodes to `/shows/<slug>` and `/shows/<slug>/<date>/<episode>`;
each old address leaves a permanent redirect. Dry run first; read the list; try one show; then all:

```bash
set -a; source ~/grove/staging.env; set +a
pnpm exec tsx scripts/shows/consolidate.ts                          # dry run: every move, nothing written
pnpm exec tsx scripts/shows/consolidate.ts --only the-ecominutes --apply
pnpm exec tsx scripts/shows/consolidate.ts --apply --report ~/grove/shows-moved.json
```

Then open a few old addresses on the preview (each should answer 308 to its `/shows/...` address) and a feed at
`/podcast/<slug>/rss.xml` (it stays at that address; its links now point at `/shows/...`). Redeploy or revalidate so cached pages at the
old addresses give way to their redirects. On production the same commands, with the production env file and `--production` added.
The script skips and lists: two shows that would share an address (`/show/x` and `/podcast/x`: rename one first), an address another
record already has, and an episode not under its show's address (left where it is). It is safe to run again.

## Author profiles follow the stories

A profile is saved only when a story in the run credits that person (matched on `/people/<slug>`). Other people (NPR or other-station contributors who never wrote for WUWF) are skipped by rule and counted as `authorsSkippedByRule` in the report, not held. Their `/people/` addresses are not carried over; owner to decide whether they redirect.
