# Kivelle launch release handoff

This document describes the repository behavior introduced by `202609060003_kivelle_launch_readiness.sql`. It is an engineering handoff, not legal advice or a claim that a store will approve the product.

The honest store-review description and public-material checklist are in `store-review-handoff.md`.

## Product boundary

- Private direct and private AI-group text may be explicit on web, iOS, and Android only when the authenticated account is adult-eligible, has a recorded explicit private-text choice, all current fictional participants have confirmed canonical ages of at least 18, prohibited-content moderation allows the turn, and `KIVELLE_PRIVATE_ADULT_TEXT_MODE=on`.
- Image and video generation/retrieval have an independent policy. Explicit visual bytes and URLs require a server-verified web-surface session and short-lived adult-asset grant. Native and unknown surfaces receive no original, thumbnail, blur-derived data, prompt, explicit caption, storage key, or signed URL.
- Public discovery, publication, conversation sharing, and push payloads are suitable for public/lock-screen display. Voice retains its existing non-explicit policy.
- Subscription, adult eligibility, private-text preference, and AI-provider consent are independent account facts.

## Deployment manifest

Release commit: use the immutable Git commit containing this manifest. Record its
hash in the deployment record rather than embedding a self-referential hash here.

Migration, first:

- `202609060003_kivelle_launch_readiness.sql`

Edge functions whose code or shared dependencies changed and must be redeployed:

- `together-account`, `together-bootstrap`, `together-signup`
- `together-conversation`, `together-group`
- `together-dialogue`, `together-group-dialogue`, `together-dialogue-suggestion`, `together-story-dialogue`, `together-scene-reaction`
- `together-media`, `together-media-dispatch`, `together-multimodal`, `together-call`, `together-creator`
- `together-life-dispatch`, `together-notifications`, `together-report`, `together-ops`, `together-subscription`
- `together-billing-webhook`, `together-revenuecat-webhook`

Client:

- Deploy web only after the migration and functions are healthy.
- The onboarding/privacy, installation-scoped push identity, purchase-origin management, and RevenueCat restore changes require new iOS and Android binaries.
- `native-release-candidate.yml` queues internal EAS builds with the `releaseCandidate` profile. It never submits a public release. Production promotion is a separate owner-approved operation.

Required server configuration names (record presence, never values):

- Existing Supabase URL/publishable/service credentials.
- Existing provider credentials for every enabled AI provider.
- `KIVELLE_PRIVATE_ADULT_TEXT_MODE` (`off`, `shadow`, or `on`). Unset is fail-closed.
- Existing verified-web/adult-asset signing secrets and `WEB_ADULT_MODE_ENABLED`/equivalent rollout flag used by the current deployment. Confirm actual production values in the secret manager; this repository does not assert them.
- RevenueCat: `KIVELLE_REVENUECAT_WEBHOOK_AUTHORIZATION`, `KIVELLE_REVENUECAT_WEBHOOK_SIGNING_SECRET`, `KIVELLE_REVENUECAT_SECRET_API_KEY`, `KIVELLE_REVENUECAT_CONFIG_JSON`.
- Billing continuity: `KIVELLE_WEB_APP_STORE_ENTITLEMENTS_ENABLED`; retained Stripe secrets only while legacy subscriptions or credit packs remain operational.
- Operations alerts: optional `KIVELLE_OPS_ALERT_WEBHOOK_URL`, or Resend key/from/to values documented in `operations.md`.
- Native build: `EXPO_PUBLIC_KIVELLE_REVENUECAT_ENABLED`, the platform-specific public RevenueCat SDK keys, offering ID when non-default, Apple/Google auth build flags, and `EXPO_TOKEN` for CI release-candidate builds.

## Rollout and rollback

1. Back up the database and apply the additive migration.
2. Deploy account/bootstrap/signup and policy-consuming functions.
3. Deploy dialogue/media functions, then notifications/reporting/ops/billing.
4. Smoke-test a newly consenting account and an existing account before enabling the text rollout.
5. Start private adult text in `shadow`; review only aggregate, content-free eligibility/failure telemetry. Move to `on` after web and native matrices pass.
6. Deploy web, then internal native release candidates. Promote only after owner review.

