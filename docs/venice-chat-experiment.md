# Private chat model experiment

The AI tab in direct and group Chat Settings exposes a per-conversation chat model picker only to the existing verified `tmoney2390@gmail.com` account. The server authorizes the immutable Auth user ID in `_shared/kivelle-chat-model-test.ts`; client email, request-supplied IDs, and copied preferences cannot enable it.

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

Do not enable a conversation's preference automatically. The owner opts in through Chat Settings → AI → Chat model test → Save.

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

The original Venice deployment status above describes the initial implementation; check the current release and server switch before making operational changes. The WaveSpeed extension below is a separate release.

API contract and catalog reviewed September 10–11, 2026:

- https://docs.venice.ai/api-reference/endpoint/chat/completions
- https://docs.venice.ai/models/text


## WaveSpeed extension — September 11, 2026

The same private picker adds `deepseek_v4_flash` and `deepseek_v4_pro`, using the existing `WAVESPEED_API_KEY` with `https://llm.wavespeed.ai/v1/chat/completions`. The exact IDs are `deepseek/deepseek-v4-flash` and `deepseek/deepseek-v4-pro`. The dedicated adapter shares framing, cancellation, timeouts, context settlement and telemetry with Venice. It never calls the generic Any LLM prediction endpoint or accepts a different model. A returned native ID without the `deepseek/` prefix is accepted only when it exactly matches the requested model.

| Model | Input / million | Cached input / million | Output / million |
| --- | ---: | ---: | ---: |
| DeepSeek V4 Flash | $0.14 | $0.028 | $0.28 |
| DeepSeek V4 Pro | $0.66 | $0.022 | $1.98 |

Rates were verified against the public `/v1/models/{provider/model}` catalog. Pro's website rounds output pricing to $2.00; the catalog returns $1.98. Both context windows are advertised as 1,048,576 tokens, but the application's existing plan/context ceilings and bounded reply profiles still apply. Usage cost is a catalog estimate, including actual cache hits when reported; no undocumented streaming cost field is treated as a USD invoice. Missing usage uses a conservative upper estimate and is labelled unavailable.

WaveSpeed requests `max_tokens`, streaming usage, `reasoning: { enabled: false }` and `include_reasoning: false`. The catalog lists those reasoning parameters, but authenticated inference must still verify the gateway honors the nonthinking request. If usage reports reasoning tokens, diagnostics metadata records `provider_default`, and all completion tokens are included in cost. Reasoning deltas never become visible chat text. Model access and adult-dialogue quality remain live evaluation items; this implementation does not establish either.

The existing immutable-account gate, adult authorization and consent checks apply. The extension does not enable itself or choose a model for the owner. The database row `venice-owner-chat`, snapshot field `veniceTest`, and preference `veniceTestModel` intentionally retain their names so existing clients and saved Venice selections stay compatible. New reply metadata uses `chatModelTest`; Venice replies also retain `veniceTest`. The existing Venice same-provider repair from PR #85 is preserved. WaveSpeed has no automatic refusal retry or provider fallback.

Provider-specific switches:

- Missing `VENICE_API_KEY` hides only Venice choices; missing `WAVESPEED_API_KEY` hides only WaveSpeed choices.
- `KIVELLE_WAVESPEED_CHAT_TEST_ENABLED=false` disables only WaveSpeed chat choices, leaving video and Venice configuration alone.
- `KIVELLE_WAVESPEED_CHAT_MAX_CONCURRENCY` defaults to 2 and is bounded to 1–8, separate from video capacity.
- The existing database switch and `KIVELLE_VENICE_CHAT_TEST_ENABLED=false` remain global emergency controls for this private experiment.
- Key availability, selection and catalog/database version changes invalidate quotes and frozen targets. Each outbound request checks current ownership, provider and exact model.

Release steps for this extension:

1. Apply `20260911114758_kivelle_wavespeed_chat_test.sql` to allow WaveSpeed usage rows. It preserves the current experiment state, version and client permissions.
2. Release the settings, quote, direct/group dialogue and bootstrap functions together, then publish the updated web build. Follow the normal release process for other functions bundling changed shared files.
3. Make harmless, small authenticated streaming requests with both exact models and the adapter body. Confirm terminal events, returned IDs, usage, reasoning behavior and prices. A video-capable key alone is not proof of text-model access.
4. Verify owner-only visibility and saving, select each model in a test conversation, inspect its diagnostics/usage record, then use Off to confirm normal routing.

This session has no authenticated Cloudflare CLI access or local WaveSpeed key. This extension has not been deployed or tested against authenticated model inference. Do not describe the new picker as live until release verification finishes.

Sources:

- https://wavespeed.ai/docs/llm-service-quick-start
- https://wavespeed.ai/docs/supported-llm-models
- https://llm.wavespeed.ai/v1/models/deepseek/deepseek-v4-flash
- https://llm.wavespeed.ai/v1/models/deepseek/deepseek-v4-pro
