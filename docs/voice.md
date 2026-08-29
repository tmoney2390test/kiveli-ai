# Kivelle voice

Kivelle voice is another expression layer over the existing Kivelle conversation. Kivelle remains authoritative for companion identity, relationship state, memories, plans, dates, schedules, scenes, boundaries, and world truth. xAI synthesizes or speaks the canonical content; it does not own a parallel companion record.

## Product access

Access is checked by Supabase Edge Functions, never only by Expo:

| Plan | Voice notes | Live calls |
| --- | --- | --- |
| Kivelle Free | No | Essential or Immersive with Credits |
| Kivelle+ | Yes | Essential or Immersive with Credits |
| Kivelle Max | Yes | Essential or Immersive with Credits |

Live calls have no subscription gate. The call screen exposes a persisted Essential/Immersive selector before microphone capture starts. Both routes spend the account's shared Kivelle Credit balance: Essential costs three Credits per started minute and Immersive costs eight. The stable API/database route IDs remain `standard` and `express` for compatibility.

## Essential and Immersive routes

**Essential** (internal route `standard`) streams PCM through `voice.kivelli.app` to xAI streaming STT, sends final user turns through Grok text dialogue with a stable call prompt-cache key, and streams clauses through xAI TTS. It is intended for long conversations and defaults to three Credits per started minute. The Worker receives a short-lived HMAC credential bound to the user, call, route, and exact configuration. Kivelle's private call context travels inside an authenticated AES-GCM envelope that only the relay can open; Expo receives no cleartext relationship or memory prompt. A per-call SQLite Durable Object enforces one active relay and one use of each credential, preventing one paid call from being replayed into concurrent provider streams. The permanent xAI key remains a Worker secret. Raw audio is forwarded transiently and never stored.

**Immersive** (internal route `express`) preserves the direct native Grok Voice session described below. Route selection is fixed for the life of a call; Kivelle never silently switches providers or content modes mid-call.

Standard is fail-closed until `KIVELLE_XAI_CASCADED_VOICE_ENABLED=true`, the relay URL and shared signing secret are configured, and the Worker has its matching verification secret. Supabase remains authoritative for content eligibility, billing, transcripts, and reconciliation. Cloudflare is only the streaming data plane.

### Provisional unit economics

At measured all-in costs of $0.015, $0.020, $0.025, and $0.030 per Essential minute, the variable provider exposure is:

| Allowance | $0.015/min | $0.020/min | $0.025/min | $0.030/min |
| --- | ---: | ---: | ---: | ---: |
| 500 Plus Credits used on Essential (166 min) | $2.49 | $3.32 | $4.15 | $4.98 |
| 1,200 Max Credits used on Essential (400 min) | $6.00 | $8.00 | $10.00 | $12.00 |

The Max annual plan averages about $33.33 revenue per month before payment fees, text/media usage, and support overhead. Essential and Immersive draw from the same general Credit balance as media. Essential is three Credits per minute and Immersive is eight Credits per minute.

Recommended release progression is `0% -> internal IDs -> 5% -> 25% -> 100%`, with stage latency, refusal rate, interruption waste, transcript accuracy, cost per connected minute, and reconciliation success reviewed at each step. Rollback requires setting the Standard canary or enable flag to zero; existing Express calls and all text chat remain intact.

## xAI configuration

Set permanent credentials only as Supabase Edge Function secrets:

```text
XAI_API_KEY=xai-...
KIVELLE_TTS_PROVIDER=xai
KIVELLE_REALTIME_VOICE_PROVIDER=xai
KIVELLE_XAI_TTS_ENABLED=true
KIVELLE_XAI_REALTIME_VOICE_ENABLED=true
# Legacy chat-route flags stay disabled. They are not required for voice.
KIVELLE_XAI_ENABLED=false
KIVELLE_XAI_EXPLICIT_ENABLED=false
KIVELLE_XAI_TTS_MODEL=xai-text-to-speech
KIVELLE_XAI_REALTIME_VOICE_MODEL=grok-voice-think-fast-2.0
KIVELLE_XAI_VOICE_CANARY_PERCENT=100
KIVELLE_XAI_VOICE_COST_TELEMETRY_ENABLED=true
KIVELLE_XAI_CASCADED_VOICE_ENABLED=false
KIVELLE_XAI_CASCADED_VOICE_CANARY_PERCENT=0
KIVELLE_VOICE_RELAY_URL=wss://voice.kivelli.app/v1/call
KIVELLE_VOICE_RELAY_SIGNING_SECRET=<long-random-value>
KIVELLE_XAI_STREAMING_STT_MODEL=grok-transcribe
KIVELLE_XAI_CASCADE_DIALOGUE_MODEL=grok-4.3
KIVELLE_XAI_STREAMING_TTS_MODEL=xai-text-to-speech
KIVELLE_STANDARD_VOICE_CREDITS_PER_MINUTE=3
KIVELLE_EXPRESS_VOICE_CREDITS_PER_MINUTE=8
```

