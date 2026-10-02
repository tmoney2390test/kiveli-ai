# Authored World Pulse packs

## Rollout status (2026-10-02)

Character-level World Pulse 2.0 and major incidents are separate required catalogs. All eight published worlds now have 200 checked-in resident incidents and 15 seedable major incidents. The content and 90-day schedule validators pass for every world. Database migration tests and full editorial review are still required before an all-world enablement; authored counts and simulated scheduling alone are not a production release.

| World | Residents | Routine | Appearances min–max | Leads min–max | Solo / duo / trio / four | Major |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Calder's Run | 49 | 200 | 10–11 | 4–5 | 50 / 49 / 50 / 51 | 15 |
| Eos Meridian | 47 | 200 | 10–12 | 4–5 | 47 / 48 / 51 / 54 | 15 |
| Juniper City | 38 | 200 | 8–9 | 4–7 | 152 / 12 / 12 / 24 | 15 |
| Neon Kyo | 45 | 200 | 10–13 | 4–6 | 50 / 50 / 50 / 50 | 15 |
| NorthVale | 45 | 200 | 10–13 | 4–7 | 50 / 50 / 50 / 50 | 15 |
| Port Vervelle | 44 | 200 | 10–14 | 4–7 | 50 / 50 / 50 / 50 | 15 |
| Vespormoor | 47 | 200 | 10–12 | 4–5 | 50 / 50 / 50 / 50 | 15 |
| Vharadren | 52 | 200 | 8–11 | 3–4 | 52 / 44 / 52 / 52 | 15 |

For each routine catalog, the 90-day simulation produces 45 six-event, 30 seven-event, and 15 eight-event UTC days. Minimum repeat spacing is 720 hours; shortages are zero. The builder for the six new source packs is `pnpm world-pulse:build:resident -- <world-slug>`. Source files contain the individual incidents; generated JSON is the seed input. Review participant actions whenever changing a grouped brief, since a valid roster does not by itself prove that each person's action fits their role.

Add one `<world-slug>.json` file for every published world listed in `reference/`. Each pack has an `events` array of exactly 200 complete incidents. References are a read-only snapshot of the published canonical roster and place catalog taken on 2026-10-01; refresh them against the authoritative catalog before release if any world, resident, or place changes.

Every event needs `slug`, stable `repeatIdentity`, immutable `schedulingRank` (0–199), `contentVersion`, `worldSlug`, `title`, `feedSummary`, `detailBody`, `eventType`, `locationSlug`, `significance` (0–1), `primaryCharacterSlug`, `participants`, `facts`, `contentRating: "standard"`, `cooldownDays: 30`, and optional `selectionWeight` and `tags`. An event with more than one participant also needs an authored `groupMessage`.

Each of one to four participants needs `characterSlug`, concrete `roleLabel`, distinctive `perspective`, `defaultDirectMessage`, `knownFactIds`, and optional `revealConstraints`. Every fact needs `id`, `text`, `userVisible`, and `knownBy` (participant slugs). Assign facts only to people who could actually know them. Private facts stay out of `detailBody`, `feedSummary`, user-visible facts, and suggested drafts. A participant's `knownFactIds` must exactly agree with the fact's `knownBy` list.

`schedulingRank` is a stable slot in a 30-day UTC rotation; edits must retain it and the repeat identity. The validator checks 200 ranks, 8 appearances and 2 leads per resident, all four participant sizes, reference slugs, structured knowledge, similarity, and a 90-day schedule. It is an editorial aid, not a substitute for reading at least ten incidents per world and each resident's coverage summary.

Run `pnpm world-pulse:validate -- --report` to write `validation-report.json`. Only after it passes, run `pnpm world-pulse:seed -- <review-output.sql>` to generate a reviewable transaction. The seed command does not connect to a database. Keep the server feature flag and per-world settings disabled until content, database checks, and manual client verification are complete.

## Colony-wide incidents

Each published world has a 15-incident major catalog in `<world-slug>-major.mjs`. Run `pnpm world-pulse:major:validate` to check all eight worlds. After a world's 200 routine incidents pass validation, run `pnpm world-pulse:major:seed -- --world <world-slug> <review-output.sql>` to prepare that world's major seed. Each incident has a public report and one-to-four focal witnesses with their own perspectives. Other canonical residents receive only the public report in conversation context; focal witnesses can recall up to three incidents they participated in. The four most recent public incidents remain available to residents even after the 24-hour discovery card expires. This does not write to a user's memory or imply attendance.

The UTC major rotation is anchored to Monday 2026-10-05 and has fifteen publication days across ten weeks: one or two per week, at least three days apart. The same identity returns only after 70 days, and the database rejects any attempted reuse inside 60 days. Major incidents use reserved slot 8; the ordinary 200-template, 6–8-per-day rotation remains independent. Major Pulse uses the same per-world V2 enablement switch and publishing cron. A missing major template causes a visible scheduler shortage instead of filler. Do not enable a world until both its 200 routine templates and its 15 major incidents are validated, seeded, and checked in a database test. Rolling back the UI/Edge code leaves existing occurrence snapshots and conversation history intact; stop `kivelle-world-pulse-major-reserve` to halt future major reservations.
