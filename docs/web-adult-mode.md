# Private adult text and website media

Kivelle intentionally separates private dialogue eligibility from website media authorization.

Private explicit text is controlled by the shared platform-content policy and `KIVELLE_PRIVATE_ADULT_TEXT_MODE`. It can be used on web, iOS, and Android only when the authenticated profile is adult-eligible, the conversation is private, every current fictional participant is a confirmed adult, the per-conversation boundary is Explicit, and prohibited-content moderation allows the turn. Subscription tier and the website session are not inputs to this text-content decision.

Explicit image and video capabilities remain separate. Native iOS/Android or unverified direct requests may not generate or retrieve explicit media. Existing eligible website media continues to require a gateway-signed web surface, an unexpired HttpOnly website session, current media entitlement/credits, adult eligibility, character eligibility, moderation, and provider-specific flags. Voice keeps its existing non-explicit policy.

## Required server configuration

Keep every item server-side. Do not create an `EXPO_PUBLIC_` adult flag.

- `KIVELLE_PRIVATE_ADULT_TEXT_MODE=off`: `off`, `shadow`, or `on`. Off preserves stored preferences but generates non-explicit dialogue. Shadow records structured eligibility decisions without raw content or explicit generation. On enables eligible private explicit text on all supported surfaces.
- `XAI_API_KEY`, `KIVELLE_XAI_ENABLED=true`, and `KIVELLE_XAI_EXPLICIT_ENABLED=true`: existing explicit-capable dialogue route. Provider flags never override the central policy.
- `OPENAI_API_KEY`: normal dialogue and independent moderation. Missing required moderation fails the adult route closed.
- `WEB_ADULT_MODE_ENABLED=false`: separate website explicit-media kill switch.
- `KIVELLE_SURFACE_SIGNING_SECRET`: same random value of at least 32 bytes in Cloudflare and Supabase Edge secrets; used only to prove a website request for web-only capabilities.
- `KIVELLE_ADULT_MEDIA_ENABLED=false`: independent website adult still-image switch.
- `KIVELLE_ADULT_VIDEO_ENABLED=false`: independent website adult-video switch. It is effective only while `WEB_ADULT_MODE_ENABLED` and `KIVELLE_ADULT_MEDIA_ENABLED` are also enabled. Disabling it stops new adult video submission and prevents queued adult video from being delivered; credits follow the normal failure/refund path.
- Venice/WaveSpeed validation flags and provider keys: existing website-media controls documented in `.env.example`.

Client builds keep separate origins:

- Web: `EXPO_PUBLIC_SUPABASE_WEB_URL=https://kivelli.app/supabase`
- iOS/Android: `EXPO_PUBLIC_SUPABASE_NATIVE_URL=https://mfysnlghlhxxcwnwpxog.supabase.co`

The server records direct native traffic as `native_or_unknown` because the current architecture cryptographically proves web but does not distinguish iOS from Android. This is sufficient for the current capability matrix: both native platforms receive the same private-text rule and the same explicit-media denial. Add platform attestation before introducing a capability that differs between iOS and Android.

## Deployment and rollback

1. Deploy migrations, Edge Functions, and clients while `KIVELLE_PRIVATE_ADULT_TEXT_MODE=off`.
2. Confirm age, character, group-roster, moderation, metadata, report, preview, and native-media tests.
3. Set the flag to `shadow` and inspect only structured policy counts and provider readiness.
4. Set the flag to `on` only after compliance review and production-equivalent reviewer QA.

Rollback private text by setting `KIVELLE_PRIVATE_ADULT_TEXT_MODE=off`. This stops new explicit generation and returns an ineligible/non-explicit projection without deleting canonical conversations or preferences. Roll back website adult video alone with `KIVELLE_ADULT_VIDEO_ENABLED=false`, all website adult media with `KIVELLE_ADULT_MEDIA_ENABLED=false`, or the entire website adult surface with `WEB_ADULT_MODE_ENABLED=false`.

## Age-assurance risk

The current method is `self_declared_dob_v2`: a server-validated birthdate creates durable eligibility timestamps, the exact birthdate is not returned in normal client snapshots or analytics, and every request reloads the authenticated account. It remains self-declaration, is not represented as sufficient for every jurisdiction, and should be replaced or supplemented where stronger assurance is legally required. Account support is the correction path.

See [Mobile private adult-dialogue compliance](./mobile-private-adult-dialogue-compliance.md) for the capability matrix, store declarations, reviewer notes, and complete QA checklist.
