# Production-to-GitHub reconciliation — September 3, 2026

This checkpoint records the source already running in production. It does not
deploy the website, publish native builds, change provider settings, or rotate
secrets.

## Verified deployment

- Website: `https://kivelli.app`
- Worker: `kivelli-app-gateway`
- Active Worker version: `0b49b8fc-e1d4-4381-b411-cf2279fcab49`
- Deployed: September 2, 2026, 23:53:20 UTC
- Web entry: `entry-28ea5c390f5d87073af0e414f3c0e1ab.js`
- Supabase project: `mfysnlghlhxxcwnwpxog`
- Latest applied migration: `202609020007_kivelle_sfw_video_models.sql`

The Worker source was rebuilt with Wrangler in dry-run mode and matched the
downloaded production Worker, excluding its source-map comment. The local
production HTML and all 62 JavaScript chunks matched the live site's bytes.
The production route audit also passed for 297 routes and 60 critical assets.

A fresh web export completed using the existing EAS production environment.
Metro assigned different module IDs and chunk hashes. Comparing compiled module
bodies found 2,948 of 2,949 unchanged after normalizing chunk references. The
remaining shared media module contains newer changes already deployed in the
backend; no website deployment was performed to change the existing release.

## Backend and migration coverage

All 41 deployed `together-*` functions were inspected through the read-only
Supabase Management API. Each changed shared/backend source file included in
this checkpoint matches at least one active deployment. Functions were deployed
at different times and therefore still carry different versions of shared
dependencies. This repository records the latest deployed shared source, not a
claim that all historical function bundles have identical dependencies.

The eight newly tracked migrations, from `202609010010` through `202609020007`,
were confirmed in the production migration ledger. They are recorded here, not
re-applied.

Additional local-only edits in these files were deliberately excluded:

- `supabase/functions/together-account/index.ts`: the committed version was
  recovered from production; the local secret-fallback edit remains local.
- `supabase/functions/together-billing-webhook/index.ts`
- `supabase/functions/together-report/index.ts`
- `supabase/functions/together-scene-reaction/index.ts`

The latter three production entrypoints still match the previous GitHub commit.
Associated existing tests, configuration, documentation, and build-support files
are included with the deployed application changes. Local scratch files and
generated exports are not included. Runtime secret values remain in their
existing deployment secret stores, never in this checkpoint.

## Validation

- `pnpm lint`: passed.
- `pnpm typecheck`: passed for app and domain packages.
- `pnpm test`: 606 app tests, 880 domain tests, 9 Worker tests, and 2 production
  route-audit tests passed.
- `pnpm edge:typecheck`: passed.
- `pnpm guard:starter-content`: passed.
- `pnpm audit:navigation`: passed.
- `node scripts/audit-production-routes.mjs`: passed against production.
- Fresh Expo web production-environment export: passed.
- Wrangler dry-run: passed; no upload or deployment.

Database tests were not run against production. This reconciliation did not
start a local database or rebuild native applications.
