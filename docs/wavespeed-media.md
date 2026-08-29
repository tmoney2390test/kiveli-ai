# WaveSpeed media operations

Kivelle owns identity, place, scene, policy, entitlements, credits, and historical media context. WaveSpeed is an asynchronous generation provider behind the provider-neutral media router.

## Secrets and rollout

Set secrets only in Supabase. Never place `WAVESPEED_API_KEY` or `WAVESPEED_WEBHOOK_SECRET` in Expo configuration, a client `.env`, logs, job metadata, or source control.

```sh
pnpm exec supabase secrets set --project-ref YOUR_PROJECT_REF \
  WAVESPEED_API_KEY=... WAVESPEED_WEBHOOK_SECRET=... \
  TOGETHER_MEDIA_DISPATCH_SECRET=... KIVELLE_MEDIA_MAX_INFLIGHT=48 \
  KIVELLE_WAVESPEED_ENABLED=true KIVELLE_WAVESPEED_CANARY_PERCENT=5
```

Store the same dispatcher value in Supabase Vault as `together_media_dispatch_secret`; Vault also needs `together_project_url`. The migration schedules a one-minute recovery sweep. Request-time kicks remain the fast path, so a dropped HTTP kick adds bounded delay instead of stranding a queued request.

Increase the canary only after the benchmark set and production telemetry are healthy. `KIVELLE_IMAGE_PROVIDER=wavespeed` opts all eligible image requests into WaveSpeed; otherwise the stable hash canary selects requests. Video and LoRA are independently gated.

Two-character group photos use the dedicated `wavespeed-ai/qwen-image-2.0-pro/edit` route with two ordered identity references, or three references when editing an existing group photo. Enable standard and romantic group photos with `KIVELLE_WAVESPEED_GROUP_IMAGES_ENABLED=true`. Adult group levels additionally require `KIVELLE_ADULT_MEDIA_ENABLED=true` and `KIVELLE_WAVESPEED_GROUP_ADULT_ROUTE_VALIDATED=true`; every selected companion still passes Kivelle's independent age, fictionality, relationship, preference, consent, and boundary checks before submission. This route is excluded from direct-chat routing.

## Video model selector

The video selector is fail-closed and server-owned. The client submits only a source-media ID, canonical route ID, motion preset, and idempotency ID. Duration, resolution, model, provider, audio policy, prompt, references, price, and provider ceiling are resolved again in `together-media`.

Testing routes use the current official WaveSpeed contracts:

| Kivelle route | WaveSpeed model | Exact five-second payload settings | Audio |
| --- | --- | --- | --- |
| `wavespeed-gemini-omni-flash-i2v` | `google/gemini-omni-flash/image-to-video` | `image`, server prompt, `aspect_ratio`, `duration: 5` | Provider generates synchronized audio; Kivelle starts muted |
| `wavespeed-minimax-h3-i2v` | `minimax/h3/image-to-video` | `image`, server prompt, `resolution: 768p`, `duration: 5` | Provider default; the current schema exposes no audio toggle |
| `wavespeed-p-video-i2v` | `pruna-ai/p-video/image-to-video` | `image`, server prompt, `duration: 5`, `resolution: 720p`, `seed: -1`, `save_audio: false` | Silent |
| `wavespeed-gemini-omni-flash-r2v` | `google/gemini-omni-flash/reference-to-video` | ordered source + up to two canonical identity images, server prompt, `aspect_ratio`, `duration: 5` | Provider generates synchronized audio; Kivelle starts muted |

The current P-Video catalog page advertises a lower starting run price than the original product estimate. Kivelle therefore calls `POST /api/v3/model/price` with the exact server-built payload before reserving 125 testing credits. A quote above the per-route ceiling is rejected before any debit. Provider schemas currently do not expose a supported safety-check input for these four payloads, so Kivelle does not invent one; completion metadata is enforced fail-closed and the output is signature/size/type checked before private storage delivery. Finalization also inspects delivered MP4 handler tracks and stores actual audio as `has_audio`, `silent`, or `unknown` separately from the requested provider behavior.

