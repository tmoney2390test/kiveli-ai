# Kivelle billing

Kivelle's database is the authoritative source for plans, entitlements, limits, and Credits. RevenueCat is the Apple/Google lifecycle adapter—not the entitlement authority. New memberships can be purchased only through StoreKit or Google Play Billing; there is no Stripe or hosted-checkout fallback. Stripe remains connected only for legacy subscription reconciliation/management and optional credit-pack checkout. `resolveSubscriptionState()` chooses one effective internal entitlement across all provider rows and grants each monthly benefit only up to the highest applicable tier.

No card number, Stripe secret, webhook secret, or Supabase service-role key belongs in Expo or browser code.

## Native Apple/Google subscriptions through RevenueCat

The Expo app uses `react-native-purchases` only on iOS and Android. It configures RevenueCat with the authenticated Supabase user UUID as the custom App User ID, disables automatic device-identifier collection, exposes a restore action, and never grants access from client `CustomerInfo`. A purchase success starts a short synchronization wait; only the authenticated server webhook can activate Kivelle benefits.

Create one RevenueCat offering (the optional client offering ID defaults to `default`) with these custom package identifiers:

```text
kivelle_plus_monthly
kivelle_plus_annual
kivelle_max_monthly
kivelle_max_annual
```

Attach the corresponding App Store Connect and Google Play subscription/base-plan products to those packages and to the `kivelle_plus` or `kivelle_max` entitlement. Supply the per-app **public SDK keys** to EAS as `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`, then set `EXPO_PUBLIC_KIVELLE_REVENUECAT_ENABLED=true` in native builds. Never put a RevenueCat secret key in an `EXPO_PUBLIC_*` variable.

The production Google Play catalog uses one subscription per Kivelle tier and one auto-renewing base plan per billing interval:

```text
app.kivelli.plus:monthly
app.kivelli.plus:annual
app.kivelli.max:monthly
app.kivelli.max:annual
```

RevenueCat identifies modern Google Play subscription products as `<subscription-id>:<base-plan-id>`. Keep all four identifiers in `KIVELLE_REVENUECAT_CONFIG_JSON` alongside the four App Store product identifiers. Do not create four redundant Play subscriptions or infer the billing interval from display text.

Deploy `together-revenuecat-webhook` and register:

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/together-revenuecat-webhook
```

Configure an unpredictable `Authorization` header and enable RevenueCat HMAC signing. Store the exact header, one-time signing secret, and a server-only RevenueCat secret API key in `KIVELLE_REVENUECAT_WEBHOOK_AUTHORIZATION`, `KIVELLE_REVENUECAT_WEBHOOK_SIGNING_SECRET`, and `KIVELLE_REVENUECAT_SECRET_API_KEY`. `KIVELLE_REVENUECAT_CONFIG_JSON` is the kill switch and server-authoritative map of allowed RevenueCat app IDs, entitlement IDs, product IDs, tiers, and intervals. Production should keep `acceptSandbox=false`; use a separate non-production webhook/configuration for sandbox events.

The webhook verifies the exact authorization value and raw-body HMAC, rejects stale signatures, accepts only allowlisted apps and mapped products, deduplicates by RevenueCat event ID, fetches the current subscriber snapshot from RevenueCat, and applies it through the same stale-event-guarded subscription RPC as Stripe. Unknown products fail closed. Payloads, receipts, API keys, and full subscriber data are not written to logs or the billing-event ledger.

There is intentionally no environment switch that can re-enable hosted membership checkout. Keep `KIVELLE_WEB_APP_STORE_ENTITLEMENTS_ENABLED=true` while Apple and Google memberships should unlock paid benefits on the website.

## Store products and environment

Create the recurring monthly and annual membership products in App Store Connect and Google Play, then map them in RevenueCat as described above. The repository catalog remains authoritative for names, quantities, benefits, and displayed prices.

Stripe subscription Price IDs below are legacy-only. Keep them only while old Stripe subscriptions still require signed webhook reconciliation or Customer Portal access. They cannot start a new membership checkout. Stripe one-time Prices may still be used for Kivelle Credit packs.

Server-only Supabase secrets:

```text
STRIPE_SECRET_KEY=sk_test_... or sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
# Legacy subscription reconciliation only:
STRIPE_PRICE_KIVELLE_PLUS_MONTHLY=price_...
STRIPE_PRICE_KIVELLE_PLUS_ANNUAL=price_...
STRIPE_PRICE_KIVELLE_MAX_MONTHLY=price_...
STRIPE_PRICE_KIVELLE_MAX_ANNUAL=price_...
# Optional one-time credit packs:
STRIPE_PRICE_CREDITS_100=price_...
STRIPE_PRICE_CREDITS_300=price_...
STRIPE_PRICE_CREDITS_800=price_...
STRIPE_PRICE_CREDITS_2000=price_...
STRIPE_AUTOMATIC_TAX_ENABLED=false
STRIPE_MANAGED_PAYMENTS_ENABLED=false
KIVELLE_PUBLIC_APP_URL=https://kivelli.app
KIVELLE_BILLING_GRANT_SECRET=<random server secret>
```

Optional HTTPS URL overrides are used only by retained Stripe credit checkout and legacy portal flows. Localhost HTTP is accepted for development; production/preview URLs must use HTTPS. Do not mix test and live keys or Price IDs.

The server pins Stripe API version `2026-02-25.clover`. Revalidate webhook fixtures before changing it.

## Retained Stripe setup

Do not create or advertise new Stripe memberships. While legacy Stripe subscriptions or Stripe credit packs remain active:

1. Keep Customer Portal configured so legacy subscribers can update payment methods, view invoices, or cancel.
2. Keep `https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/together-billing-webhook` registered for:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.payment_action_required`
   - `charge.refunded`
   - `refund.created`
   - `charge.dispute.created`
   - `charge.dispute.closed`
