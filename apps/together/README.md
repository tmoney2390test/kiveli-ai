# Together

Together is an Expo application with its own client, domain package, Supabase functions, and migrations. Every application table, function, storage bucket, and policy is prefixed with `together_` or `together-`.

## Run locally

```sh
pnpm install
pnpm web
```

Public Supabase values have safe project defaults. Copy `.env.example` when overriding them locally. Never add AI keys or Supabase privileged credentials to the Expo environment.

Google and Apple login are implemented through Supabase Auth and default off. Configure each provider in Supabase, add the Kivelle web and `together://` callback URLs to its allowlist, then set the matching `EXPO_PUBLIC_KIVELLE_*_AUTH_ENABLED=true` build flag. Provider secrets stay in Supabase/Apple/Google configuration; only the boolean availability flags belong in Expo.

For a local visual fixture without creating an account, start with `EXPO_PUBLIC_TOGETHER_DEMO_MODE=true`. The fixture is development-only and cannot activate in a production bundle.

## Server configuration

Dialogue, moderation, and embeddings are server-side provider interfaces. Standard dialogue defaults to OpenAI `gpt-5.6-luna` with reasoning disabled. Eligible adult-explicit dialogue can use xAI `grok-4.3` only when the server-side xAI key and both route flags are enabled. With `OPENAI_API_KEY` unset, standard dialogue falls back to Gemini or deterministic continuity behavior; embeddings are skipped without failing the conversation.

Optional server secrets:

- `OPENAI_API_KEY`
- `KIVELLE_OPENAI_DIALOGUE_MODEL` (defaults to `gpt-5.6-luna`)
- `XAI_API_KEY` (server only)
- `KIVELLE_XAI_ENABLED`
- `KIVELLE_XAI_DIALOGUE_MODEL` (defaults to `grok-4.3`)
- `KIVELLE_XAI_EXPLICIT_ENABLED`
- `KIVELLE_AI_COST_TELEMETRY_ENABLED`
- `TOGETHER_DIALOGUE_MODEL` (legacy fallback)
- `TOGETHER_MODERATION_MODEL`
- `TOGETHER_EMBEDDING_MODEL`
- `TOGETHER_DEBUG_USER_IDS`

Kivelle keeps canonical state in Supabase and sends only the compiled turn context from Edge Functions to the selected inference provider. Provider credentials never reach the mobile app. Prompt/message content is excluded from AI cost telemetry and operational logs.

## Boundaries

- Character templates and immutable versions define canonical identity.
- Character instances, relationships, memories, schedules, life events, dates, and Moments are application-owned state.
- Model output can propose narrative content; server rules clamp or reject state changes.
- Character knowledge transfers are explicit records. Chloe cannot infer a fact told only to Maya.
- Memory extraction is secondary work and cannot roll back a saved conversation.

## Verification

```sh
pnpm --filter @together/app typecheck
pnpm --filter @together/domain test
pnpm lint
```
