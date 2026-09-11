# On-demand catalog artwork

## Scope and behavior

Built-in character portraits, secondary profile photos, world artwork and location
backgrounds resolve through the existing registries. They now return Expo Image
sources pointing to immutable optimized WebP display copies, rather than native
`require()` asset IDs. World selection, portrait keys, composition and media
generation's canonical reference images are unchanged.

Display images retain their aspect ratio, use quality 86 and a maximum 1920-pixel
long edge (never upscale). Avatars use separate 384-pixel/quality-80 thumbnails.
Original source files remain untouched in Git and private reference storage.
The welcome/sign-in hero has a local 1440-pixel WebP copy (~112 KB). Branding,
membership artwork, fonts and neutral placeholders remain bundled.

Expo Image's existing memory/disk cache handles on-demand downloads and eviction.
There is no whole-catalog prefetch or new unbounded file cache. CatalogImage adds
a neutral local fallback on failed catalog downloads and retries on foreground /
web reconnection. Private/custom images retain their original error handling,
authorization, signed URLs and cache behavior. Previously cached catalog artwork
can display offline; artwork never downloaded needs connectivity.

## Public/private boundary

`kivelli-catalog` is a dedicated **public presentation-only** Supabase Storage
bucket in project `mfysnlghlhxxcwnwpxog`. Its contents are built-in artwork already
distributed in public web/native assets. No generated media, uploads, user data,
private reference images or signed URLs are accepted by the publishing script.
Do not change existing private buckets or add client write policies. Existing
world visibility/early-access and native visual-policy checks still run normally;
the catalog is presentation artwork, not an entitlement or media authorization API.

Uploads require existing server-only credentials. Public URLs contain content
hashes, have a one-year cache lifetime, and are uploaded without replacement.
Never prune old objects as part of a release: already installed native versions
still reference them. Authenticated/anonymous app clients cannot modify objects.

## Updating the catalog

1. Add/review source artwork and its existing registry entry using
   `catalogArtwork('characters/world/slug.jpg')` (or the other allowed categories).
2. Run `pnpm artwork:generate`. This writes the checked-in manifest, local startup
   derivative, and ignored `.codex-temp/catalog-artwork/` display copies.
3. Run `pnpm artwork:verify`, lint, typecheck and tests. CI verifies every source
   hash and registry mapping and rejects missing/stale entries.
4. With `SUPABASE_URL` and `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` supplied
   through the authenticated deployment environment, run `pnpm artwork:publish`.
   It creates the dedicated bucket if absent, refuses to expose an existing private
   bucket, never overwrites an object, and fetches/verifies each published checksum.
   Retry is safe. Do not print credentials or put them in EXPO_PUBLIC configuration.
5. Publish clients only after all current manifest objects verify. Regenerate and
   publish first when a source changes; old content-hash objects stay available.

Bucket creation is Storage API configuration, not a database schema migration.
No historical migration reconciliation, reference migration or backend function
deployment is required. The existing gateway serves the updated web export;
there is no new Worker route or binding.

## Build and release gates

`expo export --platform android --platform ios --dump-assetmap --output-dir
dist-native-size`, followed by `pnpm native:asset-budget`, verifies the actual
Metro dependency graph. It rejects packaged catalog directories and enforces an
8 MiB asset budget. This gate is part of CI alongside existing required checks.
`.easignore` also excludes original catalog directories from build-context uploads;
startup/branding files remain. Originals are not deleted from the repository.

Baseline production AAB: version code 6 / EAS build
`7b68a4a8-ce1f-4aac-9648-4e0691405089`, 533,097,239 bytes (508.4 MiB).
Its ZIP directory contained 445,959,625 compressed resource bytes, including
367 portraits, 387 secondary photos and 396 location backgrounds.
Initial new Android/iOS export: 46 unique asset files / 4,454,132 bytes (4.25 MiB),
no catalog art. This is an **asset measurement**, not a claimed final AAB or
per-device Play download size. Keep symbols and all supported CPU architectures;
removing diagnostic/support data is not necessary to obtain the main saving.

Both platforms require a new installed binary to recover space occupied by old
bundled assets. A website deployment or OTA update cannot shrink an installed
old binary. Build the next Android AAB and inspect its actual ZIP size; use Play
Console/bundletool separately for per-device download estimates. Do not silently
promote an internal/test artifact to a public store release.

Rollback: restore the previous web deployment / previous native release using the
normal release process. Leave catalog objects in place; rollback requires no data
deletion. Previously downloaded public artwork cannot be revoked retroactively.