Emergency rollback: set `KIVELLE_PRIVATE_ADULT_TEXT_MODE=off` and disable affected media/provider flags. This stops new generation without rewriting canonical history. Keep the additive schema and consent/deletion/audit records. Do not roll back by exposing web assets to native or by weakening webhook verification.

## Manual release acceptance

Run on current production-like builds, recording device/build, network, account type, correlation IDs, measured latency, and observed provider cost. Do not invent capacity or an SLA.

- Auth: fresh email-code signup/sign-in, expired or incorrect code recovery, Google, Apple web OAuth, and native Apple.
- Privacy: age confirmation, independent private-text and AI-sharing choices, decline, withdrawal, multi-device persistence, and no repeated prompt after a current valid choice.
- Chat: first meeting; direct and private group; regeneration; edit/continue; existing mixed history; eligible explicit text on all three surfaces; uncertain participant age and prohibited content fail closed.
- Media: SFW generation on all supported surfaces; eligible web-only adult generation; native/unknown projection and direct asset-request rejection; forged surface headers; timeout/retry/refund; no explicit cache after account switch.
- Billing: pending/canceled purchase, duplicate/out-of-order/sandbox webhook, restore on a new device, cross-store management origin, renewal/grace/expiration/refund, sign-out during sync, and deleted-account late events without profile recreation or duplicate grant.
- Push: denied permission, two same-platform devices, account switch, token rotation, quiet hours across a time change, offline/stale recovery, direct/group navigation after auth, foreground suppression behavior, invalid device token, and provider credential failure preserving tokens.
- Safety/operations: submit ordinary and urgent reports; verify protected queue, least-context detail view, assignment, audit event, resolution, and sanitized incident. Exercise synthetic provider/billing/deletion/media alerts only in an authorized environment.
- Deletion: free, active Apple/Google renewal, canceled-but-unexpired, legacy Stripe, Apple-auth, retry, storage cleanup, and shared-Auth isolation. Confirm deletion does not claim to cancel store renewal.
- Platform basics: 360/390/430/tablet/desktop accessibility, screen reader labels, denied photo/microphone, slow network, background/resume, cold launch, and no private content in crash/log/analytics payloads.

## Known owner inputs and residual risks

- The Supabase project is documented as shared. New Kivelle-created users are ownership-marked; unmarked existing users receive application-only deletion to avoid cross-app deletion. The owner must confirm whether all historical accounts belong exclusively to Kivelle before any backfill.
- Native Sign in with Apple currently gives Supabase an identity token but the repository has no durable Apple refresh token for revocation. Account deletion still removes Kivelle access/data, but Apple token revocation cannot be truthfully marked complete for those accounts. Completing this requires a server-side authorization-code exchange, encrypted refresh-token retention, rotation-ready Apple client credentials, and a retry worker. Do not store the `.p8` key or client secret in Expo.
- Alert destinations and a real backup restore require owner-authorized infrastructure. The checked-in rules/runbook do not prove delivery or restoration.
- Apple/Google policy review and jurisdiction-appropriate age assurance remain owner/legal inputs. A birthdate gate is intentionally replaceable and is not represented as universal age verification.

## Validation evidence

Run from the launch-readiness working tree on 2026-09-06:

- `pnpm typecheck` — passed.
- `pnpm edge:typecheck` — passed.
- `pnpm lint` — passed.
- Focused Deno launch policy, consent, lifecycle, and push tests — 18 passed. Purchase-sync, RevenueCat, routing, and domain regressions are included in the full `pnpm test` result below.
- `pnpm test` — passed: app 140 files/693 tests, domain 62 files/955 tests, gateway 9 tests, route audit 3 tests, Vharadren 3 tests.
- `pnpm guard:starter-content` — passed.
- `pnpm audit:navigation` — passed: 909 interactive elements, 159 static route references, and 60 filesystem routes checked.
- `pnpm web:build` with non-secret compile-only Supabase placeholders — passed, producing 375 static routes. The placeholders prove bundling only and are not deployment credentials.
- Expo native configuration evaluation with the same compile-only placeholders — passed.
- `git diff --check` — passed apart from Git's existing CRLF conversion notices.
- `pnpm supabase:test` — not runnable locally because the Supabase/Postgres test service at port 54322 was unavailable and neither Docker nor Podman is installed. The database workflow now runs the isolated migration/test job for pull requests and `main`; merge/release remains gated on that job passing.

