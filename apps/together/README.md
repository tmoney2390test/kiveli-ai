# Together

Together is an Expo application with its own client, domain package, Supabase functions, and migrations. Every application table, function, storage bucket, and policy is prefixed with `together_` or `together-`.

## Run locally

```sh
pnpm install
pnpm web
```

Public Supabase values have safe project defaults. Copy `.env.example` when overriding them locally. Never add AI keys or Supabase privileged credentials to the Expo environment.

For a local visual fixture without creating an account, start with `EXPO_PUBLIC_TOGETHER_DEMO_MODE=true`. The fixture is development-only and cannot activate in a production bundle.

## Server configuration

Dialogue, moderation, and embeddings are server-side provider interfaces. With `OPENAI_API_KEY` unset, dialogue uses a deterministic continuity fallback and embeddings are skipped without failing the conversation.

Optional server secrets:

- `OPENAI_API_KEY`
- `TOGETHER_DIALOGUE_MODEL`
- `TOGETHER_MODERATION_MODEL`
- `TOGETHER_EMBEDDING_MODEL`
- `TOGETHER_DEBUG_USER_IDS`

Together uses the existing server-side `GEMINI_API_KEY` for dialogue and memory embeddings, with a deterministic fallback if the provider is unavailable. `OPENAI_API_KEY` remains supported as an alternative provider. Conversation and memory-embedding inputs leave Supabase only from the Edge Function; provider credentials never reach the mobile app.

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