`KIVELLE_XAI_TTS_MODEL` is a telemetry label. The current xAI TTS REST contract does not accept a selectable model field. Live calls pin the production model `grok-voice-think-fast-2.0`; `grok-voice-latest` is intentionally not used so a provider alias cannot silently change production behavior.

The enable switches fail closed. A canary value of `0` exposes xAI voice to no accounts, `100` exposes it to every otherwise eligible account, and intermediate values select a deterministic cohort from the user ID. Voice is capped at non-sexual romance independently of the retired xAI chat flags. Provider configuration errors do not affect text chat.

No `EXPO_PUBLIC_*` variable contains an xAI secret.

## Voice-note flow

```text
canonical assistant message
  -> prepareCompanionSpeech (delivery-only cleanup)
  -> TextToSpeechProvider registry
  -> XaiTextToSpeechProvider
  -> private Supabase Storage object
  -> temporary signed URL
  -> inline expo-audio player
```

The canonical assistant message is never regenerated or replaced. `prepareCompanionSpeech()` removes markdown and unspoken stage directions, preserves semantically authored vocal cues such as a sigh, and adjusts delivery speed from the stable voice profile. It cannot add facts, actions, promises, escalation, or relationship changes. Metadata retains the canonical text and spoken-text version for private debugging without putting conversational content into generic telemetry.

The TTS adapter uses `POST https://api.x.ai/v1/tts`, requests timestamped JSON audio, and stores MP3 output. Requests time out and retry only transient rate-limit and provider failures. Malformed or policy-invalid requests are not blindly retried. Voice notes cost 2 Credits through 600 canonical characters, 3 through 1,200, and 4 above that. Messages over 2,000 characters use a deterministic, extractive spoken abridgement while the full chat message remains canonical.

Only one inline voice note plays at a time. Leaving Chat releases its player through the Expo hook lifecycle. Failed notes expose Retry, and ready media can refresh an expired signed URL through `media_status` rather than treating the first URL as permanent.

## Stable character voices

`together_character_voice_profiles` is the source of voice identity. An authored mapping has this form:

```json
{
  "xai": "ara"
}
```

The value can also be a future custom xAI voice ID. When a mapping is absent, a centralized deterministic mapper selects an approved built-in voice from the companion's `voice_key` and warmth, softness, energy, and expressiveness. It never makes a random per-request selection. The migration seeds stable mappings without overwriting authored mappings.

Custom voice training is not part of this launch. Adding an already-provisioned custom voice only requires updating `provider_mappings.xai`.

### Per-chat voice selection

Chat Settings can store an optional provider-neutral `voicePreset` in `conversation.metadata.chatPreferences`. Available overrides are scoped to the companion's authored gender signals and validated again by the server:

- feminine: Warm → xAI `ara`, Bright → xAI `eve`
- masculine: Clear → xAI `rex`, Strong → xAI `leo`
- neutral/nonbinary: Balanced → xAI `sal`

Character default preserves the authored `together_character_voice_profiles` mapping. An override affects only that conversation and is consumed by voice notes and realtime calls; it never edits the published character. Chat Settings can synthesize the fixed phrase “Hello there.” as a preview. Preview synthesis is entitlement-checked, rate-limited, cost-tracked, cached in private Storage by character/preset, and never becomes a canonical conversation message. The app also keeps a shorter session cache so reopening the picker does not request another signed link unnecessarily.

## Realtime session and transport

