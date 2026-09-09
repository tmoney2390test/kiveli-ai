# Calder's Run integration status

Updated 2026-09-09. This world is staged and unpublished.

## Artwork

All 152 release images have been generated and visually reviewed: one cover, 49 portraits, 53 locations, and 49 private homes. Exactly six images show the railway bridge: the cover, River Ward, The Railhead, Pike's Ferry, Bridge Works, and Tom Archer's portrait. The release maximum is ten across all asset categories.

The reviewed manifest records each file's SHA-256 and actual bridge visibility. Run `node scripts/calders-art-review.mjs check --release` before upload or publication. Changed files need renewed visual review. Artwork uses JPEG quality 90 with 4:4:4 chroma and original dimensions. The complete set is 72,151,316 bytes, down from 409,526,667 PNG bytes. Original PNGs remain outside the application asset bundle.

Location and home prompts remove the cover panorama. Only four location prompts intentionally allow the unfinished bridge. Home prompts focus inward. The client registers 49 portraits and 52 initially public location images; Crowcut and home interiors are not public map assets.

## Verification completed

- Source validation: 70 checks.
- Adapter: repeated import against production column types/check constraints, stable identities, private canon projection, local photo prompt isolation.
- Progress persistence: idempotency, stale version rejection, cross-account rejection, private state restrictions.
- Scheduling: seven domain tests covering travel, competing reservations, ferry/weather gates, private homes, Crowcut, unknown origins and invalid intervals.
- Stories: four domain tests covering current chapter scope, evidence gates and exclusive saved endings.
- Media discovery: all 103 world/portrait/location references exactly once, plus existing-world regression checks.
- App/domain type checks and 44 Edge Function checks.
- Production frontend export with correct public authentication configuration.
- Desktop/mobile onboarding against a staged catalog fixture: 47 initially available companions, spice badges, zero missing images/page errors/production writes.
- Earlier read-only production schedule simulation: 49 characters across seven days, zero gaps or overlaps.

## Before release

The Supabase CLI returned Unauthorized on 2026-09-09. Reauthenticate it before uploading reference media. The database connector remains available. No Calder frontend or Edge Function deployment has been made.

1. Finish reservation coverage for edited/rescheduled/group plans, concurrent travel reservations, and late scheduled-date starts.
2. Verify saved absences/relocations across presence, home context and correspondence; verify invitation/disclosure transitions against the authoring rules.
3. Reimport the final canonical visual contexts while the world remains unpublished.
4. Upload the reviewed references, bind character reference paths and update media readiness only after storage checks.
5. Run authenticated end-to-end chat, photos, voice, dates, stories, map and discovery checks against the final runtime.
6. Publish only after the remaining checks pass and deployment matches the reviewed commit.

Home interiors retain the existing private text-grounding policy. Their reviewed artwork is retained as authored assets and must not be exposed as public places.
