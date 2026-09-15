# Companion creator pass — 15 September 2026

## Live testing

Test account: test7@test.com. Completed all seven creation steps for Mira Vale QA, generated three portraits, selected Natural, edited biography/job, saved schedule and connection, selected Sora Table, finalized and opened chat.

The first finalization failed. A rolled-back SQL reproduction identified an ambiguous public_handle variable/column in kivelle_finalize_creator_draft. The narrow migration preserves the installed function, grants and unrelated changes. A transaction verified finalization and idempotent replay, then the browser retry succeeded.

A second test-only review fixture, Mira Scene QA, reused the same account's generated reference image without a second generation. Its first meeting opened at Sora Table as a shared scene. A greeting received a contextually consistent restaurant reply. The fixture deliberately tests the legacy/reference-path finalization branch too.

Ledger verification: one spend, subscription_delta -20, for the original three-image set. No additional finalization or greeting charge.

## Fixes

- Eliminate the database field ambiguity preventing finalization.
- Pass structured name/age/pronouns into the local foundation; retain the starting description in biography, not physical appearance.
- Retry portrait polling after transient failures, without overlapping polls or replacing unsaved editor values.
- Refresh the displayed credit balance from the generation response.
- Persist the review transition when leaving First meeting.
- Replace long home/work lists with existing popup selectors; expose radio checked states on web.
- Sign private custom companion portraits in relationship snapshots as well as discovery. Resolve missing avatar version props through the current store. Preserve signed artwork when presence/dialogue deltas omit it, while accepting explicit removals and changed identity versions.
- Start custom first meetings through the existing shared-scene system, with its normal 90-minute lifetime, participant registration and conversation metadata. Established conversations are not restarted. No changes to adult content routing or consent rules.

## Validation and release

- App TypeScript: passed.
- 896 app tests passed.
- 9 focused Deno creator/snapshot tests passed, including structured identity regression.
- Deno check: creator, companion, bootstrap passed.
- Production web export and auth configuration verification passed.
- Database migration: 20260915171111_creator_finalize_handle_ambiguity.
- Edge functions: creator 159, bootstrap 189, companion 161, persona 145, relationship 157, debug 180. Live bundles were patched narrowly to retain independent changes.
- Web release: 5e48f383-6088-461c-b5ac-edea0163f350.
- No native builds produced. Backend fixes apply immediately; native UI improvements need the next build.

Not exercised: camera/photo-library upload permissions or physical-device keyboard behavior. The two named QA companions remain only on the test account.
