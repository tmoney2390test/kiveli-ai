# Pricing rollout and Apple testing — 15 September 2026

## Live

- Essential calls: 5 credits per started minute. Immersive: 20.
- Credit packs: $4.99/250, $11.99/700, $27.99/1,750, $59.99/4,500.
- Monthly/annual subscription prices and grants are unchanged.
- Store identifiers retain their original numeric suffixes for compatibility. Apple and Google customer-facing quantities and RevenueCat display names now show the new amounts. Existing native clients read the catalog from the server.
- Existing receipts keep their recorded credits through retries/refunds; no historical balances were rewritten. Previously unseen purchases use the current catalog at first verification. Stripe checkout remains disabled.
- Migration `20260915131624_credit_pack_value_upgrade` expanded allowed amounts and made recorded receipt amounts authoritative. RLS remains enabled and authenticated clients cannot invoke the purchase RPC.
- Production billing functions: subscription v144, RevenueCat webhook v59, legacy billing webhook v131. Patches were applied to downloaded live source to preserve unrelated server changes.
- Website Worker: `430c80de-8149-459f-9513-22f53689cf59`, source `4e78605`. Previous version: `78705122-41ef-4af5-86bc-4fd46655bf67`.

## Verified

- Authenticated subscription status returns all four upgraded quantities. A nonexistent transaction stays pending and grants nothing.
- Apple USA prices and Google active purchase options match the table above. RevenueCat default offering maps all four Plus/Max monthly/annual products across both stores. Credit packs remain consumables without subscription entitlements.
- Requested test account is on the server-owned sandbox tester allowlist. This does not enable sandbox benefits for every production customer.
- Apple Paid Apps Agreement, bank, tax form and DSA state are Active.
- Apple beta description, support/privacy URLs, contact and subscription review notes are saved.
- App/domain typechecks, 16 focused client tests, six economics tests, two RevenueCat consumable tests and SQL receipt/refund tests pass.
- Production route audit: 423 pages, 63 critical assets. Final artwork delivered byte-for-byte; privacy, terms, deletion, support and subscription routes return 200.

## Native build fix

The first iOS candidate (14) failed bundling because Gilded Age artwork was referenced locally but excluded by `.easignore`. It now uses a public website asset included in the web export. No content rules changed. Corrected candidates: iOS 15 (`6a263081-18fc-4d4a-b897-1a54c983a8d4`) and Android 14 (`423509a1-5873-479c-a0b3-4f03b92e01f5`), source `4e78605`.

iOS 15 built successfully. Submission `a96ff3c1-6628-48d5-a7d0-1939c283cd21` is queued in Expo's free tier; Apple has not yet processed it. Android 14 remains queued. A local, bounded release process waits for Apple build 15 to become valid, then verifies assignment to the existing Kivelli Internal Testing group; separately it submits Android 14 to Alpha when its build finishes. Status: `.codex-temp/native-release-status.json`. It stops on repeated errors or after two hours. Keep this computer running; queued does not mean installed or approved. No paid queue upgrade or public release was requested.

## Apple account recovery configuration

The six Apple recovery settings were absent. The project's Edge Function secret limit prevented adding them individually. All 135 deployed function source bundles were checked: none referenced retired `KIVELLE_MAX_INCLUDED_VOICE_MINUTES`. That unused setting was replaced with one `KIVELLE_APPLE_CONFIG_JSON` secret containing the existing Apple signing configuration and a new 32-byte encryption key. Current call allowances and pricing overrides were retained. No existing encrypted Apple credentials were present before configuration.

The shared reader accepts this grouped setting and preserves individual-setting precedence. Only that reader was patched into downloaded live account and life-dispatch sources (account v157; life-dispatch v175). Three tests pass. The uploaded secret digest matches the prepared configuration; a live missing-authorization smoke check confirmed parsing and signing work before validation rejects the absent code. No real Apple refresh token exchange/revocation is claimed. Temporary plaintext configuration was removed. Full Apple sign-in, deletion and revocation still require a device test.

## Remaining review evidence

- Apple subscription/consumable products still show Missing Metadata; actual purchase-screen review screenshots are absent. Promotional mockups are not substituted for purchase evidence.
- Reviewer sign-in details must be provided before external beta review. Contact information is saved separately.
- Physical TestFlight purchase, cancellation, restore, renewal and refund delivery remain unverified. Use sandbox (no real charge), confirm the server ledger grants once, and verify an interrupted purchase resumes without duplicate credits.
- Explicit private text remains allowed under the owner's existing product instructions. Apple guideline 1.1.4 prohibits explicit sexual descriptions; this remains a material review risk. A mature age rating does not establish approval. Native explicit visual restrictions and voice policy are unchanged.
- Public distribution listing screenshots, description, keywords and review information were blank during inspection. Internal testing is separate from a public App Store release; no public release is claimed.

Sources: [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), [TestFlight purchase testing](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight).
