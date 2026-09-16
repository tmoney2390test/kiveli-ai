# Operations and support release — 16 September 2026

## Implemented

The Ops console uses a dedicated desktop sidebar, compact header, consistent navy panels, readable typography, 44px action targets and visible refresh/access information. Mobile navigation scrolls horizontally. Opening a support case on a small screen replaces the queue and has a direct return action; desktop keeps queue and case side by side. Existing telemetry, incident, account, safety, pricing, world, release and audit screens remain available by role.

Support adds search, status/category popup filters, assignment filtering, ordering, case-linked provider/delivery diagnostics, notification delivery state, recent account credit transactions and recovery history. Queue results explicitly state their loaded limit; they do not imply complete pagination or an SLA.

Help and Support have problem-specific recovery shortcuts. Requests can include optional conversation/media IDs, a purchase reference and a previewed, optional platform/version/build diagnostic bundle. No transcript or memory is attached automatically. New requests and customer/staff replies preserve account-scoped device drafts and stable retry IDs. Damaged draft fields are ignored; unavailable storage is reported rather than promising persistence.

## Recovery boundaries

- Retained chat restoration checks the ticket owner and linked conversation, respects its actual deadline and preserves newer history.
- Delivery refresh requires an existing ready media record and storage object. It refreshes that record/offer; it does not recreate a missing asset or start generation.
- Provider refresh schedules a check of an existing eligible WaveSpeed job. Active leases and terminal states are respected.
- Store membership verification is administrator-only and uses the existing RevenueCat reconciliation lease and period-grant idempotency. Customer-supplied references cannot grant benefits. Consumable credit packs and store refunds retain their separate existing flows.
- Every recovery requires a reason and stable request ID. Local repairs and their audit commit together. External membership verification records intent before calling the provider; uncertain retries reverify through the existing idempotent billing path.
- Deleted-account markers prevent recovery. Internal recovery tables and RPCs are service-only. Viewer dashboards omit customer case details. Paid or previously submitted media cannot be blindly restarted using the legacy retry endpoint.

## Validation

- App typecheck and 908 tests passed.
- 11 focused backend tests passed: roles, case ownership, safe diagnostics/errors, support portal boundaries and membership replay.
- Rollback-only database fixtures passed ticket/repair deduplication, ownership and role denial, expired archives, newer-history preservation, provider polling, existing-output refresh and unchanged credit ledger. No fixture ticket, email or media job was committed.
- Live ordinary-account smoke check: personal tickets 200; Ops dashboard and recovery 403.
- Actual React Native Web Ops components were visually reviewed at desktop and 390×844 using synthetic cases and a disabled local API. Queue filters, empty states and mobile case navigation were exercised. This is not a claim that customer data was modified through the UI.
- New database objects have only the expected informational RLS-without-client-policy advisory; service-only grants are intentional. Unrelated existing database advisories were not changed by this release.

## Follow-up checks

Physical-device purchase interruption/callback tests and an isolated backup restoration drill still need to be performed. No new native binary, refund, real customer recovery or support email was sent as part of this verification. Reset undo and manual reservation release are not exposed.

## Deployment

Migration: `20260916170616_support_recovery_actions.sql` applied to Kivelli. Backend and web identifiers are recorded after final publication. The backend bundle preserves previously deployed shared dependencies, overlaying only this release's changes and newly required membership helpers.
