# Kivelle.AI

Kivelle.AI is an interactive storytelling and living-world entertainment platform built with Expo, TypeScript, and Supabase. A fictional companion has persistent identity, memories, relationships, a schedule, a social world, story arcs, shared Dates, and historical Moments.

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
- Character-stable xAI voice notes and credit-metered realtime calls for every tier that reconcile into canonical Kivelle conversation history
- Kivelli Stories: isolated, replayable authored mysteries with deterministic time loops, evidence, deductions, schedules, and multiple endings

## Kivelle plans and credits

The capability catalog lives in `packages/together-domain/src/entitlements.ts` and is consumed server-side. Never gate canonical truth or basic character quality in the client only.

- **Kivelle Free** — $0, up to 5 active conversations and 40 user messages per day, core continuity, 1 Life, 1 custom companion, free worlds, and 50 one-time welcome credits.
- **Kivelle+** — $19.99/month or $199.99/year, up to 20 active conversations with unlimited messages, deeper retrieval, all published worlds, 3 Lives, 5 custom companions, 500 monthly Credits with rollover to 1,000, one included successful photo per day, and one included Date souvenir photo per month.
- **Kivelle Max** — $39.99/month or $399.99/year, up to 50 active conversations with unlimited messages, deepest retrieval + Kivelle Director routing, 10 Lives, 20 custom companions, highest-priority media, 1,200 monthly Credits with rollover to 2,400, three included successful photos per day, three included Date souvenir photos per month, and early-access worlds.

Credits meter variable-cost generation rather than relationship actions. Chat, relationship progression, memories, Plans, Dates, Stories, and Moments do not spend credits. Plus includes one successful companion photo per UTC day and Max includes three; the pending request card lets the user choose an included photo or 10 Credits. Daily photos do not accumulate, and failed generations restore the reserved slot. Edits, variants, video, and additional photos use Credits. A four-image Creator appearance set costs 40. Life/Story/Moment photo opportunities remain provider-free until accepted; Date souvenir benefits are separately monthly-bounded. Terminal paid-generation failures refund the exact balance buckets that were spent.

## Authentication providers

Email/password remains available by default. Google and Apple use Supabase Auth and remain fail-closed until their provider credentials and redirect URLs are configured in the Supabase dashboard. The Expo app contains no Google client secret or Apple private key.

After configuring the providers, enable their UI at build time:

```text
EXPO_PUBLIC_KIVELLE_GOOGLE_AUTH_ENABLED=true
EXPO_PUBLIC_KIVELLE_APPLE_AUTH_ENABLED=true
```

Web/Android OAuth uses Supabase PKCE. iOS uses native Sign in with Apple with a hashed nonce and sends the resulting identity token to Supabase. Because this shared Supabase project keeps global auto-confirm for another app, Kivelle password signup creates an unconfirmed user server-side and sends a PKCE email magic link with user creation disabled; Kivelle never administratively marks a typed email as verified. After any provider authenticates, server-owned account state routes new users through explicit 18+ confirmation and then companion onboarding. Authentication itself never implies adulthood.

The production redirect allowlist is `https://kivelli.app/auth/callback`, `https://kivelli.app/reset-password`, `kivelli://auth/callback`, and `kivelli://reset-password`, plus the documented localhost, legacy `together://`, and temporary Expo preview equivalents. Native auth sessions use chunked SecureStore persistence with one-time AsyncStorage migration; web keeps browser storage. Apple only supplies a person's name on first consent, so Kivelle saves it immediately as account metadata while Persona identity remains separate.

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
KIVELLE_PUBLIC_APP_URL=https://kivelli.app
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

Dialogue routing defaults to `KIVELLE_OPENAI_DIALOGUE_MODEL=gpt-5.6-luna` with reasoning disabled and a server-enforced non-sexual romance ceiling. Legacy explicit preferences are normalized away, and the xAI chat route is disabled even when stale chat flags are present. xAI may remain configured independently for non-sexual voice. `KIVELLE_AI_COST_TELEMETRY_ENABLED=true` records server-only normalized token, cache, latency, routing, and cost events without storing prompts. Database-backed provider semaphores default to `KIVELLE_OPENAI_MAX_CONCURRENCY=64`; exhausted capacity engages the normal retry/fallback path instead of opening unbounded upstream connections.

Contextual image and short-video records are surfaced only when a real media provider has produced a ready asset. Media routing is provider-neutral; WaveSpeed runs through a durable asynchronous job/webhook/recovery path and never becomes a second source of character or world truth. Production media is limited to everyday and romantic imagery; legacy suggestive, mature, and explicit requests are rejected before provider selection and omitted from client snapshots.

Media dispatch uses request-time kicks plus a one-minute Supabase Cron recovery sweep. Configure the same random value as the Edge Function secret `TOGETHER_MEDIA_DISPATCH_SECRET` and the Vault secret `together_media_dispatch_secret`; Vault also needs `together_project_url`. `KIVELLE_MEDIA_MAX_INFLIGHT` defaults to `48` and provides server-side global image/video backpressure. Conversation turns, provider polling, and media finalization use expiring database leases so multiple Edge instances and devices cannot commit the same work concurrently.

See [WaveSpeed media operations](docs/wavespeed-media.md) for secrets, reference synchronization, canary rollout, recovery, and deployment.

See [Kivelle voice](docs/voice.md) for xAI TTS/realtime setup, native development-build requirements, transcript writeback, privacy, and usage accounting.

See [Kivelle group chat](docs/group-chat.md) for participant authority, isolated speaker context, witnessed knowledge, turn interruption, entitlements, and the Shared Scene bridge.

See [Kivelli Stories](docs/stories.md) for the content-driven Story Director, fact authorization, persistence policies, authoring validation, and campaign isolation.

See [Kivelle web billing](docs/billing.md) for Stripe Checkout, Portal, signed webhooks, unified Stripe/RevenueCat entitlements, monthly credit grants, test-mode validation, and the production operator checklist.

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
supabase functions deploy together-billing-grants
```

The CI workflow verifies linting, TypeScript, unit tests, starter-content isolation, Edge Function type checks, the web build, and database pgTAP integration tests.

See [apps/together/README.md](apps/together/README.md) for client setup and provider details.
