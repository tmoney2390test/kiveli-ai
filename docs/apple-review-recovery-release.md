# Apple review recovery release — 2026-09-10

## Scope and release state
Source branch: `codex/apple-review-readiness-fixes`, based on `585eb1fe17f35039bf9734b3761e6a910f68e937`.
The accompanying audit is a historical baseline, not the result of this implementation. This release preserves private adult dialogue, native visual restrictions, existing voices, public previews and current membership products. It does not submit a public store release.

## Implemented
- Explicit EAS environment mappings, local pre-upload checks and cloud build checks for missing endpoints, provider flags and public secret names. Development clients are exempt from production billing requirements.
- Native product display uses the localized store price **and actual ISO subscription period**, including annual products; missing store metadata never substitutes a static dollar price.
- Purchase/restore mutual exclusion, account-bound durable pending state, foreground/relaunch recovery, bounded reconciliation polling and account-switch checks. Store pending, user cancelled, server syncing, active, retryable failure and server-verified empty results stay distinct. Pending purchases are never cleared because of a stale free response. Store information remains provisional.
- RevenueCat webhook and authenticated reconciliation share the same normalized subscription writer and grant policy. Per-user leases serialize provider snapshots; the existing event ordering and grant keys are retained. Each request verifies only its authenticated user. Provider requests time out after eight seconds. Sandbox subscriptions cannot authorize production benefits.
- First-applicable-use AI-sharing disclosure and separate versioned decision RPC. Accepting/withdrawing never changes conversation spiciness. Current deliberate acceptances remain valid; absence, obsolete versions and withdrawal fail closed. Privacy controls remain accessible without consent.
- Server consent guards at AI entrypoints plus user-scoped dialogue, moderation, embedding, analysis, director, proactive generation, media dispatch/finalization and creator auxiliary jobs. Creator update/upload-finalization routes are covered as well. Consent is rechecked before subsequent operations; already-started remote requests cannot be recalled. Authored deterministic first-meeting text does not require sharing.
- Apple code exchange, refresh-token validation, linked-subject matching, client allowlist, short-lived ES256 client-secret signing, account/client-bound AES-GCM token storage, deletion-triggered revocation queue, leased retries, terminal operations incident, and native credential-revoked listener. No tokens in ordinary logs, exports or clients' persisted app state.
- Active external subscribers still may delete without cancelling renewal first. The UI explains separate renewal management and links to Apple manual revocation. Shared Supabase Auth users are still deleted only with the existing server-owned Kivelli ownership marker.
- Release ATS configuration no longer permits arbitrary insecure network loads. SDK privacy manifests still require inspection in the final archive.

## Database and rollout
New additive migration: `20260910181917_apple_review_recovery.sql`.
Regression: `supabase/tests/160_kivelle_apple_review_recovery.sql`; isolated fixture: `node scripts/test-apple-review-db.mjs`.
The isolated fixture exercises the actual migration using a minimal schema; it is not a historical full migration rebuild.

Order:
1. Pass CI, native config and new database checks; merge the release.
2. Apply only this new migration using the authenticated Supabase migration API. Do not replay unrelated migrations or rewrite historical ledger entries. If the API assigns a different version, align this newly created filename with its returned ledger version.
3. Deploy account/subscription/webhook handlers, then web UI, then all transitive consumers of modified shared AI/media/life modules. Keep existing JWT/auth settings.
4. Verify migration functions/RLS and deployed versions. Existing native builds fail safely with Privacy/update guidance if consent is missing.
5. Build fresh internal iOS/Android candidates from the recorded merged tree. Do not promote to public review until the matrix below passes.

Production target: `mfysnlghlhxxcwnwpxog`; website/gateway: `kivelli.app` / `kivelli-app-gateway`.
Pre-release gateway version: `79c10946-5b46-4d78-9b90-243028fecdb1`.
No historical migration cleanup, account deletion, paid generation, live restore or sandbox purchase was run while implementing.

