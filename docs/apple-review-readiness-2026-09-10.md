# Apple review readiness — September 10, 2026

## Verdict and scope

**Not ready to call review-ready.** There are confirmed consent, deletion, pricing, restore, and internal-build configuration gaps, plus a material content-policy risk.

This was a read-only product/infrastructure audit with isolated automated checks. Apple does not publish its complete internal review procedure; this is not Apple approval, a legal opinion, or a real-device certification. No product policy was changed, no production data was changed, no migration was applied, no paid generation or purchase was made, and no native build or submission was queued.

Audited repository: `tmoney2390test/kiveli-ai`, current fetched main `585eb1fe17f35039bf9734b3761e6a910f68e937` (PR #71). An isolated detached worktree preserved the existing checkout at `bbff31fa981dafb328b93df776aea610308b2b50`. Findings below concern this source revision unless explicitly identified as live observations. Deployment parity of all backend functions was not established.

## Confirmed findings

### 1. High — AI-sharing permission is not enforced

`supabase/functions/_shared/kivelle-ai-consent.ts:27` always returns `allowsProviderCalls: true`, including missing, declined, and withdrawn decisions. At line 41, `requireAiDataConsent` is a compatibility no-op that does not read consent storage. Direct dialogue and photo/voice-related handlers call this function, so their apparent guard does not enforce a choice. The consent tests explicitly assert this behavior.

The public privacy page describes configured AI providers generically. Meanwhile, `docs/store-review-handoff.md` and `docs/app-privacy-data-safety-worksheet.md` still describe independent permission and withdrawal controls that do not match this implementation.

Apple's 5.1.2(i) requires disclosure and explicit permission before personal data is shared with third-party AI. A general Terms link is not evidence that this has been satisfied. [Apple guidelines](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing)

Recommended correction: a concise, clearly disclosed first-use decision before applicable sharing, enforced server-side; retain valid decisions without repeatedly interrupting users. Update review/privacy materials to match. This need not become another lengthy signup page. No permission screen or policy was reinstated during this audit.

### 2. High — Apple token revocation is unfinished

`apps/together/src/hooks/useAuth.tsx:126` signs into Supabase using the native Apple identity token. No authorization-code exchange / retained revocable credential / Apple revocation caller was found in the inspected app and functions. `supabase/functions/together-account/index.ts:219` explicitly records `apple_revocation_status: 'unavailable'` for Apple identities. The deletion worker does not implement that revocation retry.

Account deletion itself does permit active store subscribers, warns that renewal must be managed separately, stages storage cleanup, checks recent authentication, and distinguishes Kivelli-owned Auth accounts from shared accounts. Those improvements should be preserved.

Apple separately requires apps using Sign in with Apple to revoke Apple tokens during deletion. [Apple account-deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [token-revocation implementation guidance](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)

Recommended correction: complete the actual native/web Apple credential lifecycle and durable revocation handling, without deleting another application's shared Auth account or retaining deleted-account access. Live deletion was not exercised.

### 3. High — annual native pricing can show the wrong billing period

`apps/together/src/lib/nativePurchases.native.ts:50` supplies each store product's full localized `priceString`. `apps/together/app/subscription.tsx:284` substitutes that price into `PlanCard` but leaves the catalog-derived period untouched. `apps/together/src/lib/subscriptionPresentation.ts:80` returns `/ month` for annual plans, because its original primary price is the annual amount divided by twelve.

Consequently, a full annual store price can display as an amount **per month**. The localized-price branch also replaces the annual billing explanation. A neutral fixture reproduced `USD 199.99/ month` from an annual product; this is a test amount, not an observed live store price. While store prices load or fail, native cards can also fall back to USD catalog amounts. The existing-member hero and Plus-to-Max comparison do not consistently receive localized store pricing.

Apple calls for a clear localized full renewal price and duration; a monthly equivalent must be subordinate to the actual annual charge. [Apple subscription presentation requirements](https://developer.apple.com/app-store/subscriptions/)

Recommended correction: pass store price and actual product period together; clearly distinguish an optional monthly equivalent, and do not represent a fallback catalog price as a live native offer. Preserve existing product IDs and authoritative backend grants.

### 4. High — internal release candidate selects an empty environment

`apps/together/eas.json:6` specifies internal distribution but no explicit `environment`. The inspected EAS project has the Supabase URL/key, social-auth flags, and RevenueCat flags/keys in **production**. Read-only EAS queries found **no preview variables** at either project or account scope.

Expo resolves an internal, non-development build without an explicit environment to `preview`; a channel name does not select the environment. Thus the checked-in release-candidate workflow is not reliably building with the required service configuration. [Expo environment-selection behavior](https://docs.expo.dev/eas/environment-variables/usage/)

Recommended correction: explicitly map review build profiles to the intended environment, then validate resolved non-secret configuration before starting the build. Use an intentional sandbox billing/test environment where appropriate; never mix sandbox entitlement grants into production accounts.

The `releaseCandidate` profile uses internal/ad-hoc distribution. It is not by itself a TestFlight/App Store artifact. The production store-distribution profile is a separate path. [Expo internal vs store distribution](https://docs.expo.dev/build/eas-json/)

### 5. Medium — restore still conflates stale free state with verified absence

`apps/together/src/lib/nativePurchaseSync.ts:19` returns `verified_none` after three free-tier responses. The default polling schedule ends after approximately 14.5 seconds of waits, excluding network latency. A direct isolated invocation with six stale free responses reproduced `{"state":"verified_none"}`.

The status endpoint at `supabase/functions/together-subscription/index.ts:37` returns normalized database state; this restore flow does not initiate server-side RevenueCat reconciliation. The UI does preserve a syncing state when SDK customer info reports an active entitlement, which limits the bug, but an empty/stale SDK response plus delayed webhook can still produce a false no-membership conclusion. Repeated database reads are not independent provider verification.

The notice also promises automatic resume; the bridge refreshes on foreground/customer-info events but does not persist and resume the restore operation itself. Buttons use separate busy states rather than an account-wide purchase/restore operation lock.

Recommended correction: server-verified reconciliation with bounded backoff, a recoverable syncing result rather than inferred absence, cancellation/account-switch guards, and one active purchase/restore operation. Do not grant paid access from client claims.

## Material policy risk, not an implementation change

The domain/server contract intentionally allows eligible private explicit text on iOS, including private groups, when the rollout and adult-participant/preference checks pass. Tests confirm that contract. Native photo controls also advertise adult photo availability on Kivelli.app (`apps/together/src/lib/mediaMomentPicker.ts:32`, `MediaRequestModal.tsx:128`).

Apple's 1.1.4 covers explicit erotic descriptions as well as visual material. Private access, an adult age gate, or another app's availability does not establish a blanket exemption. The native web-adult promotion increases review sensitivity. This is a substantial review risk, not proof of a particular future reviewer decision. [Apple objectionable-content rules](https://developer.apple.com/app-store/review/guidelines/#objectionable-content)

No dialogue policy, moderation, world content, or adult eligibility was changed. Resolve submission positioning honestly; do not add reviewer detection, reviewer-specific behavior, hidden unlocks, or misleading review notes. Do not interpret this finding as a recommendation to blanket-block ordinary fantasy battles, mature language, or relationship storytelling.

## Positive evidence and limits

| Area | Evidence obtained | What it does not prove |
|---|---|---|
| Native visual boundary | Server verifies a signed web-surface assertion; unverified callers become `native_or_unknown`. Relevant access/policy tests pass. | Complete real-device and every-route media isolation. |
| Production storage | `together-user-media` is private. Its inspected SELECT policies permit scoped avatars and pending uploads, not blanket access to every owned generated asset. | A full cross-account, derivative, cache, upload, and export penetration test. |
| Production RLS | Enabled on profiles, messages, generated media, AI consent, deletion jobs, safety reports, and support tickets. | Correctness of every policy/RPC, or session revocation across every route. |
| Store billing | Native purchase/restore integration exists; benefits remain backend-authoritative; management follows stored purchase origin. Hosted membership and credit checkout are disabled in the current endpoint. Webhook signature/environment tests pass. | Live product approval, offering completeness, actual sandbox transactions, or dashboard HMAC configuration. |
| Reporting | Inspected handler stores owned reports, severity/status/history and routes urgent reports into operations incidents. | Actual staffing response times or successful delivery to external alert/support destinations. |
| Push privacy | Tests verify discreet copy, allowlisted navigation, and separation of device-token vs provider-credential errors. | Delivery/receipt/navigation on a real iPhone, or background reliability. |
| Public web routes | Sign-in, signup, privacy policy, Terms, and Support returned HTTP 200 HTML. | Successful interactive signup, email delivery, or native route rendering. |
| Native configuration | Expo config introspection succeeds; Apple sign-in entitlement and camera/photo/microphone usage descriptions are present. | Correct distribution provisioning or a finished archive's combined SDK privacy manifests. |

Config introspection also exposes broad `NSAllowsArbitraryLoads`, background audio, and local-network/Face ID descriptions contributed by plugins. Verify necessity and the final release archive. The inspected config did not expose an app-level privacy manifest; SDK manifests may be supplied at native build time, so this is **not** a finding that the final app lacks every required manifest. [Apple privacy manifest guidance](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)

## Actual build and access observations

- EAS authenticated successfully for project `ffa20139-6b44-425f-9370-ea451e1061ba`.
- Latest listed iOS build: `f626962d-293d-426f-bede-ad5ec42f736c`, FINISHED, version 1.0.0 build 8, production/store distribution, completed September 2, 2026. It predates the September 6–10 launch changes. No source commit was recorded on that build entry, so its exact contents were not asserted.
- No current-source iOS binary was built or installed. Windows cannot supply an iOS simulator test here. No physical iPhone/iPad session was available.
- App Store Connect navigation redirected to login with authentication failed. Submitted screenshots, age-rating questionnaire, App Privacy answers, contracts, IAP statuses, selected review build, and reviewer credentials were **not verified**. The missing connection is an authenticated App Store Connect session; no password is requested in this report.
- Some EAS CLI reads emitted a Windows `npx` lookup warning and successfully used their config fallback. Expo's direct local introspection succeeded separately. The old CLI warning was not treated as a failed iOS build.

## Verification run on the audited revision

- `pnpm install --offline --frozen-lockfile --ignore-scripts` — passed; isolated checkout only.
- `pnpm lint` — passed.
- `pnpm --filter @together/app typecheck` — passed.
- App Vitest run — **730 tests passed**, 148 files. The attempted filename arguments ran the full suite rather than only those files.
- Domain Vitest run — **1,029 tests passed**, 68 files, likewise the full suite.
- Focused Deno typechecked tests — **32 passed** across private adult text, web adult access, AI consent, account lifecycle, push, RevenueCat, and store-only billing policy. Command used `deno test --allow-env --no-lock --unstable-sloppy-imports --config supabase/functions/deno.json` with those seven existing test files.
- `pnpm guard:starter-content` — passed.
- `pnpm --filter @together/app exec expo config --type introspect --json` — passed. This is configuration validation, not a native build.
- Two small read-only Node reproductions demonstrated the stale-free restore classification and annual-price/period mismatch.
- Current-commit [Kivelle CI](https://github.com/tmoney2390test/kiveli-ai/actions/runs/34504431584) and [Kivelle Database](https://github.com/tmoney2390test/kiveli-ai/actions/runs/34504431542) were successful. CI includes lint, typechecks, tests, Edge typechecks, and web export. No local Supabase container or historical migration-ledger procedure was run.

Passing tests validate the existing contract; they do not establish Apple compliance. In particular, some passing consent and restore tests intentionally encode the gaps above.

## Minimum remaining review-device pass

After the confirmed fixes and an intentional build-environment choice, create a current-source review binary and record build/device/results for:

1. Fresh email-code, Google, and Apple signup/sign-in; expired codes; birthday/onboarding; first world and first conversation, including a free account facing subscriber-only worlds.
2. Disclosed AI permission before applicable provider sharing; refusal/withdrawal; useful settings/support/deletion access without AI permission.
3. Direct/group chat, history return, media success/failure/refund, native visual restrictions, upload permissions, and background/resume on slow connectivity.
4. Sandbox purchase, annual/monthly localized presentation, restore on a new device, delayed webhook, pending/canceled purchase, relaunch, sign-out during sync, and cross-store management. Keep test grants isolated.
5. Reporting, discreet push, denied permissions, navigation from a terminated app, and account deletion for an active subscriber and Apple-sign-in account, including token revocation.
6. Small iPhone and supported iPad layouts, keyboard, VoiceOver, larger text, final archive privacy manifests, public screenshots, accurate age/privacy answers, live support, and ordinary reviewer access.

Do not submit a public release until these results are recorded. This checklist does not claim that Apple approval is guaranteed even after the engineering gaps are fixed.
