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