Use `KIVELLE_VIDEO_MODEL_SELECTOR_MODE=testers` with `KIVELLE_VIDEO_TESTER_USER_IDS` for the initial run. Every route also requires its individual enable flag and cost ceiling. The legacy LTX/Spicy route is disabled and is never a fallback.

The API key supplied to Kivelle is a server secret. If it has ever been pasted into a ticket, screenshot, or public log, rotate it in WaveSpeed before production rollout. WaveSpeed also supplies a separate webhook-signing secret; an API key is not a substitute for that secret.

## Async lifecycle

1. Kivelle records a canonical media row and spends credits idempotently.
2. The dispatcher records a durable provider job before submission.
3. It submits exactly once. A submission timeout becomes `submission_unknown`; Kivelle does not blindly repeat the POST.
4. A signed webhook or atomically leased recovery poll matches `(provider, provider_request_id)`.
5. Kivelle downloads the temporary output, validates MIME/size, and copies it to the private `together-user-media` bucket.
6. Webhooks and pollers compete for the same expiring finalization lease, so only one worker downloads and stores the result. Terminal failure refunds the original transaction once.

Webhook verification uses the raw request body, the `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers, HMAC-SHA256, constant-time comparison, and a five-minute replay window. Webhook IDs are persisted to reject replays.

## Canonical references

Run a dry run first:

```sh
pnpm media:sync-references
pnpm media:sync-references -- --apply
```

The tool hashes and uploads official character portraits plus canonical world/location artwork, then creates revisioned `together_media_reference_assets` rows. Existing generated requests snapshot asset IDs and revisions, so updating a venue image does not rewrite history.

The sync command requires `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. It never prints either value.

## World and location containment

Every companion image is resolved against the selected companion versions' resident `together_character_world_presence` rows before a provider is called. All subjects in a group image must share that resident world. The stored media world, canonical location, location reference, and world reference are revalidated again when a queued request, edit, or quality retry is rehydrated. A mismatch fails before provider spend.

User setting language is structured rather than passed through as an unrestricted place prompt. Exact authored locations win. Generic concepts such as `pool`, `beach`, `hotel`, `forest`, or `cafe` are ranked only against locations in the resident world using name, category, `possible_activities`, visual/lore context, and optional `metadata.mediaAliases`. For example, an Eos pool request resolves to Foundry Baths. If no same-world setting is established, generation fails closed instead of substituting an Earth location.

When adding a future world:

- Give the world a specific `visual_context`, especially `setting`, `architecture`, `recurringElements`, and `avoid`.
- Describe every location with useful `category`, `possible_activities`, and canonical visual anchors.
- Add `metadata.mediaAliases` only for useful synonyms that cannot be inferred from those authored fields.
- Sync at least one world reference and exact location references for important photo settings.

The provider prompt ends with a hard world/location lock, and the vision quality gate can reject `world_mismatch`, `location_mismatch`, or `earth_leakage`. Keep `KIVELLE_MEDIA_WORLD_QA_REQUIRED=true` in production so an unavailable world verdict retries once and then refunds rather than delivering an unverified environment.

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

The dispatcher reconciles confirmed WaveSpeed requests by provider ID before claiming new work. Webhooks are the primary completion path; polling is the recovery path. Poll claims use `FOR UPDATE SKIP LOCKED`, and finalization has a separate owner token. Confirmed async submissions are excluded from the generic stale-job requeue function.

Images and videos have separate claim capacity. Images use `KIVELLE_IMAGE_MAX_INFLIGHT` (falling back to the legacy `KIVELLE_MEDIA_MAX_INFLIGHT`), while videos default to four global slots through `KIVELLE_VIDEO_MAX_INFLIGHT`. Video claims also honor the persisted route-level limit, user fairness, and queue aging, so a slow MiniMax job cannot occupy every faster route slot.

To inspect without exposing prompts or secrets:

```sql
select provider, route_id, status, count(*)
from together_media_provider_jobs
group by provider, route_id, status;

select status,count(*),min(created_at) as oldest
from together_generated_media
where media_type in ('image','video') and status in ('queued','generating')
group by status;
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
