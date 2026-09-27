# Proactive delivery polish — September 15, 2026

## Behavior
- New account preference defaults to Off. Existing account and companion choices remain intact; free-user restrictions remain.
- Ambient check-ins recheck delivered history before generation and again before insertion. A database trigger serializes candidates per conversation, preventing queued bursts from concurrent workers and protecting older clients.
- Base frequency remains Quiet 36h, Natural 18h, Frequent 8h. Each unanswered check-in doubles the gap; after three, ambient messages pause until a user reply. Replying resets the unanswered count, with the ordinary cooldown still respected.
- Explicit calendar reminders keep their separate opt-in and are exempt from ambient backoff.
- Generation prioritizes the most recent exchange and skips unrelated sources, resolved topics, and repeated questions. Ambient generation failures no longer deliver canned event drafts.
- When the latest message is outside permitted background context, skip rather than revive an older safe exchange. Content scope and NSFW routing are unchanged.

## Validation and deployment
- 23 Deno proactive tests passed, including unanswered backoff, queued delivery, user resumption, recovery and settings changes during generation.
- PGlite database checks passed for defaults, exponential gaps, cap, burst suppression and reply reset.
- Domain suite: 1,124 tests passed. App TypeScript and life-dispatch Deno checks passed.
- Production migration 20260915151434 applied; Off defaults and enabled trigger verified.
- Production functions updated preserving unrelated live bundle code: life-dispatch 176, simulate 165, dialogue 311, call 175, scene-reaction 181, debug 179.
- Behavioral server fix applies immediately to installed mobile builds. Web fallback label updated separately. No new native builds required for enforcement.

Prompt relevance is model-assisted; these changes constrain and suppress unsuitable messages but do not guarantee perfect conversational judgment.
