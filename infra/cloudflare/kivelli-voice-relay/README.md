# Kivelle Essential Voice relay

This Worker is the latency-sensitive data plane for Essential Voice (the
stable internal route ID remains `standard`). It keeps
xAI STT and TTS API keys out of Expo, streams microphone PCM to xAI STT, sends
final turns through Grok text dialogue, and streams xAI PCM speech back to the
existing Kivelle audio engine.

Supabase remains authoritative for call creation, content eligibility,
entitlements, billing, canonical transcripts, memories, and relationship
reconciliation. The relay receives a short-lived HMAC credential bound to one
call and one exact client configuration. It never stores raw audio and logs
only identifiers and numeric state.

`VoiceCallGuard`, a SQLite-backed Durable Object sharded by call ID, permits
one active relay session and one use of each short-lived credential. This
prevents a replayed browser credential from multiplying provider streams while
allowing a fresh credential to reconnect after the prior socket releases its
lease. The guard stores token IDs and lease timestamps only. Numeric pipeline
usage events are HMAC-signed by the relay and verified by Supabase before they
are accepted, so the client is a transport for telemetry rather than its trust
boundary.

Required secrets:

```powershell
pnpm exec wrangler secret put XAI_API_KEY
pnpm exec wrangler secret put KIVELLE_VOICE_RELAY_VERIFY_SECRET
```

`KIVELLE_VOICE_RELAY_VERIFY_SECRET` must match the Supabase secret
`KIVELLE_VOICE_RELAY_SIGNING_SECRET`. Use different xAI keys for the app's
control plane and this relay so each can be rotated and limited independently.

Before deploying:

```powershell
pnpm install
pnpm --filter @kivelle/voice-relay types
pnpm --filter @kivelle/voice-relay typecheck
pnpm --filter @kivelle/voice-relay check
```
