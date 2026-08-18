# WaveSpeed media operations

Kivelle owns identity, place, scene, policy, entitlements, credits, and historical media context. WaveSpeed is an asynchronous generation provider behind the provider-neutral media router.

## Secrets and rollout

Set secrets only in Supabase. Never place `WAVESPEED_API_KEY` or `WAVESPEED_WEBHOOK_SECRET` in Expo configuration, a client `.env`, logs, job metadata, or source control.

```sh
pnpm exec supabase secrets set --project-ref YOUR_PROJECT_REF \
  WAVESPEED_API_KEY=... WAVESPEED_WEBHOOK_SECRET=... \
  KIVELLE_WAVESPEED_ENABLED=true KIVELLE_WAVESPEED_CANARY_PERCENT=5
```

Increase the canary only after the benchmark set and production telemetry are healthy. `KIVELLE_IMAGE_PROVIDER=wavespeed` opts all eligible image requests into WaveSpeed; otherwise the stable hash canary selects requests. Video and LoRA are independently gated.

The API key supplied to Kivelle is a server secret. If it has ever been pasted into a ticket, screenshot, or public log, rotate it in WaveSpeed before production rollout. WaveSpeed also supplies a separate webhook-signing secret; an API key is not a substitute for that secret.

## Async lifecycle

1. Kivelle records a canonical media row and spends credits idempotently.
2. The dispatcher records a durable provider job before submission.
3. It submits exactly once. A submission timeout becomes `submission_unknown`; Kivelle does not blindly repeat the POST.
4. A signed webhook or recovery poll matches `(provider, provider_request_id)`.
5. Kivelle downloads the temporary output, validates MIME/size, and copies it to the private `together-user-media` bucket.
6. Finalization is idempotent. Terminal failure refunds the original transaction once.

Webhook verification uses the raw request body, the `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers, HMAC-SHA256, constant-time comparison, and a five-minute replay window. Webhook IDs are persisted to reject replays.

## Canonical references

Run a dry run first:

```sh
pnpm media:sync-references
pnpm media:sync-references -- --apply
```

The tool hashes and uploads official character portraits plus canonical world/location artwork, then creates revisioned `together_media_reference_assets` rows. Existing generated requests snapshot asset IDs and revisions, so updating a venue image does not rewrite history.

The sync command requires `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. It never prints either value.

## Creator and character LoRAs

Creator appearance sets use the same async provider-job ledger when `KIVELLE_WAVESPEED_CREATOR_ENABLED=true`. Drafts remain editable while the three candidates are being generated, and the client refreshes their status without inventing successful media.

Prepare a curated, non-duplicated 10–20 image training set with a dry run first:

```sh
pnpm media:prepare-lora -- --character=maya --images=/secure/curated/maya
pnpm media:prepare-lora -- --character=maya --images=/secure/curated/maya --apply
```

The command uploads revisioned training references and a private ZIP, then creates a `pending` Z-Image profile. The dispatcher submits training asynchronously. A signed webhook or recovery poll downloads the resulting `.safetensors` into the private `kivelle-model-assets` bucket before atomically marking that revision ready. An older ready revision remains usable throughout retraining.

Create a review matrix before enabling experimental routes:

```sh
pnpm media:create-benchmark
pnpm media:create-benchmark -- --apply
```

This records the route/scenario matrix and review rubric. It deliberately does not call expensive or adult-capable routes automatically; staff must run and score each route before changing its validation feature flag.

## Recovery

The dispatcher reconciles confirmed WaveSpeed requests by provider ID before claiming new work. Webhooks are the primary completion path; polling is the recovery path. Confirmed async submissions are excluded from the generic stale-job requeue function.

To inspect without exposing prompts or secrets:

```sql
select provider, route_id, status, count(*)
from together_media_provider_jobs
group by provider, route_id, status;
```

Jobs older than 45 minutes fail safely and refund. `submission_unknown` is intentionally terminal and requires a new user action rather than a hidden duplicate submission.

## Deployment

```sh
pnpm exec supabase db push --linked
pnpm exec supabase functions deploy together-media --no-verify-jwt
pnpm exec supabase functions deploy together-media-dispatch --no-verify-jwt
pnpm exec supabase functions deploy together-wavespeed-webhook --no-verify-jwt
```

The existing `together-creator` function must also be redeployed when enabling asynchronous Creator appearance generation. Set `KIVELLE_WAVESPEED_CREATOR_ENABLED=false` until the standard image canary is healthy. Set `KIVELLE_WAVESPEED_LORA_ENABLED=false`, `KIVELLE_VIDEO_ENABLED=false`, and all adult-route flags to false until their respective benchmark suites pass.

Deploy the web app only after migrations and functions are live. Start with the provider enabled and canary at zero, sync references, run a controlled benchmark, then raise the canary.
