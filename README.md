# Kivelle.AI

Kivelle.AI is an adult relationship and living-world simulation built with Expo, TypeScript, and Supabase. A companion has persistent identity, memories, relationships, a schedule, a social world, story arcs, shared Dates, and historical Moments.

## Product systems

- Living worlds with companions, hierarchical locations, life events, and lazy simulation
- Structured long-term memories, open threads, relationship progression, and periodic relationship reflections
- Character Bible + qualitative relationship stance + anti-repetition + response-brief prompt compilation
- Tier-aware conversation context with Kivelle Director routing on meaningful interactions
- Template-driven Dates with variable scenes and choice outcomes
- Spoiler-safe story threads, historical Moments, and companion-specific profiles
- Discover for people, experiences, worlds, and future trips
- Custom companion creation, Personas, isolated Kivelle Lives, and world-aware first meetings
- Proactive communication, privacy controls, reporting, and internal debug tools
- Server-side AI orchestration with capability-gated content modes
- Three subscription tiers plus Kivelle Credits for variable-cost media generation

## Kivelle plans and credits

The capability catalog lives in `packages/together-domain/src/entitlements.ts` and is consumed server-side. Never gate canonical truth or basic character quality in the client only.

- **Kivelle Free** — $0, 40 messages/day for the first 7 days and 20/day afterward, core continuity, 1 Life, 1 custom companion, free worlds, and 50 one-time welcome credits.
- **Kivelle+** — $14.99/month or $149.99/year, unlimited conversations, deeper retrieval, all standard subscription worlds, 3 Lives, 5 custom companions, 300 monthly credits with rollover to 600, and one included Date souvenir photo per month.
- **Kivelle Max** — $34.99/month or $349.99/year, deepest retrieval + Kivelle Director routing, 10 Lives, 20 custom companions, highest-priority media, 1,000 monthly credits with rollover to 2,000, three included Date souvenir photos per month, and explicitly flagged early-access worlds.

Credits meter variable-cost generation rather than relationship actions. Chat, relationship progression, memories, Plans, Dates, Stories, and Moments do not spend credits. Direct companion photos currently cost 10 credits and a four-image Creator appearance set costs 40. Life/Story/Moment photo opportunities remain provider-free until the user accepts a 10-credit offer; paid Date souvenir benefits are monthly-bounded. Terminal paid-generation failures refund the exact balance buckets that were spent.

## Authentication providers

Email/password remains available by default. Google and Apple use Supabase Auth and remain fail-closed until their provider credentials and redirect URLs are configured in the Supabase dashboard. The Expo app contains no Google client secret or Apple private key.

After configuring the providers, enable their UI at build time:

```text
EXPO_PUBLIC_KIVELLE_GOOGLE_AUTH_ENABLED=true
EXPO_PUBLIC_KIVELLE_APPLE_AUTH_ENABLED=true
```

Web/Android OAuth uses Supabase PKCE. iOS uses native Sign in with Apple with a hashed nonce and sends the resulting identity token to Supabase. Keep `https://ttutten-together.expo.app/auth/callback` and `together://auth/callback` in the Supabase Auth redirect allowlist. Apple only supplies a person's name on first consent, so Kivelle saves it immediately as account metadata while Persona identity remains separate.

## Billing provider boundary

Kivelle reads subscription state from `together_entitlements`. The Stripe adapter creates short-lived hosted Checkout/Customer Portal sessions server-side and the signed webhook synchronizes that existing entitlement and credit architecture. Kivelle stores Stripe customer/subscription identifiers but never card or payment-method data. Legacy normalized-provider URLs remain available as a compatibility fallback.

Configure these **Edge Function secrets** for Stripe:

```text
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_KIVELLE_PLUS_MONTHLY=price_...
STRIPE_PRICE_KIVELLE_MAX_MONTHLY=price_...
STRIPE_PRICE_CREDITS_100=price_...
STRIPE_PRICE_CREDITS_300=price_...
STRIPE_PRICE_CREDITS_800=price_...
STRIPE_PRICE_CREDITS_2000=price_...
KIVELLE_PUBLIC_APP_URL=https://ttutten-together.expo.app
```

Register `together-billing-webhook` as the Stripe webhook endpoint and subscribe to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`. Signature validation uses the raw request body and a five-minute replay window. Checkout and credit grants are idempotent. Until Stripe is configured, the plan screen still provides status and credit balances and clearly reports that checkout is unavailable.

The former `x-kivelle-billing-secret` normalized event contract remains accepted for staged migration from another billing provider. Credit purchases are permanent and idempotent; subscription grants are tied to the billing-period start when available and fall back to a calendar cycle only when no billing period exists.

## AI provider configuration

The Director is a bounded expression-planning pass; it cannot mutate Kivelle reality. It uses deterministic guidance when no model is configured or when the tier/interaction does not warrant a Director call.

Optional Edge Function secrets:

```text
KIVELLE_DIRECTOR_MODEL=gpt-5-mini
KIVELLE_DIRECTOR_GEMINI_MODEL=gemini-2.5-flash
```

The existing `OPENAI_API_KEY` / `GEMINI_API_KEY` configuration is reused. Director calls time out quickly and fall back to the deterministic response brief.

Dialogue routing defaults to `KIVELLE_OPENAI_DIALOGUE_MODEL=gpt-5.6-luna` with reasoning disabled. The optional adult-explicit route requires `XAI_API_KEY`, `KIVELLE_XAI_ENABLED=true`, and `KIVELLE_XAI_EXPLICIT_ENABLED=true`; it defaults to `KIVELLE_XAI_DIALOGUE_MODEL=grok-4.3`. `KIVELLE_AI_COST_TELEMETRY_ENABLED=true` records server-only normalized token, cache, latency, routing, and cost events without storing prompts.

Contextual image and short-video records are surfaced only when a real media provider has produced a ready asset. Media routing is provider-neutral; WaveSpeed runs through a durable asynchronous job/webhook/recovery path and never becomes a second source of character or world truth. Higher-intensity routes remain independently gated by age verification, user preferences, character boundaries, validated model routes, and server feature flags.

See [WaveSpeed media operations](docs/wavespeed-media.md) for secrets, reference synchronization, canary rollout, recovery, and deployment.

## Run locally

```sh
pnpm install
cp apps/together/.env.example apps/together/.env
pnpm web
```

Place the public Supabase URL and publishable key in `apps/together/.env`. Configure privileged Supabase, AI, billing, and media credentials only as Edge Function secrets.

## Database and functions

Link the repository to the intended Supabase project, apply additive migrations, then deploy the Kivelle functions:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy together-bootstrap
supabase functions deploy together-dialogue
supabase functions deploy together-date
supabase functions deploy together-subscription
supabase functions deploy together-billing-webhook
```

The CI workflow verifies linting, TypeScript, unit tests, starter-content isolation, Edge Function type checks, the web build, and database pgTAP integration tests.

See [apps/together/README.md](apps/together/README.md) for client setup and provider details.
