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

- **Kivelle Free** — $0, 40 messages/day, core continuity, 1 Life, 1 custom companion, free worlds, 50 one-time welcome credits.
- **Kivelle+** — $14.99/month, unlimited conversations, deeper retrieval, all standard subscription worlds, 3 Lives, 5 custom companions, 500 monthly credits with rollover to 1,000.
- **Kivelle Max** — $29.99/month, deepest retrieval + Kivelle Director routing, 10 Lives, 20 custom companions, priority media, 1,500 monthly credits with rollover to 3,000, and explicitly flagged early-access worlds.

Credits meter variable-cost generation rather than relationship actions. Chat, relationship progression, memories, Plans, Dates, Stories, and Moments do not spend credits. Direct companion photos currently cost 10 credits and a four-image Creator appearance set costs 40. Automatic life/Date/Story/Moment photos are not charged. Terminal paid-generation failures refund the exact balance buckets that were spent.

## Billing provider boundary

Kivelle does not assume a specific payment vendor. The app reads subscription state from `together_entitlements`; only the signed `together-billing-webhook` should synchronize paid entitlement state from the billing system.

Configure these **Edge Function secrets** when a payment provider is connected:

```text
KIVELLE_BILLING_WEBHOOK_SECRET=
KIVELLE_PLUS_CHECKOUT_URL=
KIVELLE_MAX_CHECKOUT_URL=
KIVELLE_CREDITS_CHECKOUT_URL=
KIVELLE_BILLING_PORTAL_URL=
```

Checkout URLs may contain `{user_id}` and `{email}` placeholders. Only HTTPS URLs are returned to the client. Until these secrets are configured the plan screen remains functional for status/credits but clearly reports that checkout is not configured rather than faking a purchase.

The provider webhook sends `x-kivelle-billing-secret` and a normalized event body to `together-billing-webhook` for `subscription_updated`, `subscription_cancelled`, or `credit_purchase`. Credit purchases are permanent and idempotent; subscription grants are tied to the billing-period start when available and fall back to a calendar cycle only when no billing period exists.

## AI provider configuration

The Director is a bounded expression-planning pass; it cannot mutate Kivelle reality. It uses deterministic guidance when no model is configured or when the tier/interaction does not warrant a Director call.

Optional Edge Function secrets:

```text
KIVELLE_DIRECTOR_MODEL=gpt-5-mini
KIVELLE_DIRECTOR_GEMINI_MODEL=gemini-2.5-flash
```

The existing `OPENAI_API_KEY` / `GEMINI_API_KEY` configuration is reused. Director calls time out quickly and fall back to the deterministic response brief.

Contextual image records are modeled and surfaced only when a real media provider has produced a ready asset. The current build does not configure nudity or explicit-content providers.

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
