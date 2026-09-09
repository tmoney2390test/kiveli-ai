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

## Launch checks

Supabase authentication was restored through the existing browser sign-in on 2026-09-09. All 103 world/location/character references have been uploaded and verified against reviewed file hashes and accessible image responses. The final canonical import has completed while the world remains hidden.

Reservation coverage now includes edited/rescheduled/group plans, synchronized dates, database serialization, late starts, and character-specific date eligibility. The database guard migration is applied as `20260909170718_calders_reservation_guards.sql`. Full app/domain/gateway tests, 24 content/database tests, and 18 focused Edge Function tests pass. Production-canon simulations cover all 49 characters across seven days with no gaps or overlaps, plus saved relocations, absences and severe-weather travel chains without production writes.

Saved relocations retain private sleep and daily routines at the new base, and home grounding drops the former home. Snapshot presence resolves current Calder schedules on first load and after saved changes. Home and private-event access remain subject to specific saved invitations; private records remain gated.

Before publication: deploy the reviewed frontend and Edge Functions, run authenticated smoke checks, then execute `content/calders-run/publish.sql` and verify discovery, chat, media, voice, places and story controls on the live release. The publication SQL checks catalog counts and private storage bindings atomically.

Home interiors retain the existing private text-grounding policy. Their reviewed artwork is retained as authored assets and must not be exposed as public places.
