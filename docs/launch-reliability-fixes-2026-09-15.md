# Launch reliability fixes — September 15, 2026

Scope: launch-review items 1 and 2. No UI, customer pricing, NSFW dialogue routing, or memory-category changes.

## Planner
- Default optional Director model changes from gpt-5-mini to gpt-4.1-mini, a nonreasoning model. An explicit KIVELLE_DIRECTOR_MODEL override still wins and must be checked at rollout.
- Provider deadline reduces from 3,000 to 2,000 ms. With Gemini configured, OpenAI receives at most 1,200 ms, preserving a fallback window. The existing deterministic brief remains the terminal fallback.
- Request JSON output directly; original GPT-5 overrides default to minimal reasoning, and Gemini 2.5 Flash disables thinking for this short task. User-facing dialogue models are untouched.
- Add the documented GPT-4.1 mini token rates to Ops estimation. No customer charge changes.
- Existing consent, danger-mode bypass, user reasoning preference and local cooldown are preserved. This is not a distributed circuit breaker. Telemetry persistence and consent checks are outside the provider deadline.

## Client stability
- Each inbox/direct/group Realtime subscription gets a unique effect-owned topic, so a remount cannot obtain the old subscribed channel while removeChannel is still pending. Existing filters and cleanup remain.
- Dictation serializes microphone starts, checks lifecycle and conversation after async boundaries, and avoids touching the recorder after unmount. Transcripts cannot land in a different conversation. SDK release remains SDK-owned.
- Voice preview results are invalidated on close, unmount, conversation, voice or language changes before touching the player.
- Web asset failures are captured in the capture phase (script load errors do not bubble). Recovery tolerates sessionStorage access denial and native environments without window.location; existing reload cooldown remains.
- Error reports identify web script builds and native build numbers rather than a generic runtime version.

## Verification and limits
903 app tests, 1,144 domain tests, eight Deno backend regressions, app typecheck, Director typecheck and production web export passed. New tests cover a stalled primary followed by successful fallback, subscription ownership through delayed teardown, denied storage, delayed microphone permission/preparation, and rapid taps.

These tests reproduce failure conditions with controlled providers and native-resource mocks. They do not prove actual provider latency or eliminate every cause of unknown-module errors. Measure live planner success/fallback/latency after rollout, reproduce old open tabs across a deployment, and exercise physical Android audio lifecycle. Existing incidents remain open until release-specific verification. No incidents were silently dismissed.

Changes are committed for release; no deployment or new native binary is included in this implementation turn. Existing installed apps will need an updated binary for client fixes.

Sources: https://developers.openai.com/api/docs/models/gpt-4.1-mini ; https://ai.google.dev/gemini-api/docs/thinking ; https://supabase.com/docs/reference/javascript/subscribe .
