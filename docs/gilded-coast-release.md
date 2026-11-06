# Gilded Coast release gate

Gilded Coast was initially authored with `published=false` and is now published in production. The content includes 36 adult residents, 42 locations across six districts, 90 directed relationships, 1,646 weekly schedule blocks, eight story scenarios, 24 experiences, ten recurring events, 200 routine World Pulse templates, and 15 major Pulse templates. The place-art pass gives all 42 locations their own images, including indoor venues; district fallbacks are no longer used for canonical coastal places.

## Apply in order

1. Run repository checks: `pnpm gilded:test`, `pnpm world-pulse:validate`, `pnpm world-pulse:major:validate`, `pnpm lint`, `pnpm typecheck`, `pnpm edge:typecheck`, `pnpm web:build`, `pnpm artwork:verify`, and `pnpm supabase:test`. Resolve any failure before publishing. Database tests require a running local Supabase database.
2. Apply the additive migrations in timestamp order: `20261002193000_gilded_coast_world_v1.sql`, `20261002193100_gilded_coast_world_pulse.sql`, `20261002193200_gilded_coast_major_world_pulse.sql`, and `20261002193300_gilded_coast_scenarios.sql`. Inspect counts while the world remains unpublished. The Pulse settings row remains disabled.
3. With the target project's Supabase credentials, run `pnpm media:sync-references -- --world=gilded-coast --apply`. The source images are under `apps/together/assets/`. Confirm that all 36 character, 42 distinct location, and one world reference asset are present and active. Every canonical coastal location must resolve to art named for its own slug.
4. Run `scripts/sql/gilded-coast-link-media.sql`. Its transaction checks the uploaded references before marking portraits and places ready. Verify representative indoor portraits and venue images in the target environment.
5. Deploy the compatible client and Edge Function revisions to staging. Test first meeting and repeat chat, story/scenario entry, direct and group conversations, event handoff and speaker knowledge boundaries, place selection, photo and video requests with a named character and location, world art on mobile, and adult content gates on each supported platform. Confirm consent and access rules still apply to sex-worker and pirate characters. A generated result should resemble the canonical portrait and selected place; a visual prompt must not force participation or location changes.
6. After the checks pass, run `scripts/sql/gilded-coast-publish.sql`. It rechecks roster, places, media, Pulse templates, and scenarios, then publishes the world and enables its Pulse settings. Check that new events publish on the expected cadence and that unrelated worlds' feeds remain unaffected.

## Rollback

Set `together_worlds.published=false` and `together_world_pulse_settings.enabled=false` for world `10000000-0000-4000-8000-000000000014`. This hides discovery and stops new global events without deleting templates, snapshots, user conversations, or purchased media. Restore publication only after the failing path is fixed and verified. Do not delete or rewrite applied migrations.

## Production release, 2026-10-02

The four Gilded Coast migrations were applied to project `mfysnlghlhxxcwnwpxog` after the major-Pulse schema migration. The 79 private reference records were uploaded and linked (36 portraits, 42 places, one world image). The public catalog publisher verified all 2,412 optimized variants, uploading 92 previously missing objects. The compatible Edge Functions and production web export were deployed; Cloudflare Worker version `da3b152f-6783-4f76-afb5-3872920a42ac` serves `kivelli.app`.

The guarded publish transaction passed and set `published=true` and Pulse `enabled=true`. The live catalog has 200 routine and 15 major templates, eight scenarios, and 36 residents. Routine scheduling reserved 400 occurrences across 60 days with no shortages; six were published on release day. Major scheduling reserved 15 incidents across 70 days with no shortages. The world hero and a resident portrait returned HTTP 200 from the public artwork catalog; the web routes returned HTTP 200 and the unauthenticated Pulse function returned its expected HTTP 401.

`pnpm gilded:test`, lint, typecheck, Edge typecheck, artwork verification, and the production web build passed. The local Supabase database test could not run because the local database was unavailable. Authenticated live chat, group, photo, video, and physical-device checks remain unverified; this release does not claim those checks passed. Existing iOS binaries do not contain the new client artwork mapping and need a separate native build for the complete visual experience.

## 2026-10-07 place pass

The place pass authors distinct public artwork for 33 coastal venues that previously reused district images. The location catalog now has 42 distinct place images. Source and additive production migrations also replace generic activity/lore text and publish hours for all ten coastal venues that lacked them. `scripts/sync-kivelle-reference-media.ts` requires each coastal photo reference to use its own slug image so photo and video prompts do not silently keep the old district reference. A new web or native client release is required for its artwork registry changes to appear in that client.
