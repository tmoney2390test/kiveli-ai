# Kivelle web billing

Kivelle uses Stripe-hosted Checkout for web subscriptions and one-time credit packs, Stripe Customer Portal for self-service, signed Stripe webhooks for provider state, and Supabase for application entitlements and the immutable credit ledger. Native purchases remain RevenueCat-owned. `resolveSubscriptionState()` chooses one effective internal entitlement across both providers and grants each monthly benefit only up to the highest applicable tier.

No card number, Stripe secret, webhook secret, or Supabase service-role key belongs in Expo or browser code. The optional `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` is only for a future embedded Elements flow; hosted Checkout does not use it.

## Products and environment

Create recurring monthly and annual Stripe Prices for Kivelle+ and Kivelle Max, plus one-time Prices for each configured pack. The repository catalog remains authoritative for names, quantities, benefits, and displayed prices; the Edge Function maps safe keys to Price IDs.

Server-only Supabase secrets:

```text
STRIPE_SECRET_KEY=sk_test_... or sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_KIVELLE_PLUS_MONTHLY=price_...
STRIPE_PRICE_KIVELLE_PLUS_ANNUAL=price_...
STRIPE_PRICE_KIVELLE_MAX_MONTHLY=price_...
STRIPE_PRICE_KIVELLE_MAX_ANNUAL=price_...
STRIPE_PRICE_CREDITS_100=price_...
STRIPE_PRICE_CREDITS_300=price_...
STRIPE_PRICE_CREDITS_800=price_...
STRIPE_PRICE_CREDITS_2000=price_...
STRIPE_AUTOMATIC_TAX_ENABLED=false
STRIPE_MANAGED_PAYMENTS_ENABLED=false
KIVELLE_PUBLIC_APP_URL=https://kivelli.app
KIVELLE_BILLING_GRANT_SECRET=<random server secret>
```

Optional HTTPS URL overrides are `KIVELLE_CHECKOUT_SUCCESS_URL`, `KIVELLE_CHECKOUT_CANCEL_URL`, and `KIVELLE_BILLING_RETURN_URL`. Localhost HTTP is accepted for development; production/preview URLs must use HTTPS. Do not mix test and live keys or Price IDs.

The server pins Stripe API version `2026-02-25.clover`. Revalidate webhook fixtures before changing it.

## Stripe Dashboard setup

1. Create the products and Prices above with the exact catalog amounts currently shown in Kivelle.
2. Enable cards, Link, Apple Pay, and Google Pay under Payment methods. Checkout omits a manual method list so Stripe dynamically shows eligible methods.
3. Register the production domain for payment-method/domain verification where the Dashboard requests it.
4. Configure Customer Portal to update payment methods, show invoices, switch/cancel subscriptions, and cancel at period end.
5. Register `https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/together-billing-webhook` and subscribe to:
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
6. Copy the endpoint signing secret to `STRIPE_WEBHOOK_SECRET`.
7. If using Stripe Tax, configure registrations/product tax codes first, then enable `STRIPE_AUTOMATIC_TAX_ENABLED`. Stripe calculation does not by itself satisfy every tax registration, filing, or remittance obligation.
8. Kivelle explicitly uses standard Checkout by default. Enable `STRIPE_MANAGED_PAYMENTS_ENABLED` only after the Stripe account and every sellable product meet Managed Payments eligibility requirements, including eligible product tax codes.

## Monthly grants and rollover

Monthly subscriptions grant credits from the successful `invoice.paid` event. Annual plans advertise a monthly benefit, so they do **not** receive twelve months at once. `together-billing-grants` performs an idempotent daily sweep and fills only the current calendar month's benefit.

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

Generic trigger fixtures do not contain Kivelle metadata or configured Price IDs. For end-to-end grants, complete a real test Checkout from a local authenticated account, then use the resulting Customer/Subscription/PaymentIntent in Stripe CLI or Dashboard test clocks. Confirm:

- Checkout does not grant access before its signed webhook.
- A repeated event ID does not grant twice.
- A canceled-at-period-end plan retains access through its paid end.
- An unpaid/paused/terminal plan has no paid entitlement.
- Credit checkout is denied to free accounts.
- Refund/dispute adjustments never make a balance negative.

## Deployment and rollback

Deploy migration-first:

1. Back up and apply `202608280003_kivelli_stripe_billing_v2.sql` and `202608280004_kivelli_billing_grant_schedule.sql`.
2. Configure Edge Function secrets and Vault values.
3. Deploy `together-subscription`, `together-billing-webhook`, and `together-billing-grants`.
4. Register the webhook and perform test-mode checkout, renewal, failed-payment, cancellation, pack, refund, and dispute tests.
5. Deploy the web client only after verified webhook state appears in Supabase.

Rollback by disabling Checkout buttons/price secrets and the webhook endpoint before rolling back server code. The migrations are additive; retain billing events, subscriptions, ledger entries, and adjustments for audit. Do not delete or rewrite ledger rows. Unschedule `kivelli-annual-monthly-credit-grants` if the grant worker is disabled.

## Reconciliation and support

To reconcile, list Stripe subscriptions for stored `together_billing_customers`, fetch the latest provider objects, and replay/synchronize them through trusted server tooling. Compare them with `together_billing_subscriptions`; do not edit `together_entitlements` by hand. RevenueCat rows remain separate and the effective highest valid plan wins without doubling monthly credits.

Support staff may inspect `together_credit_accounts`, `together_credit_ledger`, `together_billing_events`, and `together_billing_adjustments` through restricted ops access. Correct balances only through a reviewed, idempotent adjustment RPC—never an ad-hoc `UPDATE`. `pending_review` adjustments indicate refunded/disputed purchased credits that had already been consumed.

## Account-owner checklist

- Confirm the public legal seller name/address and ensure it matches Stripe, checkout, receipts, Terms, and tax records.
- Configure `support@kivelli.app` and the public refund/cancellation policy.
- Create and approve live products/Prices, promotion-code policy, Portal configuration, branding, statement descriptor, tax registrations, and payout/bank details.
- Request written processor approval with an accurate description:

> Kivelli is an interactive storytelling and virtual-world entertainment platform. Users explore authored worlds and converse with fictional AI characters. Paid products include subscriptions and platform credits for additional conversations and media generation. Kivelli does not match users with real people and does not provide nudity, pornography, sexually explicit text, images or audio, escort services, or user-to-user payments. Some fictional stories may include non-explicit romantic relationships.

- Review Apple/Google rules before exposing web purchase links inside native builds. RevenueCat remains the native purchase route.
- Complete Stripe identity/business verification and seek qualified tax/legal advice. Kivelle code cannot determine registration, refund, consumer-renewal, or invoice obligations for every jurisdiction.

