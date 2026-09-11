# Private Venice chat experiment

The AI tab in direct and group Chat Settings exposes a per-conversation Venice model picker only to the existing verified `tmoney2390@gmail.com` account. The server authorizes the immutable Auth user ID in `_shared/kivelle-venice-test.ts`; client email, request-supplied IDs, and copied preferences cannot enable it.

Choices default to Off. The experiment replaces an already-authorized foreground xAI adult-dialogue route. Existing adult access, character/participant eligibility, AI data consent, subscription, moderation, and platform checks still apply. Normal dialogue and background/media/voice generation retain their current routes. Existing shared-scene restrictions still apply; this feature does not authorize additional adult speakers.

Venice uses its own Chat Completions streaming adapter. Failures remain errors with instructions to retry or turn the test off. It never retries through a different provider. Group turns freeze the selected experiment target; configuration or preference changes stop subsequent Venice requests. These models receive no reasoning parameter. Chat style, context, language and dynamism still use the existing prompt compiler.

The compiled dialogue prompt is text. Existing attachment descriptions remain part of that compiled context; this adapter does not upload image, audio or video inputs to Venice chat.

## Configuration

The migration creates `kivelle_dialogue_experiments` with its single row disabled. RLS and revoked client privileges make this a server-only rollout switch. This replaces the proposed environment-only switch so an operator can disable the experiment without changing secrets or redeploying functions.

- `VENICE_API_KEY`: existing server secret; text-model permissions still require a live check.
- `KIVELLE_VENICE_CHAT_TEST_ENABLED=false`: optional emergency environment override; always disables access, even if the database switch is enabled.
- `KIVELLE_VENICE_MAX_CONCURRENCY`: defaults to 2, bounded to 1–8.
- The exact three model IDs, prices and capabilities are in `packages/together-domain/src/venice-chat.ts`. Change its version whenever the allowlist or rates change.
- Changing the database configuration must increment its version. Existing quotes then require refresh.

```sql
-- Enable only after deployment and model-access checks pass.
update public.kivelle_dialogue_experiments
set enabled = true, version = version + 1
where id = 'venice-owner-chat';

-- Roll back routing immediately; saved preferences become inert.
update public.kivelle_dialogue_experiments
set enabled = false, version = version + 1
where id = 'venice-owner-chat';
```

Do not enable a conversation's preference automatically. The owner opts in through Chat Settings → AI → Venice test → Save.

## Pricing and telemetry

Quotes and cost accounting share the exact model catalog. Expanded context continues to use the existing credit formula, hold and settlement cap. No subscription, credit bundle, allowance or balance changes are included. Missing usage is marked unknown and assigned a conservative cost estimate, including on failed or cancelled attempts. A numeric provider USD cost is recorded separately; DIEM-funded responses use a USD rate estimate instead of assuming zero USD cash means free inference.

Owner-only reply details show actual model, first-token and total latency, available token counts, and clearly labelled cost. First-token time is adapter timing, before any additional UI delivery/moderation delay. Business-cost telemetry also records failures, model mismatch, experiment/version, finish reason, attempt number, requested/effective reasoning and cost source. It never stores the prompt or generated text.

```sql
select provider, model, success, count(*) as attempts,
       sum(coalesce(provider_cost_usd, estimated_cost_usd)) as cost_usd,
       avg(latency_ms) as mean_latency_ms,
       count(*) filter (where metadata->>'usageMissing' = 'true') as missing_usage
from public.together_ai_usage_events
where created_at >= now() - interval '7 days'
  and metadata->'experiment' is not null
group by provider, model, success
order by model, success;
```

## Verification and rollout

Local verification: application and domain tests; lint and TypeScript; six affected foreground/bootstrap Edge Function entrypoints; eight server authorization/adapter tests; SSE fixtures; migration/RLS checks; production web export and Supabase gateway configuration verification.

Dedicated checks also run in GitHub CI:

```sh
deno test --allow-env --no-lock --unstable-sloppy-imports --config supabase/functions/deno.json supabase/functions/_shared/kivelle-venice-test_test.ts supabase/functions/_shared/kivelle-venice-dialogue_test.ts
node scripts/test-venice-chat-db.mjs
```

Deployment order:

1. Apply `20260910234911_kivelle_venice_owner_chat.sql`, leaving the switch disabled.
2. Deploy the changed settings, quote, direct/group dialogue and bootstrap handlers together. Rebuild other deployed functions that bundle changed shared dependencies as part of the normal Edge Function release.
3. Publish the production web export through `infra/cloudflare/kivelli-app-gateway/wrangler.jsonc`. Supported native apps receive the picker on their next app release.
4. Verify the existing Venice secret can use all three exact text-model IDs with harmless, small streaming requests using the adapter's body. Check final usage, returned model and terminal events. Do not enable models whose access has not passed.
5. Check owner and second-account visibility/save authorization, then enable the server switch and let the owner choose a model. Confirm a normal reply retains normal routing and an eligible adult reply records Venice diagnostics and a usage row.

At implementation time, Cloudflare CLI authentication is unavailable and no Cloudflare connector is connected. The production build is ready locally, but live deployment, model-access smoke checks, and activation have not been performed. Keep the server switch disabled until those checks complete.

API contract and catalog reviewed September 10–11, 2026:

- https://docs.venice.ai/api-reference/endpoint/chat/completions
- https://docs.venice.ai/models/text