3. Copy the endpoint signing secret to `STRIPE_WEBHOOK_SECRET`.
4. If credit packs use Stripe Tax, configure registrations and product tax codes before enabling `STRIPE_AUTOMATIC_TAX_ENABLED`.
5. Enable `STRIPE_MANAGED_PAYMENTS_ENABLED` only if retained credit-pack products meet its requirements.

## Monthly grants and rollover

RevenueCat purchase and renewal events grant the appropriate store membership benefits through the shared subscription RPC. Legacy Stripe monthly subscriptions still grant from a successful `invoice.paid` event. Annual plans advertise a monthly benefit, so they do **not** receive twelve months at once. `together-billing-grants` performs an idempotent daily sweep and fills only the current calendar month's benefit.

Add `together_project_url` and `kivelle_billing_grant_secret` to Supabase Vault before applying the grant-schedule migration in production. The server secret and Vault value must match. Subscription credits retain the existing 2x plan rollover cap and 30-day inactive grace policy; purchased credits remain permanent under the current catalog policy.

## Local test-mode validation

```sh
stripe login
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/together-billing-webhook
supabase functions serve together-subscription together-billing-webhook together-billing-grants --env-file .env.local
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
stripe trigger charge.refunded
stripe trigger charge.dispute.created
```

Generic trigger fixtures do not contain Kivelle metadata or configured Price IDs. For legacy subscription reconciliation, replay an existing test subscription event or use Stripe test clocks. For credit packs, complete a test credit Checkout from a local authenticated paid account. Confirm:

- The subscription endpoint never creates a new Stripe Checkout session.
- RevenueCat membership events do not grant access before their authenticated webhook.
- A repeated event ID does not grant twice.
- A canceled-at-period-end plan retains access through its paid end.
- An unpaid/paused/terminal plan has no paid entitlement.
- Credit checkout is denied to free accounts.
- Refund/dispute adjustments never make a balance negative.

## Deployment and rollback

Deploy migration-first:

1. Back up and apply `202608280003_kivelli_stripe_billing_v2.sql` and `202608280004_kivelli_billing_grant_schedule.sql`.
2. Configure Edge Function secrets and Vault values.
3. Deploy `together-subscription`, `together-revenuecat-webhook`, `together-billing-webhook`, and `together-billing-grants`.
4. Verify StoreKit/Google Play purchases through RevenueCat, plus legacy Stripe renewal, failed-payment, cancellation, credit-pack, refund, and dispute handling.
5. Deploy the web client only after verified webhook state appears in Supabase.

Rollback by disabling RevenueCat purchases in the native build and server configuration. Do not restore hosted Stripe membership checkout as a rollback path. The migrations are additive; retain billing events, subscriptions, ledger entries, and adjustments for audit. Do not delete or rewrite ledger rows. Unschedule `kivelli-annual-monthly-credit-grants` if the grant worker is disabled.

## Reconciliation and support

To reconcile, list Stripe subscriptions for stored `together_billing_customers`, fetch the latest provider objects, and replay/synchronize them through trusted server tooling. Compare them with `together_billing_subscriptions`; do not edit `together_entitlements` by hand. RevenueCat rows remain separate and the effective highest valid plan wins without doubling monthly credits.

Support staff may inspect `together_credit_accounts`, `together_credit_ledger`, `together_billing_events`, and `together_billing_adjustments` through restricted ops access. Correct balances only through a reviewed, idempotent adjustment RPC—never an ad-hoc `UPDATE`. `pending_review` adjustments indicate refunded/disputed purchased credits that had already been consumed.

## Account-owner checklist

- Confirm the public legal seller name/address and ensure it matches App Store Connect, Google Play, any retained Stripe credit checkout, receipts, Terms, and tax records.
- Configure `support@kivelli.app` and the public refund/cancellation policy.
- Create and approve Apple/Google subscription products and RevenueCat offerings. Keep only the Stripe Portal, webhook, and credit-pack configuration still needed for legacy accounts or one-time packs.
- Request written processor approval with an accurate description:

> Kivelli is an adults-only interactive storytelling and virtual-world entertainment platform. Users explore authored worlds and converse privately with fictional adult AI characters; eligible adults may encounter user-directed mature or explicit fictional text roleplay. Paid products provide general capabilities such as additional conversations, model quality, memory, voice, and media credits; payment does not determine adult-content eligibility. Kivelli does not match users with real people, arrange sexual services, enable user-to-user payments, or provide explicit image/video generation in its native apps. Public and shared content remains non-explicit.

- Review Apple/Google store rules before release. RevenueCat remains the only new membership purchase route.
- Complete Apple and Google merchant requirements, plus Stripe identity/business verification only while its legacy or credit-pack flows remain enabled. Seek qualified tax/legal advice; Kivelle code cannot determine registration, refund, consumer-renewal, or invoice obligations for every jurisdiction.