## Required external setup — not claimed configured
Production secret-name inspection found RevenueCat secrets but **none** of:
- `KIVELLE_APPLE_CLIENT_ID`: Kivelli's native bundle client ID.
- `KIVELLE_APPLE_WEB_CLIENT_ID`: Kivelli's Apple Services ID.
- `KIVELLE_APPLE_TEAM_ID`, `KIVELLE_APPLE_KEY_ID`, `KIVELLE_APPLE_PRIVATE_KEY`: Sign in with Apple signing credentials, not APNs or EAS distribution credentials.
- `KIVELLE_APPLE_TOKEN_ENCRYPTION_KEY`: base64-encoded random 32-byte key.

Configure these only through a trusted server secret store. Do not paste them into chat. Preserve the encryption key until all stored tokens are revoked or deliberately re-encrypted; replacing it strands queued credentials. Confirm the Apple clients are Kivelli-scoped before enabling automatic revocation; grouped cross-app clients need an ownership assessment.

The current authenticated Supabase connection exposes Kivelli production and an unrelated application, **not an isolated Kivelli staging project**. Never use that unrelated project for tests.
`sandbox` EAS profile targets `preview` and store distribution, but preview is not configured. Before TestFlight/store-sandbox verification, provision an isolated Kivelli backend and RevenueCat test configuration, with no production entitlement/credit writes. Do not turn on sandbox acceptance in production as a shortcut. Internal production-connected builds can verify UI/auth but cannot complete the isolated purchase matrix.

App Store Connect session, actual product approval/agreements/privacy declarations, and physical iOS/Android devices remain external verification requirements. No credentials or device access are invented.

## Acceptance matrix still requiring real native evidence
- Fresh email-code/Google/Apple signup and expired-code recovery, adult birthdate flow, first AI sharing decision, decline and later acceptance, withdrawal on another device.
- Direct/group chat, streaming, background/resume, SMS/paragraph, history while consent is declined.
- Native denial of web-only media through generation, uploads, galleries, derivative URLs, export, sharing and notification paths; forged assertions; cross-account requests. Preserve neutral ordering placeholders.
- Localized monthly/annual prices, pending/cancelled store transactions, purchase/restore on another device, delayed/duplicate/out-of-order webhooks, renewal/refund/expiry/grace, cross-store management and deleted-account callbacks. Compare actual ledger grants.
- Apple native and OAuth credential capture, revocation success, transient retries, manual legacy path, active subscriber deletion, shared Auth noninterference.
- Push permissions and quiet hours, account switches, foreground/background/terminated navigation; support report submission and authorized triage; denied photo/microphone permissions, VoiceOver and large text.
- Inspect archive SDK privacy manifests, ATS and entitlements. A web export or config introspection does not establish native readiness.

## Operator recovery and rollback
- Apple retries: inspect only status/attempt_count/failure_code, never select encrypted tokens into support notes. Resolve the sanitized Apple revocation incident, fix configuration, then reset only confirmed failed jobs to pending with bounded retries. Account access stays deleted.
- Restore sync: verify provider environment, HMAC credentials, mapped product and authenticated UUID. Retry reconciliation; never issue manual duplicate credit grants based on client screenshots.
- Withdrawal: in-flight external work may finish; no later scoped provider call should run. Previously sent data, delivered push notifications and downloaded assets cannot be recalled by this switch.
- Roll back web assets to the recorded Worker version if necessary, but preserve the new consent UI when backend enforcement remains on. Prefer a forward fix for privacy enforcement; do not turn withdrawn permission into silent acceptance.
- Database changes are additive: leave consent events and revocation queue intact on code rollback. Do not drop tables with pending credentials or modify old migrations. Existing backups were not restored/tested here; verify backup availability with the owner before destructive recovery.
- GitHub workflows request CI/database/native-config checks. A workflow file alone does not set branch protection. No public store submission or external alert test is authorized by this document.

## Documentation basis
[Apple deletion and token revocation TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple),
[Supabase Apple integration](https://supabase.com/docs/guides/auth/social-login/auth-apple),
[Expo environment use](https://docs.expo.dev/eas/environment-variables/usage/).
Store precedent is not an exception or approval guarantee. Provider contract, retention and legal-entity declarations remain owner inputs.
