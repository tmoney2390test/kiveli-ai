# Together

Together is an Expo application with its own client, domain package, Supabase functions, and migrations. Every application table, function, storage bucket, and policy is prefixed with `together_` or `together-`.

## Run locally

```sh
pnpm install
pnpm web
```

Copy `.env.example` and provide both public Supabase values before starting the app. Missing configuration fails fast instead of silently connecting a local build to production. Never add AI keys or Supabase privileged credentials to the Expo environment.

Google and Apple login are implemented through Supabase Auth. Configure each provider in Supabase, add the Kivelle web and `kivelli://` callback URLs to its allowlist, then set the matching `EXPO_PUBLIC_KIVELLE_*_AUTH_ENABLED=true` build flag. Provider secrets stay in Supabase/Apple/Google configuration; only the boolean availability flags belong in Expo. Production Google is enabled; Apple remains fail-closed until its Supabase provider configuration is complete. See [Apple authentication operations](../../docs/apple-authentication.md) for the exact production identifiers, credential order, tests, and six-month secret rotation requirement.

Canonical callbacks are `https://kivelli.app/auth/callback`, `https://kivelli.app/reset-password`, `kivelli://auth/callback`, and `kivelli://reset-password`. The old `together://` scheme remains registered temporarily for development-build compatibility. Local web uses the same paths on `http://localhost:8082`. All providers route profileless users through `/age-confirmation`; only a server-validated adult birthdate creates `age_verified_at`, and onboarding completion is tracked separately.

For a local visual fixture without creating an account, start with `EXPO_PUBLIC_TOGETHER_DEMO_MODE=true`. The fixture is development-only and cannot activate in a production bundle.

## Server configuration

Dialogue, moderation, and embeddings are server-side provider interfaces. Dialogue defaults to OpenAI `gpt-5.6-luna`; eligible private explicit text can use the separately configured xAI route when `KIVELLE_PRIVATE_ADULT_TEXT_MODE=on`. Adult eligibility and current character/group adulthood are resolved server-side and do not depend on subscription tier. This private-text policy is shared by web and native clients, while native explicit image/video generation remains unavailable. With `OPENAI_API_KEY` unset, non-explicit dialogue can fall back to Gemini or deterministic continuity behavior; embeddings are skipped without failing the conversation. Voice retains its separate non-explicit policy.

Optional server secrets:

- `OPENAI_API_KEY`
- `KIVELLE_VISION_PROVIDER=openai` and `KIVELLE_OPENAI_VISION_ENABLED=true` enable server-side moderation and visual understanding for Kivelle+ photo sharing; `KIVELLE_OPENAI_VISION_MODEL` optionally overrides the default Luna model.
- `KIVELLE_OPENAI_DIALOGUE_MODEL` (defaults to `gpt-5.6-luna`)
- `KIVELLE_CHAT_GENERATION_CONTROLS_MODE` (`off`, `shadow`, or `on`; missing/invalid values fail closed to `off`)
- `KIVELLE_PRIVATE_ADULT_TEXT_MODE` (`off`, `shadow`, or `on`; server-only, defaults to `off`)
- `KIVELLE_PROACTIVE_VOICE_ENABLED` and `KIVELLE_PROACTIVE_MODEL` control the optional isolated character-voice pass for grounded companion initiative. See `docs/initiative.md`.
- `XAI_API_KEY` (server only)
- `KIVELLE_XAI_ENABLED`
- `KIVELLE_XAI_DIALOGUE_MODEL` (defaults to `grok-4.3`)
- `KIVELLE_XAI_FAST_DIALOGUE_MODEL` (optional Fast-mode override; defaults to the standard xAI dialogue model)
- `KIVELLE_XAI_FAST_VISIBLE_TOKEN_CAP` (defaults to `240`; bounds Fast-mode Grok replies to reduce completion latency and output cost)
- `KIVELLE_XAI_EXPLICIT_ENABLED`
- `KIVELLE_AI_COST_TELEMETRY_ENABLED`
- `KIVELLE_TRUST_CONSEQUENCES_V2` (server-only emergency switch; defaults on, and `false` stops applying new dialogue-derived trust losses/repairs while preserving history)
- `TOGETHER_DIALOGUE_MODEL` (legacy fallback)
- `TOGETHER_MODERATION_MODEL`
- `TOGETHER_EMBEDDING_MODEL`
- `TOGETHER_DEBUG_USER_IDS`

Kivelle keeps canonical state in Supabase and sends only the compiled turn context from Edge Functions to the selected inference provider. Provider credentials never reach the mobile app. Prompt/message content is excluded from AI cost telemetry and operational logs.

Companion voice notes and live calls extend those same provider-neutral boundaries. xAI TTS voice notes are available to Kivelle+ and Max. Realtime calls are available to every tier through a customer-controlled Essential/Immersive selector. Both routes draw from the shared Kivelle Credit balance with server-authoritative, idempotent metering that begins at the first finalized user response. Native realtime PCM capture/playback requires an Expo development build because `@edkimmel/expo-audio-stream` is not present in Expo Go. See [the voice operations guide](../../docs/voice.md) for secrets, flags, transport details, transcript reconciliation, privacy, economics, and rollout.

First-class group chat uses the same canonical conversation, memory, relationship, safety, and provider layers. Each selected speaker gets a fresh private context; group membership, witnessed sequence boundaries, turn cancellation, and the subscription gate remain server-authoritative. See [the group chat architecture guide](../../docs/group-chat.md).

## Boundaries

- Character templates and immutable versions define canonical identity.
- Character instances, relationships, memories, schedules, life events, dates, and Moments are application-owned state.
- Model output can propose narrative content; server rules clamp or reject state changes.
- Character knowledge transfers are explicit records. Chloe cannot infer a fact told only to Maya.
- Memory extraction is secondary work and cannot roll back a saved conversation.

## Verification

Native Apple/Google subscriptions use RevenueCat as a store-lifecycle adapter while Kivelle's webhook-synchronized `together-subscription` state remains authoritative. New website membership checkout can stay disabled without affecting valid mobile entitlements on the website. Legacy Stripe management and configured credit-pack compatibility remain isolated. See [the billing operations guide](../../docs/billing.md) for RevenueCat products, package identifiers, HMAC webhook setup, EAS variables, rollout switches, and test verification.

```sh
pnpm --filter @together/app typecheck
pnpm --filter @together/domain test
pnpm lint
```
