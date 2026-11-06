# Character home catalog

Eos Meridian is the original 67-home pilot. The eight catalogs in `worlds/` extend it to the remaining published, built-in residents. Each entry targets an existing private home belonging to a specific character version. Homes in shared households keep the character's room and shared address separate.

Home artwork is a one-time catalog asset, not something purchased when a user opens a home or makes a plan. A private planning location is provisioned for the visitor's account; it points to the approved image and supplies the same environment reference for photos and videos. The existing invitation, memory and relationship checks still apply when someone proposes a visit.

## Releasing a catalog change

1. Edit and validate the world catalog, then stage a **new** migration. Never regenerate SQL that has already been applied. Run `node --test scripts/world-homes-content.test.mjs scripts/world-homes-db.test.mjs`.
2. New homes stay hidden while their explicitly queued illustrations are generated. Inspect job state before retrying. A failed download does not mean the provider needs to generate a new image.
3. Run `node scripts/prepare-world-home-review.mjs WORLD`. Inspect every numbered sheet. Open individual originals where needed. Only after inspection, run `node scripts/approve-reviewed-world-homes.mjs WORLD SHEET_NUMBERS`. This records the actual image hashes in `reviewed/` and checks public originals and thumbnails.
4. Against the intended deployment, run `scripts/publish-reviewed-world-homes.sql` explicitly. It checks every current catalog entry and enables the eight worlds together. It excludes Eos, unpublished characters, historical versions and user-created homes.
5. Run `node scripts/verify-world-home-release.mjs --published` and `node scripts/smoke-world-home-visits.mjs`. The latter uses a fresh, disposable user and deletes it on exit. No customer conversations or wallet balances are used. Keep service credentials and local review intermediates out of source control.
