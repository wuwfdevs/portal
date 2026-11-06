# Fonts

Self-hosted so the build never depends on Google's font CDN (the Portal hit failed production builds from
`next/font/google`). Both families are SIL Open Font License 1.1 and may be redistributed.

- Source Sans 3 (400, 600, 700) and Source Serif 4 (400, 600, 700): the same files the Portal ships.
- Source Serif 4 italic (400, 700): Fontsource's `@fontsource/source-serif-4`, latin subset, for brand names
  (The Voyager, Unearthing Florida) and captions.

Add a weight by downloading it here, never by reaching for `next/font/google`.

Show themes (phase 7a; only loaded on a themed show's pages, `src/lib/shows/themes.ts`):

- League Gothic (400) and Lora (400, 400 italic, 700): Barefoot Mary's label and body faces, from Fontsource
  (`@fontsource/league-gothic`, `@fontsource/lora`), latin subset. Both SIL Open Font License 1.1.
- Barefoot Mary's display face, **Chenier**, is not here: it is a custom font whose licence for web use on wuwf.org
  has not been confirmed. Until the owner supplies a licensed file, the show's display text falls back to Lora.
