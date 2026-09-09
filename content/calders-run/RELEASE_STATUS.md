# Calder's Run integration status

Updated 2026-09-09. Calder's Run is published and live on kivelli.app.

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

## Launch checks

All 103 world/location/character references have been uploaded and verified against reviewed file hashes and accessible image responses. The final canonical import completed while the world was hidden, followed by the atomic publication checks and publication transaction.

Reservation coverage now includes edited/rescheduled/group plans, synchronized dates, database serialization, late starts, and character-specific date eligibility. The database guard migration is applied as `20260909170718_calders_reservation_guards.sql`. Full app/domain/gateway tests, 24 content/database tests, and 18 focused Edge Function tests pass. Production-canon simulations cover all 49 characters across seven days with no gaps or overlaps, plus saved relocations, absences and severe-weather travel chains without production writes.

Saved relocations retain private sleep and daily routines at the new base, and home grounding drops the former home. Snapshot presence resolves current Calder schedules on first load and after saved changes. Home and private-event access remain subject to specific saved invitations; private records remain gated.

The production frontend and Edge Functions are deployed from release code `cd22beb64d390c1c8b46213f2db284a0ca1ed2f6`. Cloudflare gateway version: `0fdf1446-0bd2-4886-8830-4bdee3b2e627`. The publication SQL checked catalog counts and private storage bindings atomically before publishing all 49 companions and the world. Initially, 47 companions are discoverable; Cole and Silas remain gated by story progress.

Authenticated production smoke checks passed for account bootstrap, discovery, meeting Dr. Lucia Salcedo, fresh presence, place lookup, Crowcut access denial, 14 stories, saved start/pause choices, 18 character-appropriate date options, a real chat response, and voice-session initialization/closure. The test portrait completed in approximately 33 seconds; its signed image returned HTTP 200 and the rendered 1824 x 2288 image was visually inspected. The account's previous active companion was restored.

Voice verification covered session setup and closure, not an audible two-way call. Date verification covered live availability plus database/runtime reservation tests, not a complete live date. The general and native CI checks passed on the deployed code; the isolated database workflow was still running when this release record was written.

Home interiors retain the existing private text-grounding policy. Their reviewed artwork is retained as authored assets and must not be exposed as public places.
