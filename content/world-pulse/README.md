# Authored World Pulse packs

Add one `<world-slug>.json` file for every published world listed in `reference/`. Each pack has an `events` array of exactly 200 complete incidents. References are a read-only snapshot of the published canonical roster and place catalog taken on 2026-10-01; refresh them against the authoritative catalog before release if any world, resident, or place changes.

Every event needs `slug`, stable `repeatIdentity`, immutable `schedulingRank` (0–199), `contentVersion`, `worldSlug`, `title`, `feedSummary`, `detailBody`, `eventType`, `locationSlug`, `significance` (0–1), `primaryCharacterSlug`, `participants`, `facts`, `contentRating: "standard"`, `cooldownDays: 30`, and optional `selectionWeight` and `tags`. An event with more than one participant also needs an authored `groupMessage`.

Each of one to four participants needs `characterSlug`, concrete `roleLabel`, distinctive `perspective`, `defaultDirectMessage`, `knownFactIds`, and optional `revealConstraints`. Every fact needs `id`, `text`, `userVisible`, and `knownBy` (participant slugs). Assign facts only to people who could actually know them. Private facts stay out of `detailBody`, `feedSummary`, user-visible facts, and suggested drafts. A participant's `knownFactIds` must exactly agree with the fact's `knownBy` list.

`schedulingRank` is a stable slot in a 30-day UTC rotation; edits must retain it and the repeat identity. The validator checks 200 ranks, 8 appearances and 2 leads per resident, all four participant sizes, reference slugs, structured knowledge, similarity, and a 90-day schedule. It is an editorial aid, not a substitute for reading at least ten incidents per world and each resident's coverage summary.

Run `pnpm world-pulse:validate -- --report` to write `validation-report.json`. Only after it passes, run `pnpm world-pulse:seed -- <review-output.sql>` to generate a reviewable transaction. The seed command does not connect to a database. Keep the server feature flag and per-world settings disabled until content, database checks, and manual client verification are complete.