The server calls `POST https://api.x.ai/v1/realtime/client_secrets` with a five-minute connection-credential lifetime. Expo receives only the returned short-lived credential, its expiry, and sanitized session configuration. The permanent xAI key never reaches JavaScript on the device or browser.

The client connects directly to:

```text
wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-2.0
```

using the WebSocket subprotocol `xai-client-secret.<ephemeral-token>`. A token authorizes opening the connection; reconnecting requests a fresh token server-side. xAI session resumption uses the provider conversation ID. Kivelle sends and receives base64 PCM16 little-endian mono audio at 24 kHz over the documented JSON event protocol. Microphone capture and session setup may initialize concurrently, but microphone frames are not transmitted until both local audio and xAI's `session.updated` acknowledgement are ready. The transcription session includes bounded keyterms for the companion, Persona, world, and current place so proper names are recognized more reliably. The client accepts both documented `response.output_audio.*` and `response.audio.*` JSON audio names.

Why direct WebSocket instead of a relay: xAI provides a purpose-built ephemeral client credential, so direct media transport removes an unnecessary audio relay hop while preserving permanent-key secrecy. The provider-neutral `RealtimeVoiceProvider` still owns session creation; a future provider that requires a relay can implement that interface differently.

### Web

Web uses `getUserMedia`, a Web Audio capture/resampling path, and scheduled PCM playback. Mute disables the actual microphone track and stops sending frames. The Audio button controls actual output gain. Browsers do not expose a reliable speaker-versus-earpiece route selector, so the UI does not claim to choose a physical web output route.

### iOS and Android

Native development builds use `@edkimmel/expo-audio-stream` for PCM microphone chunks and its jitter-buffered native playback pipeline. Expo Audio controls the speaker/earpiece route. Mute silences native capture and also gates network sends. Barge-in invalidates buffered companion audio as soon as xAI VAD reports user speech.

This native module is not included in Expo Go. Run `pnpm --filter @together/app prebuild` and use an Expo development build or `expo run:ios` / `expo run:android`. The microphone usage strings and Android recording/audio-settings permissions are declared in `app.config.ts`.

The native capture module can create a temporary local recording as part of its streaming implementation. Kivelle deletes that file on teardown and has no call-audio upload path. Raw microphone or provider audio is not retained for telemetry. iOS declares background audio and Android carries the foreground-service permission supplied by the audio plugin; however, the current native module does not run its own Android foreground service. Calls are reliable while Kivelle is foregrounded, while long Android background calls remain subject to OS process limits and require a future native-service pass before Kivelle should advertise uninterrupted background calling.

## Call lifecycle

The UI and hook use one explicit state machine:

```text
idle -> creating_session -> ringing -> connecting -> connected
                                              |          |
                                              +-> reconnecting
                                                         |
                                      ending -> ended or failed
```

The client handles microphone permission, a connection timeout, two bounded reconnect attempts, credential refresh, provider session resumption, route unmount, background audio, route-aware metering, and idempotent call end. End stops capture and playback, closes the WebSocket, flushes its retryable in-memory transcript outbox in batches, finalizes usage, and asks the Edge Function to reconcile Kivelle continuity. The server accepts up to 24 hours of verified wall duration rather than truncating usage at two hours.

## Context and safety

`buildKivelleConversationContext()` remains the source of call context. The server compacts only the current companion identity and style, Persona, relationship stance, current scene/life state, active Plan or Date, selected memories, open threads, recent conversation, world context, and validated content mode/boundaries.

The realtime instruction tells xAI to speak only as the companion, use short spoken turns, accept interruptions, not expose context, not claim to be Grok, and never make permanent Kivelle changes. Romance, affection, flirting, and non-sexual intimacy are allowed when Kivelle relationship state permits them; sexual or explicit spoken dialogue is not. Historical sexual messages are also refused by voice-note quote, generation, and media-refresh endpoints. Voice does not bypass account preferences, character boundaries, consent logic, credit authorization, feature flags, or the provider route.

## Transcripts and canonical history

Partial transcript events may appear in the live UI but are never canonical. User partials are treated as xAI's cumulative `updated` value; assistant transcript deltas are accumulated for display. Final user and assistant transcript events are serialized to the server, normalized through `normalizeRealtimeTranscriptEvents()`, stored idempotently by stable provider item ID (with sequence/speaker fallback), and then written into `together_messages` with metadata:

