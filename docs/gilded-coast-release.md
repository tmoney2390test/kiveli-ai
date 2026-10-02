# Gilded Coast release gate

Gilded Coast is authored and staged with `published=false`. Its content migration must remain hidden until the reference assets and server checks pass. The new content includes 36 adult residents, 42 locations across six districts, 90 directed relationships, 1,646 weekly schedule blocks, eight story scenarios, 24 experiences, ten recurring events, 200 routine World Pulse templates, and 15 major Pulse templates. The app bundle has 36 resident portraits (including indoor portraits), nine location images with district fallbacks, and a world hero image.

## Apply in order

1. Run repository checks: `pnpm gilded:test`, `pnpm world-pulse:validate`, `pnpm world-pulse:major:validate`, `pnpm lint`, `pnpm typecheck`, `pnpm edge:typecheck`, `pnpm web:build`, `pnpm artwork:verify`, and `pnpm supabase:test`. Resolve any failure before publishing. Database tests require a running local Supabase database.
2. Apply the additive migrations in timestamp order: `20261002193000_gilded_coast_world_v1.sql`, `20261002193100_gilded_coast_world_pulse.sql`, `20261002193200_gilded_coast_major_world_pulse.sql`, and `20261002193300_gilded_coast_scenarios.sql`. Inspect counts while the world remains unpublished. The Pulse settings row remains disabled.
3. With the target project's Supabase credentials, run `pnpm media:sync-references -- --world=gilded-coast --apply`. The source images are under `apps/together/assets/`. Confirm that all 36 character, 42 location, and one world reference asset are present and active. Each location has its own reference record even when it intentionally shares district artwork.
4. Run `scripts/sql/gilded-coast-link-media.sql`. Its transaction checks the uploaded references before marking portraits and places ready. Verify representative indoor portraits and venue images in the target environment.
5. Deploy the compatible client and Edge Function revisions to staging. Test first meeting and repeat chat, story/scenario entry, direct and group conversations, event handoff and speaker knowledge boundaries, place selection, photo and video requests with a named character and location, world art on mobile, and adult content gates on each supported platform. Confirm consent and access rules still apply to sex-worker and pirate characters. A generated result should resemble the canonical portrait and selected place; a visual prompt must not force participation or location changes.
6. After the checks pass, run `scripts/sql/gilded-coast-publish.sql`. It rechecks roster, places, media, Pulse templates, and scenarios, then publishes the world and enables its Pulse settings. Check that new events publish on the expected cadence and that unrelated worlds' feeds remain unaffected.

## Rollback

Set `together_worlds.published=false` and `together_world_pulse_settings.enabled=false` for world `10000000-0000-4000-8000-000000000014`. This hides discovery and stops new global events without deleting templates, snapshots, user conversations, or purchased media. Restore publication only after the failing path is fixed and verified. Do not delete or rewrite applied migrations.

## Current verification limit

The content, app, and Edge checks have passed locally, but a local Supabase database was unavailable (`127.0.0.1:54322` refused connections). The private reference upload, media-link transaction, and live photo/video/group checks have not been performed. The world must remain unpublished until those checks pass.