No paid provider request, real push, live restore, production deployment, public EAS submission, or store promotion was performed as part of this implementation.

## Changed launch-readiness surface

The following paths comprise the launch-readiness implementation. Unrelated chat-appearance work already present in the working tree is intentionally excluded from this manifest.

- Workflows/config: `.github/workflows/database.yml`, `.github/workflows/native-release-candidate.yml`, `apps/together/eas.json`, `scripts/run-eas-with-lean-context.mjs`.
- Client screens: `apps/together/app/age-confirmation.tsx`, `apps/together/app/ops.tsx`, `apps/together/app/privacy.tsx`, `apps/together/app/privacy-choice.tsx`, `apps/together/app/subscription.tsx`.
- Client routing/session: `apps/together/src/components/AuthenticatedIndex.tsx`, `apps/together/src/lib/authRouting.ts`, `apps/together/src/lib/authRouting.test.ts`, `apps/together/src/lib/conversationMessageWarmup.ts`, `apps/together/src/lib/desktopNavigation.ts`, `apps/together/src/lib/privateClientCache.ts`, `apps/together/src/lib/sessionRouting.ts`, `apps/together/src/providers/AuthenticatedSessionGate.tsx`, `apps/together/src/providers/KivelleSessionGate.tsx`.
- Client billing/push/ops: `apps/together/src/lib/nativePurchases.native.ts`, `apps/together/src/lib/nativePurchases.ts`, `apps/together/src/lib/nativePurchaseSync.ts`, `apps/together/src/lib/nativePurchaseSync.test.ts`, `apps/together/src/lib/operations.ts`, `apps/together/src/lib/pushNotifications.ts`, `apps/together/src/lib/revenueCatPurchases.ts`, `apps/together/src/lib/revenueCatPurchases.test.ts`, `apps/together/src/lib/subscription.ts`, `apps/together/src/providers/PushNotificationBridge.tsx`, `apps/together/src/providers/RevenueCatSessionBridge.native.tsx`.
- Shared server policy/lifecycle: `supabase/functions/_shared/context.ts`, `kivelle-account-deletion-worker.ts`, `kivelle-account-lifecycle.ts`, `kivelle-account-lifecycle.test.ts`, `kivelle-ai-consent.ts`, `kivelle-ai-consent.test.ts`, `kivelle-deleted-account.ts`, `kivelle-ops.ts`, `kivelle-push.ts`, `kivelle-push.test.ts`, `kivelle-subscription.ts`, `private-adult-text-policy.ts`, `private-adult-text-policy.test.ts`, `together-media-dispatcher.ts`, `types.ts`, and `web-adult-access.ts` in that directory.
- Edge functions: `together-account`, `together-billing-webhook`, `together-bootstrap`, `together-call`, `together-conversation`, `together-creator`, `together-dialogue-suggestion`, `together-dialogue`, `together-group-dialogue`, `together-group`, `together-life-dispatch`, `together-media`, `together-multimodal`, `together-notifications`, `together-ops`, `together-report`, `together-revenuecat-webhook`, `together-scene-reaction`, `together-signup`, `together-story-dialogue`, and `together-subscription` under `supabase/functions/`.
- Database: `supabase/migrations/202609060003_kivelle_launch_readiness.sql`, `supabase/tests/139_kivelle_birthdate_explicit_defaults.sql`, `supabase/tests/150_kivelle_launch_readiness.sql`.
- Documentation: `README.md`, `docs/apple-authentication.md`, `docs/app-privacy-data-safety-worksheet.md`, `docs/billing.md`, `docs/launch-release-handoff.md`, `docs/operations.md`, `docs/store-review-handoff.md`, `docs/web-adult-mode.md`.