```json
{
  "source": "voice_call",
  "callSessionId": "...",
  "providerEventId": "...",
  "voiceSequence": 7,
  "provider": "xai",
  "model": "grok-voice-think-fast-2.0"
}
```

These are records of what happened; they are not replayed through the dialogue model. Chat groups them into one compact `Voice call · N min` event with an expandable transcript.

After final writeback, a bounded reconciliation pass reuses Kivelle's existing analysis, durable-memory, relationship, chemistry, emotional-residue, open-thread, reflection, and summary machinery. xAI never writes those tables directly. Mentioned plans remain pending conversation proposals and go through the same confirmation path as text chat. A connection failure still submits locally finalized turns and finalizes any transcript already received by the server. Returning from the call refreshes both the Kivelle snapshot and the active chat timeline so the compact call row is visible immediately.

## Usage and privacy

`together_voice_usage_events` stores normalized numeric telemetry and IDs. Voice notes record provider, telemetry model, character count, latency, duration-linked media, plan, status, and estimated character cost. Calls record connected/input/output duration, reconnect count, provider/model, plan, status, and estimated audio cost. No prompt, transcript, or raw audio is written to generic telemetry or logs.

The normalized estimates use xAI's documented pinned-model rates: `$15 / 1M` TTS characters and `$0.08 / audio minute sent or received` for `grok-voice-think-fast-2.0`. These are server-side telemetry constants and should be reviewed when changing the pinned provider model.

Realtime calls are available to Free, Plus, and Max accounts. `together_voice_minute_ledger` records every started billable minute idempotently. Essential and Immersive both spend the configured amount from the shared Kivelle Credit balance. Session creation verifies that the account can afford the selected route but does not spend anything. Billing begins only when the server accepts the first finalized user speech turn, so listening to the companion's greeting and ending the call is free. Exact minute boundaries use `ceil(duration / 60 seconds)` from `billing_started_at`; the server reconciles that duration as a backstop without leaving the microphone or call session orphaned.

Standard stage telemetry is stored separately in `together_voice_pipeline_usage_events`: STT milliseconds, cached/uncached Grok tokens, TTS characters, output duration, interruption waste, and stage latency. It contains no prompts, transcript text, or raw audio. Every stage event carries a call-bound HMAC proof created by the relay and verified by the Edge Function, so a modified client cannot forge cost telemetry. Canonical finalized turns continue to use the existing idempotent transcript-event table rather than introducing a second call-history store. Client timing is bounded by server wall time, and provider invoices should be reconciled against these estimates before changing prices.

The Standard relay follows xAI's current streaming contracts: STT is configured with WebSocket query parameters and finalizes a user turn only when `transcript.partial` has `speech_final=true`; TTS voice/PCM settings are supplied at connection time and incremental text uses `text.delta` followed by `text.done`. The relay sets `store=false` on Grok Responses requests and uses a stable per-call `prompt_cache_key`.

Transcripts use private RLS read policies and belong to the same private Kivelle continuity as text. Generated voice notes live in the existing private media bucket and are served with temporary signed URLs. Provider errors are sanitized before returning to the client.

## Provider extension

TTS selection goes through `configuredTextToSpeechProvider()`. A Venice fallback can later implement `TextToSpeechProvider` and be registered as a secondary provider without changing Chat. Realtime remains xAI-only until another provider fully implements `RealtimeVoiceProvider`. Voice code has no dependency on WaveSpeed or Venice image generation.

## Testing and troubleshooting

CI does not call live xAI services. Provider HTTP, event streams, and state transitions are mocked or tested as pure transformations. Relevant checks are:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm edge:typecheck
pnpm web:build
supabase test db
```

If voice capabilities report `not_configured`, verify the permanent secret, provider selector, feature enable flag, and canary percentage. If web microphone access fails, reset site permission. If native reports that a development build is required, rebuild the native app after installing the audio config plugin. If a signed voice-note URL expires, reopening or replaying it requests fresh media state.

The local Supabase database test requires Docker and `supabase start`. The relay can always be checked without provider credentials using `pnpm --filter @kivelle/voice-relay test` and `pnpm --filter @kivelle/voice-relay check`; the latter performs a Wrangler bundle/configuration dry-run and does not deploy.
